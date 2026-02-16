import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const list = await prisma.coordinatorJobResult.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({
      success: true,
      results: list.map((r) => ({
        id: r.id,
        keyword: r.keyword,
        source: r.source,
        rawResult: r.rawResult,
        extractedSkills: r.extractedSkills,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/job-results:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    if (!keyword) return NextResponse.json({ success: false, message: 'keyword is required' }, { status: 400 });
    const source = typeof body.source === 'string' ? body.source.trim() || null : null;
    const rawResult = body.rawResult != null && typeof body.rawResult === 'object' ? (body.rawResult as Prisma.InputJsonValue) : undefined;
    const extractedSkills = Array.isArray(body.extractedSkills) ? (body.extractedSkills as string[]).filter((s): s is string => typeof s === 'string') : [];
    const result = await prisma.coordinatorJobResult.create({
      data: { companyId: payload.companyId, keyword, source, rawResult: rawResult ?? undefined, extractedSkills },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'job_result_create',
      resource: 'job_result',
      resourceId: result.id,
      payload: { keyword: result.keyword },
      ip: getClientIp(req),
    });
    return NextResponse.json({
      success: true,
      result: { id: result.id, keyword: result.keyword, source: result.source, extractedSkills: result.extractedSkills, createdAt: result.createdAt },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/job-results:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
