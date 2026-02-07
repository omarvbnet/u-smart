import { NextRequest, NextResponse } from 'next/server';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, user: null });
  }

  const payload = verifyRequesterToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, user: null });
  }

  type RequesterRow = { id: string; username: string; name: string | null; phone: string; company: string | null; serviceSlug: string };
  let requester: RequesterRow | null = null;
  try {
    const row = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { id: true, username: true, name: true, phone: true, company: true, serviceSlug: true },
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
  try {
    const extended = await (prisma.ticketRequester as any).findUnique({
      where: { id: payload.requesterId },
      select: { companyCertificationUrl: true, status: true, hasUpdatedCredentials: true },
    });
    if (extended) {
      companyCertificationUrl = extended.companyCertificationUrl ?? null;
      status = extended.status ?? 'ACTIVE';
      hasUpdatedCredentials = extended.hasUpdatedCredentials === true;
    }
  } catch {
    /* use defaults */
  }
  const serviceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';
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
    },
  });
}
