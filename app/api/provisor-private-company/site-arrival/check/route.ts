import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { processSiteArrivalForStaff } from '@/lib/workspace-site-arrival';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const FIELD_ROLES = new Set(['ENGINEER', 'TECHNICIAN', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER']);

function parsePosition(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const la = Number(o.latitude);
  const lo = Number(o.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lng: lo };
}

/**
 * POST /api/provisor-private-company/site-arrival/check
 * Body: { latitude, longitude }
 *
 * When site-arrival auto ON_SITE is enabled, transitions assigned PENDING
 * maintenance / QC tickets to ON_SITE if the lead is within the proximity radius.
 */
export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const position = parsePosition(body);
  if (!position) {
    return NextResponse.json(
      {
        success: false,
        message: 'latitude and longitude are required.',
      },
      { status: 400 }
    );
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      role: true,
      privateCompanyId: true,
      privateCompanyDepartmentId: true,
      maintenanceProximityRadiusOverrideM: true,
      status: true,
    },
  });
  if (!me?.privateCompanyId || me.privateCompanyId !== m.effectiveCompanyId) {
    return NextResponse.json({ success: false, message: 'Not a workspace member.' }, { status: 403 });
  }
  if (String(me.status ?? '').toUpperCase() !== 'ACTIVE') {
    return NextResponse.json({ success: false, message: 'Account is not active.' }, { status: 403 });
  }
  if (!FIELD_ROLES.has(String(me.role ?? '').toUpperCase())) {
    return NextResponse.json(
      { success: false, message: 'Site arrival check is for field engineers and technicians.' },
      { status: 403 }
    );
  }

  const updated = await processSiteArrivalForStaff(
    prisma,
    {
      id: me.id,
      privateCompanyId: me.privateCompanyId,
      privateCompanyDepartmentId: me.privateCompanyDepartmentId ?? null,
      maintenanceProximityRadiusOverrideM: me.maintenanceProximityRadiusOverrideM,
    },
    position
  );

  return NextResponse.json({
    success: true,
    updated,
    updatedCount: updated.length,
  });
}
