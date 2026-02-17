import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

const MAX_RETRIES = 3;

/**
 * Execute an action for an external system. Logs to SystemActionLog with retry count.
 * Actual integration (API call, Playwright, OAuth2) is placeholder - implement per system type.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id: systemId } = await params;
    const system = await prisma.coordinatorExternalSystem.findFirst({
      where: { id: systemId, companyId: payload.companyId },
    });
    if (!system) {
      return NextResponse.json({ success: false, message: 'System not found' }, { status: 404 });
    }

    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action : 'run';
    const payload_data = body.payload ?? null;

    let lastError: string | null = null;
    let retryCount = 0;

    for (let i = 0; i <= MAX_RETRIES; i++) {
      retryCount = i;
      try {
        await executeSystemAction(system.type, system.configEnc, action, payload_data);
        await prisma.coordinatorSystemActionLog.create({
          data: {
            systemId: system.id,
            action,
            status: 'success',
            retryCount: i,
            payload: payload_data ?? undefined,
          },
        });
        await logAudit({
          companyId: payload.companyId,
          userId: payload.sub,
          action: 'system_action',
          resource: 'external_system',
          resourceId: system.id,
          payload: { action, status: 'success', retryCount: i },
          ip: getClientIp(req),
        });
        return NextResponse.json({ success: true, message: 'Action completed', retryCount: i });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (i < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    await prisma.coordinatorSystemActionLog.create({
      data: {
        systemId: system.id,
        action,
        status: 'failure',
        retryCount,
        errorMessage: lastError,
        payload: payload_data ?? undefined,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'system_action',
      resource: 'external_system',
      resourceId: system.id,
      payload: { action, status: 'failure', retryCount, error: lastError },
      ip: getClientIp(req),
    });

    const errMsg = lastError ?? '';
    const isNotImplemented =
      errMsg.toLowerCase().includes('not configured') ||
      errMsg.toLowerCase().includes('not implemented');
    return NextResponse.json(
      {
        success: false,
        message: isNotImplemented ? 'Integration not configured yet' : 'Action failed after retries',
        error: lastError,
      },
      { status: isNotImplemented ? 501 : 500 }
    );
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/external-systems/[id]/action:', e);
    return NextResponse.json({ success: false, message: 'Failed to run action' }, { status: 500 });
  }
}

const API_REQUEST_TIMEOUT_MS = 30_000;

type ApiConfig = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

function parseApiConfig(configEnc: string | null): ApiConfig | null {
  if (!configEnc || typeof configEnc !== 'string') return null;
  const raw = configEnc.trim();
  if (!raw) return null;
  try {
    let json: unknown;
    if (raw.startsWith('{')) {
      json = JSON.parse(raw) as unknown;
    } else {
      try {
        json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as unknown;
      } catch {
        return null;
      }
    }
    if (json && typeof json === 'object' && 'url' in json && typeof (json as ApiConfig).url === 'string') {
      const c = json as ApiConfig;
      return {
        url: c.url,
        method: typeof c.method === 'string' ? c.method.toUpperCase() : 'GET',
        headers: c.headers && typeof c.headers === 'object' ? (c.headers as Record<string, string>) : undefined,
        body: c.body,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function executeSystemAction(
  type: string,
  configEnc: string | null,
  action: string,
  payload: unknown
): Promise<void> {
  switch (type) {
    case 'API': {
      const config = parseApiConfig(configEnc);
      if (!config) {
        throw new Error('API integration not configured yet: add config with url (and optional method, headers, body)');
      }
      const url = config.url.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Invalid API config: url must be http or https');
      }
      const method = (config.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {
        ...(config.headers ?? {}),
      };
      if (payload && typeof payload === 'object' && payload !== null && 'headers' in payload) {
        const extra = (payload as { headers?: Record<string, string> }).headers;
        if (extra && typeof extra === 'object') {
          Object.assign(headers, extra);
        }
      }
      let body: string | undefined;
      if (payload && typeof payload === 'object' && payload !== null && 'body' in payload) {
        const b = (payload as { body?: unknown }).body;
        body = typeof b === 'string' ? b : JSON.stringify(b);
      } else if (config.body !== undefined && method !== 'GET') {
        body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`External API returned ${res.status}: ${text.slice(0, 200)}`);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error) {
          if (e.name === 'AbortError') throw new Error('Request timed out');
          throw e;
        }
        throw e;
      }
      return;
    }
    case 'PLAYWRIGHT':
      throw new Error('Playwright integration not configured yet');
    case 'OAUTH2':
      throw new Error('OAuth2 integration not configured yet');
    default:
      throw new Error(`Unsupported system type: ${type}`);
  }
}
