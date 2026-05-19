/**
 * Workspace ticket list/detail visibility for leads (owner account or MANAGER role).
 */

export function isWorkspaceTicketLeader(
  role: string | null | undefined,
  ownedPrivateCompanyId: string | null | undefined
): boolean {
  if (ownedPrivateCompanyId) return true;
  return String(role ?? '').toUpperCase() === 'MANAGER';
}

/** OR clauses for GET /api/tickets list: all tickets tied to the workspace. */
export function workspaceTicketVisibilityOrClauses(args: {
  memberRequesterIds: string[];
  privateCompanyId: string | null;
  role: string;
  ownedPrivateCompanyId: string | null;
  linkedCoordinatorCompanyId?: string | null;
}): Record<string, unknown>[] {
  const or: Record<string, unknown>[] = [{ requesterId: { in: args.memberRequesterIds } }];
  if (args.privateCompanyId && isWorkspaceTicketLeader(args.role, args.ownedPrivateCompanyId)) {
    or.push({ privateCompanyId: args.privateCompanyId });
  }
  const linked = args.linkedCoordinatorCompanyId?.trim();
  if (linked) {
    or.push({ coordinatorCompanyId: linked });
  }
  return or;
}
