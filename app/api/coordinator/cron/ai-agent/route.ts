import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAiProcessForTask } from '@/lib/coordinator/ai-task-process';

const CRON_SECRET = process.env.CRON_SECRET || process.env.COORDINATOR_CRON_SECRET;

/**
 * GET: Cron. Find tasks with coordinatorFeedback and aiProcessedAt = null, run AI for each (update status, send WhatsApp).
 * No human activity required. Secure with CRON_SECRET / COORDINATOR_CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret');
  const secret = auth?.replace(/^Bearer\s+/i, '') || auth;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tasks = await prisma.coordinatorTask.findMany({
      where: {
        coordinatorFeedback: { not: null },
        aiProcessedAt: null,
      },
      select: { id: true, companyId: true, coordinatorFeedback: true },
    });

    const results: { taskId: string; success: boolean; replySent?: boolean; error?: string }[] = [];
    for (const t of tasks) {
      if (!t.coordinatorFeedback || t.coordinatorFeedback.trim().length < 3) continue;
      const result = await runAiProcessForTask(t.id, t.companyId);
      results.push({
        taskId: t.id,
        success: result.success,
        replySent: result.replySent,
        error: result.error,
      });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (e) {
    console.error('GET /api/coordinator/cron/ai-agent:', e);
    return NextResponse.json({ success: false, message: 'Cron failed' }, { status: 500 });
  }
}
