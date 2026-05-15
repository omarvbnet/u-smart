import { canManageTicketQFieldProjects } from '@/lib/qfield-ticket-write';

/** Who may load vector/map preview for a ticket QField project (same as write, plus ticket owner). */
export async function canPreviewQFieldMapOnTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  ticketId: string,
  requesterId: string
): Promise<boolean> {
  if (await canManageTicketQFieldProjects(prismaClient, ticketId, requesterId)) return true;
  const row = await prismaClient.visitorRequest.findFirst({
    where: { id: ticketId },
    select: { requesterId: true },
  });
  return row?.requesterId === requesterId;
}
