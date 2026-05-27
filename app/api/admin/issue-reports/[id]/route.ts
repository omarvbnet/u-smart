import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;
type Status = (typeof VALID)[number];

const STATUS_AR: Record<Status, string> = {
  PENDING: 'قيد الانتظار',
  IN_PROGRESS: 'قيد المعالجة',
  COMPLETED: 'مكتمل',
  REJECTED: 'مرفوض',
};
const STATUS_TR: Record<Status, string> = {
  PENDING: 'beklemede',
  IN_PROGRESS: 'işlemde',
  COMPLETED: 'tamamlandı',
  REJECTED: 'reddedildi',
};
const STATUS_KU: Record<Status, string> = {
  PENDING: 'لە چاوەڕوانیدا',
  IN_PROGRESS: 'لە جێبەجێکردندا',
  COMPLETED: 'تەواوبووە',
  REJECTED: 'ڕەتکراوەتەوە',
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const { id } = await ctx.params;
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }
  const rawStatus = String(body?.status ?? '').toUpperCase();
  const adminNoteRaw = body?.adminNote != null ? String(body.adminNote).trim() : null;

  const data: any = {};
  if (rawStatus) {
    if (!VALID.includes(rawStatus as Status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }
    data.status = rawStatus;
    if (rawStatus === 'COMPLETED' || rawStatus === 'REJECTED') {
      data.handledAt = new Date();
    }
  }
  if (adminNoteRaw != null) {
    data.adminNote = adminNoteRaw.length === 0 ? null : adminNoteRaw.slice(0, 4000);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'Nothing to update' }, { status: 400 });
  }

  try {
    const existing = await prisma.issueReport.findUnique({
      where: { id },
      select: { id: true, requesterId: true, status: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    const updated = await prisma.issueReport.update({
      where: { id },
      data,
      include: {
        type: { select: { id: true, slug: true, label: true } },
        requester: { select: { id: true, name: true, username: true, preferredLocale: true } },
      },
    });

    if (data.status && data.status !== existing.status) {
      const status = data.status as Status;
      notifyRequesterI18n({
        prisma,
        type: 'issue_report_status',
        requesterId: existing.requesterId,
        ticketId: null,
        payload: {
          key: 'issue_report_status',
          vars: {
            title: existing.title,
            status,
            statusAr: STATUS_AR[status],
            statusTr: STATUS_TR[status],
            statusKu: STATUS_KU[status],
          },
        },
        data: { reportId: existing.id, status },
      }).catch((e) => console.error('issue_report_status notify:', e));
    }

    return NextResponse.json({ success: true, report: updated });
  } catch (err) {
    console.error('PATCH /api/admin/issue-reports/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update report' },
      { status: 500 }
    );
  }
}
