import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const CRON_SECRET = process.env.CRON_SECRET || process.env.COORDINATOR_CRON_SECRET;

/**
 * Called by Vercel Cron or external scheduler. Creates one monthly report per company
 * for the previous month. Use same auth as generate-tasks (CRON_SECRET).
 * See docs/COORDINATOR_CRON_SETUP.md.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret');
  const secret = auth?.replace(/^Bearer\s+/i, '') || auth;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const periodTo = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
    const periodFrom = new Date(periodTo.getFullYear(), periodTo.getMonth(), 1);

    const companies = await prisma.coordinatorCompany.findMany({
      select: { id: true },
    });

    const created: string[] = [];
    const title = `تقرير شهري — ${periodFrom.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' })}`;

    for (const company of companies) {
      const report = await prisma.coordinatorReport.create({
        data: {
          title,
          type: 'monthly',
          companyId: company.id,
          periodFrom,
          periodTo,
        },
      });
      created.push(report.id);
    }

    return NextResponse.json({ success: true, created: created.length, reportIds: created });
  } catch (e) {
    console.error('Cron monthly-report:', e);
    return NextResponse.json({ success: false, message: 'Monthly report creation failed' }, { status: 500 });
  }
}
