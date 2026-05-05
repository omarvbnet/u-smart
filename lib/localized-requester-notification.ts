import {
  formatNotificationCopy,
  stringifyNotificationPayload,
  type NotificationCopyPayload,
} from '@/lib/notification-i18n';
import { sendLocalizedPushToRequesters } from '@/lib/push-notifications';

type CreateOpts = {
  prisma: any;
  type: string;
  requesterId: string;
  ticketId?: string | null;
  payload: NotificationCopyPayload;
  data?: Record<string, string>;
};

/** Persist in-app notification (English fallback + structured payload) and send localized push. */
export async function notifyRequesterI18n(opts: CreateOpts): Promise<void> {
  const { prisma, type, requesterId, ticketId, payload, data } = opts;
  if (typeof prisma.notification?.create !== 'function') return;
  const en = formatNotificationCopy('en', payload);
  const baseRow = {
    type,
    title: en.title,
    message: en.body,
    ticketId: ticketId ?? undefined,
    requesterId,
    forAdmin: false as const,
  };
  try {
    await prisma.notification.create({
      data: {
        ...baseRow,
        payload: stringifyNotificationPayload(payload),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? '');
    if (msg.includes('payload') || msg.includes('Unknown argument') || msg.includes('P2022')) {
      try {
        await prisma.notification.create({ data: baseRow });
      } catch (e2) {
        console.error('notifyRequesterI18n create (fallback):', e2);
        return;
      }
    } else {
      console.error('notifyRequesterI18n create:', e);
      return;
    }
  }
  try {
    await sendLocalizedPushToRequesters(prisma, [{ requesterId, payload, data }]);
  } catch (e) {
    console.error('notifyRequesterI18n push:', e);
  }
}
