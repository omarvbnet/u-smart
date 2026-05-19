import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/** Drop pings older than this from map overlays. */
export const STAFF_LIVE_LOCATION_STALE_MS = 5 * 60 * 1000;

export type StaffLiveLocationRow = {
  requesterId: string;
  companyId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: Date;
  requester?: {
    name: string | null;
    username: string;
    role: string;
    privateCompanyDepartment?: { name: string | null } | null;
  } | null;
};

export function staffLiveLocationDisplayName(row: StaffLiveLocationRow): string {
  const name = row.requester?.name?.trim();
  if (name) return name;
  return row.requester?.username?.trim() || 'Staff';
}

export function canViewTeamStaffLiveLocations(opts: {
  isOwner: boolean;
  role: string;
}): boolean {
  if (opts.isOwner) return true;
  const r = opts.role.toUpperCase();
  return r === 'MANAGER' || r === 'COMPANY';
}

export function canViewStaffLiveLocationNames(opts: {
  isOwner: boolean;
  role: string;
}): boolean {
  return canViewTeamStaffLiveLocations(opts);
}

export async function getStaffLiveLocationGuard(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }),
    };
  }

  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.isActive || !m.effectiveCompanyId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: 'Workspace is not active.' },
        { status: 403 }
      ),
    };
  }

  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true },
  });
  const role = isOwner ? 'COMPANY' : String(me?.role ?? '').toUpperCase();

  return {
    ok: true as const,
    guard: {
      requesterId: auth.payload.requesterId,
      companyId: m.effectiveCompanyId,
      isOwner,
      role,
      canViewTeam: canViewTeamStaffLiveLocations({ isOwner, role }),
      canViewNames: canViewStaffLiveLocationNames({ isOwner, role }),
    },
  };
}

export function serializeStaffLiveLocation(row: StaffLiveLocationRow, opts: { includeName: boolean }) {
  const base = {
    requesterId: row.requesterId,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    updatedAt: row.updatedAt.toISOString(),
    role: row.requester?.role ?? null,
    departmentName: row.requester?.privateCompanyDepartment?.name ?? null,
  };
  if (!opts.includeName) return base;
  return {
    ...base,
    name: staffLiveLocationDisplayName(row),
    username: row.requester?.username ?? null,
  };
}

export async function upsertStaffLiveLocation(
  requesterId: string,
  companyId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null
) {
  await prisma.staffLiveLocation.upsert({
    where: { requesterId },
    create: {
      requesterId,
      companyId,
      latitude,
      longitude,
      accuracy,
    },
    update: {
      companyId,
      latitude,
      longitude,
      accuracy,
    },
  });
}

export async function listActiveStaffLiveLocations(companyId: string, excludeRequesterId?: string) {
  const since = new Date(Date.now() - STAFF_LIVE_LOCATION_STALE_MS);
  const rows = (await prisma.staffLiveLocation.findMany({
    where: {
      companyId,
      updatedAt: { gte: since },
      ...(excludeRequesterId ? { requesterId: { not: excludeRequesterId } } : {}),
    },
    include: {
      requester: {
        select: {
          name: true,
          username: true,
          role: true,
          privateCompanyDepartment: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })) as StaffLiveLocationRow[];
  return rows;
}
