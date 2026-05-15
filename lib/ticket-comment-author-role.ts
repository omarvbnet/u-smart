/**
 * UI role for ticket comments (derived from TicketRequester.role, not persisted on TicketComment).
 */
export type TicketCommentAuthorRole = 'engineer' | 'technician' | 'requester';

export function commentAuthorDisplayRole(
  requesterRole: string | null | undefined
): TicketCommentAuthorRole {
  const u = String(requesterRole ?? '').toUpperCase();
  if (u === 'ENGINEER') return 'engineer';
  if (u === 'TECHNICIAN') return 'technician';
  return 'requester';
}
