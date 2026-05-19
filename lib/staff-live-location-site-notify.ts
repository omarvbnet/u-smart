import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const STAFF_SITE_NEAR_RADIUS_M = 60;
export const STAFF_SITE_LEAVE_RADIUS_M = 80;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function workspaceLeaderRequesterIds(companyId: string): Promise<string[]> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: {
      ownerRequesterId: true,
      staff: {
        where: {
          status: 'ACTIVE',
          role: { in: ['MANAGER', 'COORDINATOR'] },
        },
        select: { id: true },
      },
    },
  });
  if (!company) return [];
  const ids = new Set<string>([company.ownerRequesterId]);
  for (const s of company.staff as { id: string }[]) {
    ids.add(s.id);
  }
  return [...ids];
}

/** Notify leaders when field staff enter/leave workspace site radius. */
export async function handleStaffLocationSiteProximity(
  companyId: string,
  staffRequesterId: string,
  latitude: number,
  longitude: number
) {
  const staff = (await prisma.ticketRequester.findUnique({
    where: { id: staffRequesterId },
    select: { name: true, username: true, role: true },
  })) as { name: string | null; username: string } | null;
  if (!staff) return;

  const staffName = staff.name?.trim() || staff.username?.trim() || 'Staff';
  const role = String(staff.role ?? '').toUpperCase();
  if (role === 'MANAGER' || role === 'COMPANY' || role === 'COORDINATOR') {
    return;
  }

  const sites = await prisma.privateCompanySite.findMany({
    where: {
      companyId,
      confirmationStatus: 'CONFIRMED',
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      siteCode: true,
      location: true,
      latitude: true,
      longitude: true,
    },
  });

  const activeStates = await prisma.staffSiteProximityState.findMany({
    where: { companyId, staffRequesterId },
    select: { id: true, siteId: true },
  });
  const stateBySite = new Map(activeStates.map((s: { siteId: string; id: string }) => [s.siteId, s.id]));

  const nearSiteIds = new Set<string>();

  for (const site of sites as {
    id: string;
    siteCode: string;
    location: string;
    latitude: number;
    longitude: number;
  }[]) {
    const dist = haversineMeters(latitude, longitude, site.latitude, site.longitude);
    if (dist <= STAFF_SITE_NEAR_RADIUS_M) {
      nearSiteIds.add(site.id);
      if (!stateBySite.has(site.id)) {
        await prisma.staffSiteProximityState.create({
          data: { companyId, siteId: site.id, staffRequesterId },
        });
        const leaders = await workspaceLeaderRequesterIds(companyId);
        const payload = {
          key: 'staff_near_site' as const,
          vars: {
            staffName,
            siteCode: site.siteCode,
            siteLocation: site.location,
            distanceM: String(Math.round(dist)),
          },
        };
        for (const leaderId of leaders) {
          if (leaderId === staffRequesterId) continue;
          await notifyRequesterI18n({
            prisma,
            type: 'STAFF_NEAR_SITE',
            requesterId: leaderId,
            payload,
            data: {
              siteId: site.id,
              siteCode: site.siteCode,
              staffRequesterId,
            },
          }).catch((e) => console.error('staff_near_site notify:', e));
        }
      }
    } else if (dist > STAFF_SITE_LEAVE_RADIUS_M && stateBySite.has(site.id)) {
      await prisma.staffSiteProximityState.delete({ where: { id: stateBySite.get(site.id)! } });
    }
  }

  for (const [siteId, stateId] of stateBySite) {
    if (!nearSiteIds.has(siteId)) {
      await prisma.staffSiteProximityState.delete({ where: { id: stateId } }).catch(() => {});
    }
  }
}
