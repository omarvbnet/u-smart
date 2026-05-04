import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  if (!ctx) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });

  const [users, tickets] = await Promise.all([
    db.coordinatorUser.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, role: true },
    }),
    db.visitorRequest.findMany({
      where: { coordinatorCompanyId: ctx.companyId },
      select: { assigneeCoordinatorUserId: true, taskCategory: true },
    }),
  ]);

  const userRoleMap: Record<string, string> = {};
  for (const u of users as Array<{ id: string; role: string }>) {
    userRoleMap[u.id] = u.role;
  }

  const ticketsByRole: Record<string, number> = {};
  for (const t of tickets as Array<{ assigneeCoordinatorUserId: string | null; taskCategory: string | null }>) {
    if (!t.assigneeCoordinatorUserId) continue;
    const role = userRoleMap[t.assigneeCoordinatorUserId];
    if (!role) continue;
    ticketsByRole[role] = (ticketsByRole[role] ?? 0) + 1;
  }

  return NextResponse.json({ success: true, ticketsByRole });
}
