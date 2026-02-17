import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

const MAX_LOGS = 50;

/**
 * GET action logs for an external system. Company-scoped.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(_req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id: systemId } = await params;

    const system = await prisma.coordinatorExternalSystem.findFirst({
      where: { id: systemId, companyId: payload.companyId },
    });
    if (!system) {
      return NextResponse.json({ success: false, message: 'System not found' }, { status: 404 });
    }

    const logs = await prisma.coordinatorSystemActionLog.findMany({
      where: { systemId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LOGS,
      select: {
        id: true,
        action: true,
        status: true,
        retryCount: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, logs });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/external-systems/[id]/action-logs:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch logs' }, { status: 500 });
  }
}
