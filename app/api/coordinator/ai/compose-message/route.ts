import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import OpenAI from 'openai';

/**
 * Phase 3b: AI composer for outreach messages. Improves or expands draft text (Arabic-friendly).
 * Requires OPENAI_API_KEY.
 */
export async function POST(req: NextRequest) {
  try {
    requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'AI composer not configured. Set OPENAI_API_KEY.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const draft = typeof body.draft === 'string' ? body.draft.trim() : '';
    const context = typeof body.context === 'string' ? body.context.trim() : '';

    if (!draft) {
      return NextResponse.json({ success: false, message: 'draft is required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const systemContent =
      'You are a professional Arabic copywriter. Improve or expand the user\'s draft message for professional outreach (LinkedIn, email, etc.). Keep the same intent and tone. Output only the improved message, no explanation. Use clear, polite Arabic (formal or dialect as appropriate).';
    const userContent = context
      ? `Context: ${context}\n\nDraft message to improve:\n${draft}`
      : `Draft message to improve:\n${draft}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      max_tokens: 500,
    });

    const composed = completion.choices[0]?.message?.content?.trim() ?? draft;
    return NextResponse.json({ success: true, composed });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/ai/compose-message:', e);
    return NextResponse.json({ success: false, message: 'AI compose failed' }, { status: 500 });
  }
}
