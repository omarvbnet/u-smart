/**
 * Workspace site arrival: defer ON_SITE until GPS is within the configured radius
 * (department maintenanceProximityRadiusM ± per-staff override).
 */

import { clampProximityRadiusMeters, haversineDistanceMeters } from '@/lib/geo-distance';
import { resolveTicketSitePointForVisitor } from '@/lib/ticket-detail-enrichment';
import {
  assignedStaffIdFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { isWorkspaceCrewTicketTechnique } from '@/lib/workspace-maintenance-crew';

export type SiteArrivalSettings = {
  autoOnSiteEnabled: boolean;
  radiusM: number;
};

export function resolveSiteArrivalAutoOnSiteEnabled(
  companyEnabled: boolean | null | undefined,
  departmentEnabled: boolean | null | undefined
): boolean {
  if (departmentEnabled === true) return true;
  if (departmentEnabled === false) return false;
  return companyEnabled !== false;
}

export function resolveEffectiveProximityRadiusM(
  deptRadiusM: number | null | undefined,
  staffOverrideM: number | null | undefined
): number {
  if (typeof staffOverrideM === 'number' && Number.isFinite(staffOverrideM)) {
    return clampProximityRadiusMeters(staffOverrideM);
  }
  if (typeof deptRadiusM === 'number' && Number.isFinite(deptRadiusM)) {
    return clampProximityRadiusMeters(deptRadiusM);
  }
  return 500;
}

export async function loadSiteArrivalSettingsForStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  companyId: string,
  departmentId: string | null | undefined,
  staffOverrideRadiusM: number | null | undefined
): Promise<SiteArrivalSettings> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { siteArrivalAutoOnSiteEnabled: true },
  });
  let deptEnabled: boolean | null | undefined = undefined;
  let deptRadiusM: number | null | undefined = 500;
  if (departmentId) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: departmentId, companyId },
      select: {
        siteArrivalAutoOnSiteEnabled: true,
        maintenanceProximityRadiusM: true,
      },
    });
    if (dept) {
      deptEnabled = dept.siteArrivalAutoOnSiteEnabled as boolean | null | undefined;
      deptRadiusM = dept.maintenanceProximityRadiusM as number | null | undefined;
    }
  }
  return {
    autoOnSiteEnabled: resolveSiteArrivalAutoOnSiteEnabled(
      company?.siteArrivalAutoOnSiteEnabled,
      deptEnabled
    ),
    radiusM: resolveEffectiveProximityRadiusM(deptRadiusM, staffOverrideRadiusM),
  };
}

/** Whether assign should keep PENDING until the lead arrives within radius. */
export async function shouldDeferOnSiteUntilArrival(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  ticket: {
    privateCompanyId: string | null;
    technique: string | null;
    privateCompanyTargetDepartmentId?: string | null;
  },
  assigneeDepartmentId: string | null | undefined
): Promise<boolean> {
  if (!ticket.privateCompanyId) return false;
  const crewTicket = await isWorkspaceCrewTicketTechnique(
    prisma,
    ticket.privateCompanyId,
    ticket.technique
  );
  if (!crewTicket) return false;
  const deptId = ticket.privateCompanyTargetDepartmentId ?? assigneeDepartmentId ?? null;
  const settings = await loadSiteArrivalSettingsForStaff(prisma, ticket.privateCompanyId, deptId, null);
  return settings.autoOnSiteEnabled;
}

export type SiteArrivalCheckResult = {
  ticketId: string;
  distanceM: number;
  radiusM: number;
};

/**
 * For assigned lead on PENDING workspace maintenance/QC tickets, transition to ON_SITE
 * when within the effective proximity radius.
 */
export async function processSiteArrivalForStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  staff: {
    id: string;
    privateCompanyId: string;
    privateCompanyDepartmentId: string | null;
    maintenanceProximityRadiusOverrideM: number | null | undefined;
  },
  position: { lat: number; lng: number }
): Promise<SiteArrivalCheckResult[]> {
  const tickets = await prisma.visitorRequest.findMany({
    where: {
      privateCompanyId: staff.privateCompanyId,
      assignmentScope: 'PRIVATE_COMPANY_STAFF',
      status: 'PENDING',
    },
    select: {
      id: true,
      technique: true,
      company: true,
      siteName: true,
      requesterId: true,
      privateCompanyTargetDepartmentId: true,
    },
  });

  const updated: SiteArrivalCheckResult[] = [];

  for (const t of tickets) {
    const parsed = parseTicketCompanyJson(t.company);
    if (assignedStaffIdFromCompanyJson(parsed) !== staff.id) continue;

    const crewTicket = await isWorkspaceCrewTicketTechnique(
      prisma,
      staff.privateCompanyId,
      t.technique
    );
    if (!crewTicket) continue;

    const ticketDeptId =
      (t as { privateCompanyTargetDepartmentId?: string | null }).privateCompanyTargetDepartmentId ??
      staff.privateCompanyDepartmentId ??
      null;
    const ticketSettings = await loadSiteArrivalSettingsForStaff(
      prisma,
      staff.privateCompanyId,
      ticketDeptId,
      staff.maintenanceProximityRadiusOverrideM
    );
    if (!ticketSettings.autoOnSiteEnabled) continue;

    const sitePoint = await resolveTicketSitePointForVisitor(prisma, {
      companyJson: t.company,
      siteName: t.siteName,
      requesterId: t.requesterId,
      privateCompanyId:
        (t as { privateCompanyId?: string | null }).privateCompanyId ?? staff.privateCompanyId,
    });
    if (!sitePoint) continue;

    const distanceM = haversineDistanceMeters(position, sitePoint);
    if (distanceM > ticketSettings.radiusM) continue;

    const nextParsed: Record<string, unknown> = {
      ...parsed,
      status: 'ON_SITE',
      awaitingSiteArrival: false,
    };
    if (!nextParsed._ticket) nextParsed._ticket = true;

    await prisma.visitorRequest.update({
      where: { id: t.id },
      data: {
        status: 'ON_SITE',
        company: JSON.stringify(nextParsed),
      },
    });
    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: t.id, status: 'ON_SITE' },
      });
    } catch {
      /* ignore */
    }

    updated.push({
      ticketId: t.id,
      distanceM: Math.round(distanceM),
      radiusM: ticketSettings.radiusM,
    });
  }

  return updated;
}

export type ManualOnSiteProximityResult = {
  requiresProximity: boolean;
  allowed: boolean;
  message?: string;
  distanceM?: number;
  radiusM?: number;
};

/** Gate manual PENDING → ON_SITE for workspace QC / maintenance tickets. */
export async function validateManualOnSiteProximity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  row: {
    company: string | null;
    technique: string | null;
    privateCompanyId: string | null;
    assignmentScope: string | null;
    privateCompanyTargetDepartmentId?: string | null;
    siteName: string | null;
    requesterId: string | null;
  },
  staff: {
    privateCompanyDepartmentId: string | null;
    maintenanceProximityRadiusOverrideM: number | null | undefined;
  },
  position: { lat: number; lng: number } | null
): Promise<ManualOnSiteProximityResult> {
  if (!row.privateCompanyId || row.assignmentScope !== 'PRIVATE_COMPANY_STAFF') {
    return { requiresProximity: false, allowed: true };
  }
  const crewTicket = await isWorkspaceCrewTicketTechnique(
    prisma,
    row.privateCompanyId,
    row.technique
  );
  if (!crewTicket) {
    return { requiresProximity: false, allowed: true };
  }
  const deptId =
    row.privateCompanyTargetDepartmentId ?? staff.privateCompanyDepartmentId ?? null;
  const settings = await loadSiteArrivalSettingsForStaff(
    prisma,
    row.privateCompanyId,
    deptId,
    staff.maintenanceProximityRadiusOverrideM
  );
  if (!settings.autoOnSiteEnabled) {
    return { requiresProximity: false, allowed: true };
  }
  if (!position) {
    return {
      requiresProximity: true,
      allowed: false,
      radiusM: settings.radiusM,
      message: `On-site requires your GPS location within ${settings.radiusM}m of the job site. Stay pending until you are close enough.`,
    };
  }
  const sitePoint = await resolveTicketSitePointForVisitor(prisma, {
    companyJson: row.company,
    siteName: row.siteName,
    requesterId: row.requesterId,
    privateCompanyId: (row as { privateCompanyId?: string | null }).privateCompanyId ?? null,
  });
  if (!sitePoint) {
    return {
      requiresProximity: true,
      allowed: false,
      radiusM: settings.radiusM,
      message:
        'This ticket has no site coordinates. Ask the workspace owner to pin the site before marking on site.',
    };
  }
  const distanceM = haversineDistanceMeters(position, sitePoint);
  if (distanceM > settings.radiusM) {
    return {
      requiresProximity: true,
      allowed: false,
      distanceM: Math.round(distanceM),
      radiusM: settings.radiusM,
      message: `You are about ${Math.round(distanceM)}m from the site. Move within ${settings.radiusM}m to mark on site (ticket stays pending until then).`,
    };
  }
  return {
    requiresProximity: true,
    allowed: true,
    distanceM: Math.round(distanceM),
    radiusM: settings.radiusM,
  };
}
