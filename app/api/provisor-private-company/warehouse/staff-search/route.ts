import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/warehouse/staff-search?q=...
 *
 * Warehouse keepers, owners, managers, and coordinators. Searches workspace
 * staff by username, phone, or name (substring match).
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  if (!guard.canMutateWarehouse && !guard.canAssignFromWarehouse) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Only warehouse staff and department managers/coordinators can search for assignment targets.',
      },
      { status: 403 }
    );
  }
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json(
      { success: false, message: 'Enter at least 2 characters to search.' },
      { status: 400 }
    );
  }
  const companyId = guard.companyId;
  const owner = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { ownerRequesterId: true },
  });
  const ownerId = owner?.ownerRequesterId as string | undefined;

  const rows: Array<{
    id: string;
    username: string;
    name: string | null;
    phone: string;
    role: string | null;
    province: string | null;
  }> = await prisma.ticketRequester.findMany({
    where: {
      privateCompanyId: companyId,
      status: { not: 'BLOCKED' },
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      role: true,
      province: true,
    },
    take: 40,
    orderBy: { username: 'asc' },
  });

  const staff = rows.map((r) => ({
    ...r,
    isOwner: ownerId ? r.id === ownerId : false,
  }));

  return NextResponse.json({ success: true, staff });
}
