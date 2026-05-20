import { parseNotificationPayload } from '@/lib/notification-i18n';
import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';

const MAINT_SLUGS = new Set(MAINTENANCE_TECHNIQUES.map((t) => t.toLowerCase()));

export type InboxNotificationRow = {
  ticketId: string | null;
  payload: unknown;
};

/** True if visitor_request is a maintenance-style ticket (pool + private workspace). */
export function visitorTechniqueIsMaintenance(technique: string | null | undefined): boolean {
  const t = (technique ?? '').trim().toLowerCase();
  if (!t) return false;
  if (MAINT_SLUGS.has(t)) return true;
  return t === 'maintenance';
}

export async function buildMaintenanceTicketMap(
  prisma: {
    visitorRequest: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: { id: true; technique: true };
      }) => Promise<Array<{ id: string; technique: string | null }>>;
    };
  },
  ticketIds: (string | null | undefined)[]
): Promise<Map<string, boolean>> {
  const ids = [...new Set(ticketIds.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const out = new Map<string, boolean>();
  if (ids.length === 0) return out;
  const rows = await prisma.visitorRequest.findMany({
    where: { id: { in: ids } },
    select: { id: true, technique: true },
  });
  for (const r of rows) {
    out.set(r.id, visitorTechniqueIsMaintenance(r.technique));
  }
  for (const id of ids) {
    if (!out.has(id)) out.set(id, false);
  }
  return out;
}

/**
 * In-app inbox filter for requesters whose platform role is TECHNICIAN:
 * maintenance tickets (and warehouse / crew alerts tied to field work),
 * not QC tickets or generic workspace copy.
 */
export function technicianSeesMaintenanceInboxRow(
  row: InboxNotificationRow,
  ticketIsMaintenance: Map<string, boolean>
): boolean {
  const parsed = parseNotificationPayload(row.payload);
  if (parsed?.key === 'new_ticket_role') {
    return parsed.vars?.roleKind === 'maintenance';
  }
  if (parsed?.key === 'maintenance_crew_joined') return true;
  if (parsed?.key === 'ticket_assigned_urgent') return true;
  if (typeof parsed?.key === 'string' && parsed.key.startsWith('material_')) return true;
  const tid = row.ticketId;
  if (tid && ticketIsMaintenance.get(tid) === true) return true;
  return false;
}
