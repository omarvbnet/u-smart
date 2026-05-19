import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/** Roles that trigger staff broadcast when posting a QField map comment. */
/** Comment author or workspace manager / owner may remove a map note. */
export async function canDeleteQFieldMapNote(
  prisma: any,
  requesterId: string,
  note: { byRequesterId?: string | null }
): Promise<boolean> {
  if (note.byRequesterId && note.byRequesterId === requesterId) return true;
  const me = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      role: true,
      privateCompanyOwned: { select: { status: true } },
    },
  });
  if (!me) return false;
  const role = String(me.role ?? '').toUpperCase();
  if (role === 'MANAGER') return true;
  if (role === 'COMPANY' && me.privateCompanyOwned?.status === 'APPROVED') return true;
  return false;
}

export const QFIELD_MAP_COMMENT_AUTHOR_ROLES = new Set([
  'ENGINEER',
  'TECHNICIAN',
  'COORDINATOR',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
]);

function truncateComment(text: string, max = 180): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function workspaceStaffRecipientIds(
  companyId: string,
  excludeRequesterId: string
): Promise<string[]> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { ownerRequesterId: true },
  });
  if (!company) return [];

  const staff = (await prisma.ticketRequester.findMany({
    where: {
      privateCompanyId: companyId,
      status: { not: 'BLOCKED' },
      id: { not: excludeRequesterId },
    },
    select: { id: true },
  })) as Array<{ id: string }>;

  const ids = new Set<string>(staff.map((s) => s.id));
  if (company.ownerRequesterId && company.ownerRequesterId !== excludeRequesterId) {
    ids.add(company.ownerRequesterId);
  }
  return Array.from(ids);
}

function ticketCrewRecipientIds(
  companyJson: string | null | undefined,
  excludeRequesterId: string
): string[] {
  const parsed = parseTicketCompanyJson(companyJson);
  const lead = assignedStaffIdFromCompanyJson(parsed);
  const crew = maintenanceCrewIdsFromCompanyJson(parsed);
  const ids = new Set<string>(crew);
  if (lead) ids.add(lead);
  ids.delete(excludeRequesterId);
  return Array.from(ids);
}

/**
 * Notify workspace staff (or ticket crew) when an engineer / technician / coordinator
 * posts a shared QField map comment.
 */
export async function notifyQFieldMapCommentAdded(args: {
  ticketId: string;
  authorRequesterId: string;
  authorName: string;
  authorRole: string;
  siteId: string;
  comment: string;
  privateCompanyId: string | null;
  companyJson?: string | null;
  projectId?: string;
}): Promise<void> {
  const role = String(args.authorRole ?? '').toUpperCase();
  if (!QFIELD_MAP_COMMENT_AUTHOR_ROLES.has(role)) return;

  const siteId = args.siteId.trim() || 'Site';
  const authorName = args.authorName.trim() || 'Staff';
  const commentPreview = truncateComment(args.comment);
  const payload = {
    key: 'qfield_map_comment' as const,
    vars: { siteId, authorName, comment: commentPreview },
  };

  let recipientIds: string[] = [];
  if (args.privateCompanyId) {
    recipientIds = await workspaceStaffRecipientIds(args.privateCompanyId, args.authorRequesterId);
  } else {
    recipientIds = ticketCrewRecipientIds(args.companyJson, args.authorRequesterId);
  }

  if (recipientIds.length === 0) return;

  const data: Record<string, string> = {
    ticketId: args.ticketId,
    type: 'qfield_map_comment',
    siteId,
  };
  if (args.projectId) data.projectId = args.projectId;

  for (const requesterId of recipientIds) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'qfield_map_comment',
        ticketId: args.ticketId,
        requesterId,
        payload,
        data,
      });
    } catch (e) {
      console.error('notifyQFieldMapCommentAdded failed for', requesterId, e);
    }
  }
}
