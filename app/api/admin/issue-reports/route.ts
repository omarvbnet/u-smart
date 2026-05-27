import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return null;
  return true;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status');
  const typeId = sp.get('typeId');
  const where: any = {};
  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (typeId) where.typeId = typeId;
  try {
    const reports = await prisma.issueReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        type: { select: { id: true, slug: true, label: true } },
        requester: {
          select: {
            id: true,
            name: true,
            username: true,
            phone: true,
            role: true,
            email: true,
            preferredLocale: true,
            photoUrl: true,
          },
        },
        handledBy: {
          select: { id: true, name: true, username: true },
        },
      },
    });
    return NextResponse.json({
      success: true,
      reports: reports.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        adminNote: r.adminNote ?? null,
        typeId: r.typeId,
        typeLabel: r.type?.label ?? r.typeLabel ?? null,
        attachmentUrls: Array.isArray(r.attachmentUrls) ? r.attachmentUrls : [],
        appVersion: r.appVersion ?? null,
        platform: r.platform ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        handledAt: r.handledAt,
        requester: r.requester,
        handledBy: r.handledBy ?? null,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/issue-reports:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load reports' },
      { status: 500 }
    );
  }
}
