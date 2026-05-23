import { canPreviewTicketQFieldProjects } from '@/lib/qfield-ticket-write';

/** Who may load vector/map preview for a ticket QField project. */
export async function canPreviewQFieldMapOnTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  ticketId: string,
  requesterId: string
): Promise<boolean> {
  return canPreviewTicketQFieldProjects(prismaClient, ticketId, requesterId);
}
