import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { buildCompanyContext, contextToPromptText } from '@/lib/coordinator/ai-context';
import { CoordinatorRole } from '@prisma/client';
import OpenAI from 'openai';

/**
 * POST: AI agent that can read ALL company data and give feedback.
 * Body: { query?: string } - optional question or focus (e.g. "ما أولوياتي اليوم؟")
 * Returns: summary, recommendations, and answer based on full system data.
 * Does not modify data; read-only feedback.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const companyId = payload.companyId;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'AI agent not configured. Set OPENAI_API_KEY.' },
        { status: 503 }
      );
    }

    const ctx = await buildCompanyContext(companyId);
    const contextText = contextToPromptText(ctx);

    let body: { query?: string } = {};
    try {
      body = await req.json().catch(() => ({}));
    } catch {
      // no body
    }
    const userQuery = typeof body.query === 'string' ? body.query.trim() : '';

    const openai = new OpenAI({ apiKey });
    const systemPrompt = `You are an AI coordinator agent with full read access to the coordinator system. You know each data type and answer accordingly. You can READ all data; you do not write from this endpoint (writes happen automatically when tasks are processed).

Data you READ (per company):
- Tasks: counts by status/source/priority, recent tasks with titles and whether they have feedback or WhatsApp reply-to
- KPIs: list with actual vs target and status (ON_TRACK, AT_RISK, FAILED)
- Reports: recent report titles and types
- Audit: recent actions (task_create, task_update, task_ai_process, etc.)
- Voice: call records (last 7 days), voice logs count
- Job duty templates count, social accounts

Respond in Arabic. Output a single JSON object with these keys (all strings, can be multi-line):
- "summary": Brief overview of the current situation (المهام، المؤشرات، النشاط الأخير).
- "recommendations": Actionable recommendations (ما يجب فعله أولاً، أي مهام تحتاج متابعة، أي مؤشرات تحتاج انتباها).
- "answer": If the user asked a specific question (query), answer it based on the data. Otherwise repeat or expand the summary.`;

    const userContent = userQuery
      ? `System data:\n${contextText}\n\nUser question or focus: ${userQuery}\n\nOutput JSON with summary, recommendations, answer.`
      : `System data:\n${contextText}\n\nNo specific question. Provide summary and recommendations. Output JSON with summary, recommendations, and set answer to the same as summary.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let summary = '';
    let recommendations = '';
    let answer = '';

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      recommendations = typeof parsed.recommendations === 'string' ? parsed.recommendations.trim() : '';
      answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : summary;
    } catch {
      summary = raw;
      recommendations = '';
      answer = raw;
    }

    return NextResponse.json({
      success: true,
      summary: summary || raw,
      recommendations: recommendations || undefined,
      answer: answer || summary || raw,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/ai/agent:', e);
    return NextResponse.json({ success: false, message: 'AI agent failed' }, { status: 500 });
  }
}
