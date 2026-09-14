import {
  isWhatsAppCloudConfigured,
  sendWhatsAppText,
} from '@/lib/whatsapp-cloud-messaging';

/** Support inbox phone (digits or +E.164). Override with SUPPORT_WHATSAPP_PHONE. */
export function getSupportWhatsAppPhone(): string {
  return (
    process.env.SUPPORT_WHATSAPP_PHONE?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ||
    '+9647760777659'
  );
}

export type SupportTicketNotifyInput = {
  ticketId: string;
  technique?: string | null;
  siteName?: string | null;
  province?: string | null;
  notes?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  requesterRole?: string | null;
  companyName?: string | null;
  source?: string | null;
  assignmentScope?: string | null;
};

function buildBody(input: SupportTicketNotifyInput): string {
  const lines = [
    '🎫 *New Proviser ticket*',
    `ID: ${input.ticketId}`,
    input.technique ? `Service: ${input.technique}` : null,
    input.siteName ? `Site: ${input.siteName}` : null,
    input.province ? `Province: ${input.province}` : null,
    input.requesterName ? `Requester: ${input.requesterName}` : null,
    input.requesterPhone ? `Phone: ${input.requesterPhone}` : null,
    input.requesterRole ? `Role: ${input.requesterRole}` : null,
    input.companyName ? `Company: ${input.companyName}` : null,
    input.assignmentScope ? `Scope: ${input.assignmentScope}` : null,
    input.source ? `Source: ${input.source}` : null,
    input.notes ? `Notes: ${input.notes.slice(0, 500)}` : null,
    '',
    `Portal: https://proviser.usmart-iot.com`,
  ].filter((l) => l !== null) as string[];
  return lines.join('\n');
}

/**
 * Fire-and-forget WhatsApp notify to Proviser support.
 * Requires WhatsApp Cloud API env; otherwise logs and skips (no throw).
 */
export function notifySupportWhatsAppTicket(input: SupportTicketNotifyInput): void {
  void (async () => {
    try {
      if (!isWhatsAppCloudConfigured()) {
        console.warn(
          'notifySupportWhatsAppTicket: WhatsApp Cloud not configured; skipped for',
          input.ticketId
        );
        return;
      }
      const to = getSupportWhatsAppPhone();
      const result = await sendWhatsAppText({ to, body: buildBody(input) });
      if (!result.ok) {
        console.warn('notifySupportWhatsAppTicket failed:', result.message);
      }
    } catch (e) {
      console.error('notifySupportWhatsAppTicket:', e);
    }
  })();
}
