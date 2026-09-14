/**
 * Hamsa realtime TTS (https://api.tryhamsa.com/v1/realtime/tts).
 * Env: HAMSA_API_KEY (required), HAMSA_TTS_SPEAKER (default Lyali), HAMSA_TTS_DIALECT (default irq).
 */

export function isHamsaTtsConfigured(): boolean {
  return !!process.env.HAMSA_API_KEY?.trim();
}

export function defaultHamsaSpeaker(): string {
  return process.env.HAMSA_TTS_SPEAKER?.trim() || 'Lyali';
}

export function defaultHamsaDialect(): string {
  return process.env.HAMSA_TTS_DIALECT?.trim() || 'irq';
}

export async function synthesizeHamsaSpeech(opts: {
  text: string;
  speaker?: string;
  dialect?: string;
  expressiveness?: number;
}): Promise<{ ok: true; audio: Buffer; contentType: string } | { ok: false; message: string }> {
  const apiKey = process.env.HAMSA_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: 'HAMSA_API_KEY is not configured' };
  }
  const text = opts.text.trim().slice(0, 2500);
  if (!text) return { ok: false, message: 'text is required' };

  const speaker = (opts.speaker || defaultHamsaSpeaker()).trim() || 'Lyali';
  const dialect = (opts.dialect || defaultHamsaDialect()).trim() || 'irq';
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

  // OpenAPI says `Token <key>`; quickstart also shows Bearer — try Token first.
  const authHeaders = [`Token ${apiKey}`, `Bearer ${apiKey}`];

  let lastErr = 'Hamsa TTS failed';
  for (const auth of authHeaders) {
    try {
      const res = await fetch('https://api.tryhamsa.com/v1/realtime/tts', {
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
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'Hamsa TTS network error';
    }
  }
  return { ok: false, message: lastErr };
}
