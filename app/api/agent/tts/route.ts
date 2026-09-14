import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { checkAgentRateLimit } from '@/lib/agent/rate-limit';
import {
  isHamsaTtsConfigured,
  listHamsaTtsVoices,
  synthesizeHamsaSpeech,
} from '@/lib/agent/hamsa-tts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/agent/tts — Hamsa realtime TTS from Admin-configured voices. */
export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const rate = checkAgentRateLimit(`agent-tts:${auth.ctx.userId}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, message: 'Too many TTS requests', retryAfterMs: rate.retryAfterMs },
      { status: 429 }
    );
  }

  if (!(await isHamsaTtsConfigured())) {
    return NextResponse.json(
      {
        success: false,
        message: 'Hamsa TTS not configured. Admin must add a HAMSA voice under AI Providers.',
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: {
    text?: string;
    speaker?: string;
    dialect?: string;
    voiceSlug?: string;
    expressiveness?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ success: false, message: 'text is required' }, { status: 400 });
  }

  const result = await synthesizeHamsaSpeech({
    text,
    speaker: typeof body.speaker === 'string' ? body.speaker : undefined,
    dialect: typeof body.dialect === 'string' ? body.dialect : undefined,
    voiceSlug: typeof body.voiceSlug === 'string' ? body.voiceSlug : undefined,
    expressiveness: typeof body.expressiveness === 'number' ? body.expressiveness : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(result.audio), {
    status: 200,
    headers: {
      'Content-Type': result.contentType || 'audio/wav',
      'Cache-Control': 'no-store',
      'X-Hamsa-Speaker': result.speaker,
      'X-Hamsa-Dialect': result.dialect,
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  const voices = await listHamsaTtsVoices();
  return NextResponse.json({
    success: true,
    configured: voices.length > 0,
    voices,
    speaker: voices[0]?.speaker ?? null,
    dialect: voices[0]?.dialect ?? null,
  });
}
