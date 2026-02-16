import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const list = await prisma.coordinatorGeneratedApplication.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({
      success: true,
      applications: list.map((a) => ({
        id: a.id,
        userId: a.userId,
        jobResultId: a.jobResultId,
        cvUrl: a.cvUrl,
        coverLetterUrl: a.coverLetterUrl,
        createdAt: a.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/generated-applications:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const jobResultId = typeof body.jobResultId === 'string' ? body.jobResultId.trim() || null : null;
    const cvUrl = typeof body.cvUrl === 'string' ? body.cvUrl.trim() || null : null;
    const coverLetterUrl = typeof body.coverLetterUrl === 'string' ? body.coverLetterUrl.trim() || null : null;
    const app = await prisma.coordinatorGeneratedApplication.create({
      data: { companyId: payload.companyId, userId: payload.sub, jobResultId, cvUrl, coverLetterUrl },
    });
    return NextResponse.json({
      success: true,
      application: { id: app.id, jobResultId: app.jobResultId, cvUrl: app.cvUrl, coverLetterUrl: app.coverLetterUrl, createdAt: app.createdAt },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/generated-applications:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
