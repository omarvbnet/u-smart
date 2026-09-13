import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { checkAgentRateLimit } from '@/lib/agent/rate-limit';
import { runAgentMessage } from '@/lib/agent/core/run';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const rate = checkAgentRateLimit(`agent:${auth.ctx.userId}`);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: 'Too many U Agent requests. Please wait a moment.',
        retryAfterMs: rate.retryAfterMs,
      },
      { status: 429 }
    );
  }

  let body: {
    text?: string;
    conversationId?: string;
    attachmentUrls?: string[];
    attachments?: Array<{
      url: string;
      name?: string;
      contentType?: string;
      size?: number;
    }>;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ success: false, message: 'text is required' }, { status: 400 });
  }

  try {
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.filter((a) => a && typeof a.url === 'string')
      : undefined;
    const result = await runAgentMessage({
      ctx: auth.ctx,
      capabilities: auth.capabilities,
      policy: auth.policy,
      text,
      conversationId: body.conversationId,
      attachmentUrls: Array.isArray(body.attachmentUrls)
        ? body.attachmentUrls.filter((u): u is string => typeof u === 'string')
        : undefined,
      attachments,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error('POST /api/agent/message:', e);
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'U Agent failed',
      },
      { status: 500 }
    );
  }
}
