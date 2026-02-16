import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

/**
 * Server-side transcription (OpenAI Whisper) for coordinator voice.
 * Accepts JSON: { audioBase64?: string, audioUrl?: string }.
 * Requires OPENAI_API_KEY. Supports Iraqi Arabic and other languages via Whisper.
 */
export async function POST(req: NextRequest) {
  try {
    requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    throw e;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        message: 'Server-side transcription is not configured. Set OPENAI_API_KEY to use Whisper.',
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: { audioBase64?: string; audioUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() || undefined : undefined;
  if (!audioBase64 && !audioUrl) {
    return NextResponse.json(
      { success: false, message: 'Provide audioBase64 or audioUrl' },
      { status: 400 }
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    let buffer: Buffer;
    if (audioBase64) {
      buffer = Buffer.from(audioBase64, 'base64');
    } else if (audioUrl) {
      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error('Failed to fetch audio URL');
      const arr = await res.arrayBuffer();
      buffer = Buffer.from(arr);
    } else {
      return NextResponse.json({ success: false, message: 'Provide audioBase64 or audioUrl' }, { status: 400 });
    }

    const file = await toFile(buffer, 'audio.webm', { type: 'audio/webm' });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ar',
      response_format: 'verbose_json',
    });

    const text = transcription.text ?? '';
    const verbose = transcription as { language?: string; duration?: number };
    const language = verbose.language ?? undefined;
    const duration = verbose.duration ?? undefined;

    return NextResponse.json({
      success: true,
      transcript: text,
      detectedLanguage: language,
      duration,
    });
  } catch (err: unknown) {
    console.error('POST /api/coordinator/voice/transcribe:', err);
    return NextResponse.json(
      { success: false, message: 'Transcription failed' },
      { status: 500 }
    );
  }
}
