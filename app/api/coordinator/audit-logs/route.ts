import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || undefined;
    const resource = searchParams.get('resource') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);

    const where: { companyId: string; action?: string; resource?: string } = { companyId: payload.companyId };
    if (action) where.action = action;
    if (resource) where.resource = resource;

    const logs = await prisma.coordinatorAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        payload: l.payload,
        ip: l.ip,
        userId: l.userId,
        userEmail: l.user?.email,
        userName: l.user?.name,
        createdAt: l.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/audit-logs:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
