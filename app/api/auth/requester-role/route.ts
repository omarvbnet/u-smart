import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, role: 'COMPANY' });
  }

  try {
    if (auth.payload.identitySource === 'coordinator_user') {
      const rows = await (prisma as any).$queryRawUnsafe(
        `SELECT role FROM coordinator_users WHERE id = $1 LIMIT 1`,
        auth.payload.requesterId,
      );
      const role = Array.isArray(rows) && rows.length > 0 ? String(rows[0].role) : 'COORDINATOR';
      return NextResponse.json({ success: true, role });
    }
    const rows = await (prisma as any).$queryRawUnsafe(
      `SELECT role FROM ticket_requesters WHERE id = $1 LIMIT 1`,
      auth.payload.requesterId,
    );
    const role = Array.isArray(rows) && rows.length > 0 ? String(rows[0].role) : 'COMPANY';
    return NextResponse.json({ success: true, role });
  } catch {
    return NextResponse.json({ success: true, role: 'COMPANY' });
  }
}
