import { prisma } from '@/lib/prisma';

export type NotificationChannel = 'in_app' | 'email' | 'push';

export async function createCoordinatorNotification(params: {
  userId: string;
  title: string;
  body?: string | null;
  channel?: NotificationChannel;
  linkUrl?: string | null;
}) {
  const { userId, title, body = null, channel = 'in_app', linkUrl = null } = params;
  return prisma.coordinatorNotification.create({
    data: { userId, title, body, channel, linkUrl },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.coordinatorNotification.count({
    where: { userId, read: false },
  });
}
