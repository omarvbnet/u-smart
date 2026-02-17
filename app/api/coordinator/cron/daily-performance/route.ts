import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCoordinatorNotification } from '@/lib/coordinator/notifications';
import { CoordinatorRole } from '@prisma/client';

const CRON_SECRET = process.env.CRON_SECRET || process.env.COORDINATOR_CRON_SECRET;

/**
 * GET: Called by cron. Creates a daily report per company and notifies all admins
 * with team performance summary (task counts + KPI status). Same auth as other cron routes.
 * POST: Admin-only, same logic for current company (trigger "daily performance" now).
 */
async function buildDailySummary(companyId: string): Promise<{ reportId: string; summary: string }> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [taskCounts, kpis, report] = await Promise.all([
    prisma.coordinatorTask.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { id: true },
    }),
    prisma.coordinatorKPI.findMany({
      where: { companyId },
      select: { name: true, actualValue: true, targetValue: true, status: true },
    }),
    prisma.coordinatorReport.create({
      data: {
        title: `أداء يومي — ${todayStart.toLocaleDateString('ar-IQ', { dateStyle: 'long' })}`,
        type: 'daily',
        companyId,
        periodFrom: todayStart,
        periodTo: new Date(todayEnd.getTime() - 1),
      },
    }),
  ]);

  const totalTasks = taskCounts.reduce((s, g) => s + g._count.id, 0);
  const pending = taskCounts.find((g) => g.status === 'PENDING')?._count.id ?? 0;
  const inProgress = taskCounts.find((g) => g.status === 'IN_PROGRESS')?._count.id ?? 0;
  const completed = taskCounts.find((g) => g.status === 'COMPLETED')?._count.id ?? 0;
  const atRisk = kpis.filter((k) => k.status === 'AT_RISK').length;
  const failed = kpis.filter((k) => k.status === 'FAILED').length;

  let summary = `ملخص الأداء اليومي: إجمالي المهام ${totalTasks} (معلقة: ${pending}, قيد التنفيذ: ${inProgress}, مكتملة: ${completed}). مؤشرات الأداء: ${kpis.length} (في خطر: ${atRisk}, فشل: ${failed}).`;
  if (atRisk > 0 || failed > 0) {
    summary += ' يرجى مراجعة المؤشرات والتصعيد إن لزم.';
  }
  return { reportId: report.id, summary };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret');
  const secret = auth?.replace(/^Bearer\s+/i, '') || auth;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companies = await prisma.coordinatorCompany.findMany({ select: { id: true } });
    const results: { companyId: string; reportId: string }[] = [];

    for (const company of companies) {
      const { reportId, summary } = await buildDailySummary(company.id);
      results.push({ companyId: company.id, reportId });

      const admins = await prisma.coordinatorUser.findMany({
        where: { companyId: company.id, role: CoordinatorRole.ADMIN },
        select: { id: true },
      });
      for (const admin of admins) {
        await createCoordinatorNotification({
          userId: admin.id,
          title: 'ملخص الأداء اليومي',
          body: summary,
          channel: 'in_app',
          linkUrl: `/coordinator/reports`,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, notified: results.length, results });
  } catch (e) {
    console.error('Cron daily-performance:', e);
    return NextResponse.json({ success: false, message: 'Daily performance failed' }, { status: 500 });
  }
}

/** POST: Admin-only. Generate daily performance for current company and notify admins. */
export async function POST(req: NextRequest) {
  try {
    const { requireCoordinatorRole } = await import('@/lib/coordinator/rbac');
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
    const { reportId, summary } = await buildDailySummary(payload.companyId);

    const admins = await prisma.coordinatorUser.findMany({
      where: { companyId: payload.companyId, role: CoordinatorRole.ADMIN },
      select: { id: true },
    });
    for (const admin of admins) {
      await createCoordinatorNotification({
        userId: admin.id,
        title: 'ملخص الأداء اليومي',
        body: summary,
        channel: 'in_app',
        linkUrl: `/coordinator/reports`,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, reportId, summary });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/cron/daily-performance:', e);
    return NextResponse.json({ success: false, message: 'Failed' }, { status: 500 });
  }
}
