import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-require';
import { prisma } from '@/lib/prisma';

/** Revoke an active ticket API key. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ success: false, message: admin.message }, { status: admin.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing key id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';
    if (action !== 'revoke') {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }

    const keyDelegate = (prisma as { ticketApiKey?: { update: Function } }).ticketApiKey;
    if (!keyDelegate?.update) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    await keyDelegate.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true, revoked: true });
  } catch (err) {
    console.error('PATCH /api/admin/ticket-api-keys/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to revoke key' }, { status: 500 });
  }
}
