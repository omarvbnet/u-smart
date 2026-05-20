import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

/** Urgent in-app + push when an engineer/dispatcher assigns a maintenance ticket to a technician. */
export async function notifyTechnicianUrgentAssignment(opts: {
  prisma: unknown;
  ticketId: string;
  technicianId: string;
  assignerName: string;
  siteName?: string | null;
  province?: string | null;
}): Promise<void> {
  const site = (opts.siteName ?? '').trim() || 'Site';
  const province = (opts.province ?? '').trim();
  const assigner = (opts.assignerName ?? '').trim() || 'Engineer';
  try {
    await notifyRequesterI18n({
      prisma: opts.prisma,
      type: 'ticket_assigned_urgent',
      ticketId: opts.ticketId,
      requesterId: opts.technicianId,
      payload: {
        key: 'ticket_assigned_urgent',
        vars: { assignerName: assigner, siteName: site, province },
      },
      data: {
        ticketId: opts.ticketId,
        type: 'ticket_assigned_urgent',
        priority: 'urgent',
      },
    });
  } catch {
    /* ignore */
  }
}
