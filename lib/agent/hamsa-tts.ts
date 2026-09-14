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

/** Strip trailing slash and accidental `/v1` so we never call `/v1/v1/realtime/tts`. */
export function normalizeHamsaBaseUrl(raw: string | null | undefined): string {
  let u = (raw || 'https://api.tryhamsa.com').trim().replace(/\/+$/, '');
  if (u.toLowerCase().endsWith('/v1')) {
    u = u.slice(0, -3).replace(/\/+$/, '');
  }
  return u || 'https://api.tryhamsa.com';
}

function looksLikeWavOrAudio(buf: Buffer, contentType: string): boolean {
  if (!buf.length) return false;
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json') || ct.includes('text/')) return false;
  // JSON error body masquerading as 200
  const head = buf.subarray(0, Math.min(32, buf.length)).toString('utf8').trimStart();
  if (head.startsWith('{') || head.startsWith('<')) return false;
  // RIFF....WAVE
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46
  ) {
    return true;
  }
  if (ct.includes('audio') || ct.includes('octet-stream') || ct.includes('wav')) {
    return buf.length > 44;
  }
  return false;
}

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
    if (!apiKey) {
      console.warn(
        '[hamsa-tts] API key decrypt failed for slug=%s — re-save the Hamsa key in Admin → AI Providers (U_AGENT_SECRETS_KEY may have rotated).',
        row.slug
      );
      return null;
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      apiKey,
      baseUrl: normalizeHamsaBaseUrl(row.baseUrl as string | null),
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
  Array<{
    id: string;
    slug: string;
    name: string;
    speaker: string;
    dialect: string;
    isDefault: boolean;
    keyDecryptable: boolean;
  }>
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
        apiKeyEncrypted: true,
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
        apiKeyEncrypted: string | null;
      }) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        speaker: r.modelFast || 'Lyali',
        dialect: r.modelReason || 'irq',
        isDefault: r.isDefault,
        keyDecryptable: !!decryptSecret(r.apiKeyEncrypted),
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
      message:
        'Hamsa TTS not configured or API key unreadable. Re-add the HAMSA voice API key in Admin → AI Providers.',
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
  // Docs use Bearer; keep Token as a fallback for older keys.
  const authHeaders = [`Bearer ${cfg.apiKey}`, `Token ${cfg.apiKey}`];

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
      if (!looksLikeWavOrAudio(buf, ct)) {
        const snippet = buf.subarray(0, 120).toString('utf8');
        lastErr = `Hamsa TTS returned non-audio body (${ct || 'no CT'}): ${snippet.slice(0, 160)}`;
        console.warn('[hamsa-tts]', lastErr);
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
