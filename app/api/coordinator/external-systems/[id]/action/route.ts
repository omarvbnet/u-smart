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

    return NextResponse.json(
      { success: false, message: 'Action failed after retries', error: lastError },
      { status: 500 }
    );
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/external-systems/[id]/action:', e);
    return NextResponse.json({ success: false, message: 'Failed to run action' }, { status: 500 });
  }
}

async function executeSystemAction(
  type: string,
  _configEnc: string | null,
  _action: string,
  _payload: unknown
): Promise<void> {
  switch (type) {
    case 'API':
      // TODO: decrypt config, call external API
      throw new Error('API integration not configured yet');
    case 'PLAYWRIGHT':
      // TODO: run browser automation
      throw new Error('Playwright integration not configured yet');
    case 'OAUTH2':
      // TODO: refresh token, call OAuth2 API
      throw new Error('OAuth2 integration not configured yet');
    default:
      throw new Error(`Unsupported system type: ${type}`);
  }
}
