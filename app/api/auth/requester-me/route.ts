import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, user: null });
  }
  const payload = auth.payload;

  type RequesterRow = { id: string; username: string; name: string | null; phone: string; company: string | null; serviceSlug: string; role?: string };
  let requester: RequesterRow | null = null;
  try {
    const row = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { id: true, username: true, name: true, phone: true, company: true, serviceSlug: true, role: true },
    });
    requester = row as RequesterRow | null;
  } catch {
    return NextResponse.json({ success: false, user: null });
  }
  if (!requester) {
    return NextResponse.json({ success: false, user: null });
  }
  // Optional fields - may not exist in generated client
  let companyCertificationUrl: string | null = null;
  let status = 'ACTIVE';
  let hasUpdatedCredentials = false;
  let province: string | null = null;
  let provinceFilterActive = true;
  try {
    const extended = await (prisma.ticketRequester as any).findUnique({
      where: { id: payload.requesterId },
      select: { companyCertificationUrl: true, status: true, hasUpdatedCredentials: true, province: true, provinceFilterActive: true },
    });
    if (extended) {
      companyCertificationUrl = extended.companyCertificationUrl ?? null;
      status = extended.status ?? 'ACTIVE';
      hasUpdatedCredentials = extended.hasUpdatedCredentials === true;
      province = extended.province ?? null;
      provinceFilterActive = extended.provinceFilterActive ?? true;
    }
  } catch {
    /* use defaults */
  }
  const serviceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';
  const role = requester.role ?? 'COMPANY';
  return NextResponse.json({
    success: true,
    user: {
      id: requester.id,
      username: requester.username,
      name: requester.name,
      phone: requester.phone,
      company: requester.company ?? null,
      companyCertificationUrl,
      status,
      hasUpdatedCredentials,
      serviceSlug,
      role,
      province,
      provinceFilterActive,
    },
  });
}
