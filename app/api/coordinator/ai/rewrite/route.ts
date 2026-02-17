import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import OpenAI from 'openai';

/**
 * Phase 3b: AI rewrite for CV or cover letter. Uses OpenAI to improve text; optionally
 * tailors to job description. Requires OPENAI_API_KEY.
 */
export async function POST(req: NextRequest) {
  try {
    requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'AI rewrite not configured. Set OPENAI_API_KEY.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const type = body.type === 'cover' ? 'cover' : 'cv';
    const jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription.trim() : '';

    if (!text) {
      return NextResponse.json({ success: false, message: 'text is required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const systemContent =
      type === 'cv'
        ? 'You are an expert career coach. Rewrite the given CV/resume text to be more professional, clear, and impactful. Keep the same facts; improve wording and structure. Output only the rewritten text, no preamble. Use Arabic if the input is in Arabic.'
        : 'You are an expert career coach. Rewrite the given cover letter to be more professional and compelling. Keep the same intent; improve wording. If a job description is provided, tailor the letter to it. Output only the rewritten text. Use Arabic if the input is in Arabic.';
    const userContent = jobDescription
      ? `Job description (optional context):\n${jobDescription}\n\nText to rewrite:\n${text}`
      : `Text to rewrite:\n${text}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
    });

    const rewritten = completion.choices[0]?.message?.content?.trim() ?? text;
    return NextResponse.json({ success: true, text: rewritten });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/ai/rewrite:', e);
    return NextResponse.json({ success: false, message: 'AI rewrite failed' }, { status: 500 });
  }
}
