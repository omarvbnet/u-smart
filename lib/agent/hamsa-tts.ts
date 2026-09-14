import { prisma as _prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/agent/providers/secrets';
import { invalidateAiProviderCache } from '@/lib/agent/providers/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type HamsaTtsConfig = {
  id: string;
  slug: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  speaker: string;
  dialect: string;
  isDefault: boolean;
};

/**
 * Resolve Hamsa TTS from Admin → AI Providers (kind=HAMSA).
 * modelFast = speaker (e.g. Lyali), modelReason = dialect (e.g. irq).
 * No env vars — configure in admin only.
 */
export async function resolveHamsaTtsConfig(
  preferredSlug?: string | null
): Promise<HamsaTtsConfig | null> {
  if (!prisma.uAgentAiProvider?.findMany) return null;
  try {
    const rows = await prisma.uAgentAiProvider.findMany({
      where: { kind: 'HAMSA', enabled: true },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });
    if (!rows?.length) return null;

    let row = preferredSlug
      ? rows.find((r: { slug: string }) => r.slug === preferredSlug) || rows[0]
      : rows[0];
    if (!row) return null;

    const apiKey = decryptSecret(row.apiKeyEncrypted as string | null);
    if (!apiKey) return null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      apiKey,
      baseUrl: (row.baseUrl as string | null)?.replace(/\/$/, '') || 'https://api.tryhamsa.com',
      speaker: (row.modelFast as string | null)?.trim() || 'Lyali',
      dialect: (row.modelReason as string | null)?.trim() || 'irq',
      isDefault: row.isDefault === true,
    };
  } catch (e) {
    console.error('resolveHamsaTtsConfig:', e);
    return null;
  }
}

export async function listHamsaTtsVoices(): Promise<
  Array<{ id: string; slug: string; name: string; speaker: string; dialect: string; isDefault: boolean }>
> {
  if (!prisma.uAgentAiProvider?.findMany) return [];
  try {
    const rows = await prisma.uAgentAiProvider.findMany({
      where: { kind: 'HAMSA', enabled: true },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        modelFast: true,
        modelReason: true,
        isDefault: true,
      },
    });
    return (rows || []).map(
      (r: {
        id: string;
        slug: string;
        name: string;
        modelFast: string | null;
        modelReason: string | null;
        isDefault: boolean;
      }) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        speaker: r.modelFast || 'Lyali',
        dialect: r.modelReason || 'irq',
        isDefault: r.isDefault,
      })
    );
  } catch {
    return [];
  }
}

export async function isHamsaTtsConfigured(): Promise<boolean> {
  const cfg = await resolveHamsaTtsConfig();
  return !!cfg;
}

export async function synthesizeHamsaSpeech(opts: {
  text: string;
  speaker?: string;
  dialect?: string;
  voiceSlug?: string;
  expressiveness?: number;
}): Promise<
  | { ok: true; audio: Buffer; contentType: string; speaker: string; dialect: string }
  | { ok: false; message: string }
> {
  const cfg = await resolveHamsaTtsConfig(opts.voiceSlug);
  if (!cfg) {
    return {
      ok: false,
      message: 'Hamsa TTS not configured. Add a HAMSA voice in Admin → AI Providers.',
    };
  }

  const text = opts.text.trim().slice(0, 2500);
  if (!text) return { ok: false, message: 'text is required' };

  const speaker = (opts.speaker || cfg.speaker).trim() || 'Lyali';
  const dialect = (opts.dialect || cfg.dialect).trim() || 'irq';
  const expressiveness =
    typeof opts.expressiveness === 'number' && opts.expressiveness >= 0 && opts.expressiveness <= 2
      ? opts.expressiveness
      : 1;

  const body = {
    text,
    speaker,
    dialect,
    mulaw: false,
    expressiveness,
  };

  const endpoint = `${cfg.baseUrl}/v1/realtime/tts`;
  const authHeaders = [`Token ${cfg.apiKey}`, `Bearer ${cfg.apiKey}`];

  let lastErr = 'Hamsa TTS failed';
  for (const auth of authHeaders) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          Accept: 'audio/wav, application/octet-stream, */*',
        },
        body: JSON.stringify(body),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastErr = `Hamsa TTS ${res.status}: ${errText.slice(0, 200) || res.statusText}`;
        if (res.status === 401 || res.status === 403) continue;
        return { ok: false, message: lastErr };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        lastErr = 'Hamsa TTS returned empty audio';
        continue;
      }
      return {
        ok: true,
        audio: buf,
        contentType: ct.includes('audio') ? ct.split(';')[0]!.trim() : 'audio/wav',
        speaker,
        dialect,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'Hamsa TTS network error';
    }
  }
  return { ok: false, message: lastErr };
}

/** Call after admin saves Hamsa rows so TTS config refreshes with AI cache. */
export function invalidateHamsaTtsCache(): void {
  invalidateAiProviderCache();
}
