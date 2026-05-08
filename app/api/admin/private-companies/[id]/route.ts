import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * PATCH /api/admin/private-companies/[id]
 * Body: { action: 'approve' | 'reject' | 'suspend' | 'reactivate'; reason?: string }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!['approve', 'reject', 'suspend', 'reactivate'].includes(action)) {
    return NextResponse.json({ success: false, message: 'Invalid action.' }, { status: 400 });
  }
  if (action === 'reject' && !reason) {
    return NextResponse.json(
      { success: false, message: 'A rejection reason is required.' },
      { status: 400 }
    );
  }

  const company = await prisma.privateCompany.findUnique({
    where: { id },
    select: { id: true, status: true, ownerRequesterId: true, name: true },
  });
  if (!company) return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });

  let nextStatus: string;
  let approvedAt: Date | null = null;
  let approvedById: string | null = null;
  let rejectionReason: string | null = null;
  switch (action) {
    case 'approve':
      nextStatus = 'APPROVED';
      approvedAt = new Date();
      approvedById = admin.userId;
      break;
    case 'reject':
      nextStatus = 'REJECTED';
      rejectionReason = reason;
      break;
    case 'suspend':
      nextStatus = 'SUSPENDED';
      break;
    case 'reactivate':
    default:
      nextStatus = 'APPROVED';
      approvedAt = new Date();
      approvedById = admin.userId;
  }

  const updated = await prisma.privateCompany.update({
    where: { id },
    data: {
      status: nextStatus,
      approvedAt: approvedAt ?? undefined,
      approvedById: approvedById ?? undefined,
      rejectionReason: action === 'reject' ? rejectionReason : action === 'approve' || action === 'reactivate' ? null : undefined,
    },
    select: {
      id: true,
      status: true,
      approvedAt: true,
      rejectionReason: true,
    },
  });

  // Notify the owner via the existing notifications + push pipeline
  try {
    if (typeof prisma.notification?.create === 'function') {
      await prisma.notification.create({
        data: {
          type: 'private_company_status',
          title:
            action === 'approve' || action === 'reactivate'
              ? 'Private workspace approved'
              : action === 'reject'
                ? 'Private workspace rejected'
                : 'Private workspace suspended',
          message:
            action === 'approve' || action === 'reactivate'
              ? `Your workspace "${company.name}" was approved. You can now build departments and staff.`
              : action === 'reject'
                ? `Your workspace "${company.name}" was rejected. Reason: ${reason || '—'}`
                : `Your workspace "${company.name}" was suspended.`,
          requesterId: company.ownerRequesterId,
          payload: { workspaceId: company.id, status: nextStatus, reason: rejectionReason ?? null },
        },
      });
    }
  } catch (e) {
    console.error('Notify owner (private-company status):', e);
  }

  return NextResponse.json({ success: true, company: updated });
}
