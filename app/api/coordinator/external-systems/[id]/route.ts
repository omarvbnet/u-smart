import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
    const { id } = await params;
    const existing = await prisma.coordinatorExternalSystem.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'System not found' }, { status: 404 });
    }
    const body = await req.json();
    const data: { name?: string; configEnc?: string | null } = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.configEnc === 'string') data.configEnc = body.configEnc;
    const system = await prisma.coordinatorExternalSystem.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      success: true,
      system: {
        id: system.id,
        name: system.name,
        type: system.type,
        companyId: system.companyId,
        configEnc: system.configEnc ? '[encrypted]' : null,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/external-systems/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update system' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(_req, [CoordinatorRole.ADMIN]);
    const { id } = await params;
    const existing = await prisma.coordinatorExternalSystem.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'System not found' }, { status: 404 });
    }
    await prisma.coordinatorExternalSystem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/external-systems/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete system' }, { status: 500 });
  }
}
