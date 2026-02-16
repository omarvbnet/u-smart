import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole, ExternalSystemType } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const systems = await prisma.coordinatorExternalSystem.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { actionLogs: true } },
      },
    });
    return NextResponse.json({
      success: true,
      systems: systems.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        companyId: s.companyId,
        createdAt: s.createdAt,
        configEnc: s.configEnc ? '[encrypted]' : null,
        actionLogCount: s._count.actionLogs,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/external-systems:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch systems' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const type = body.type === 'API' || body.type === 'PLAYWRIGHT' || body.type === 'OAUTH2' ? body.type : 'API';

    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }

    const system = await prisma.coordinatorExternalSystem.create({
      data: {
        name,
        type: type as ExternalSystemType,
        companyId: payload.companyId,
        configEnc: typeof body.configEnc === 'string' ? body.configEnc : null,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'system_create',
      resource: 'external_system',
      resourceId: system.id,
      payload: { name: system.name, type: system.type },
      ip: getClientIp(req),
    });
    return NextResponse.json({
      success: true,
      system: {
        id: system.id,
        name: system.name,
        type: system.type,
        companyId: system.companyId,
        createdAt: system.createdAt,
        configEnc: system.configEnc ? '[encrypted]' : null,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/external-systems:', e);
    return NextResponse.json({ success: false, message: 'Failed to create system' }, { status: 500 });
  }
}
