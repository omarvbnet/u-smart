import * as admin from 'firebase-admin';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

let initialized = false;

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function ensureFirebase(): boolean {
  if (initialized) return true;
  const account = getServiceAccount();
  if (!account) return false;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(account),
    });
  }
  initialized = true;
  return true;
}

async function getRequesterTokens(prisma: any, requesterIds: string[]): Promise<string[]> {
  if (!requesterIds.length) return [];
  try {
    const rows = (await prisma.ticketRequester.findMany({
      where: {
        id: { in: requesterIds },
        phonePushToken: { not: null },
      },
      select: { phonePushToken: true },
    })) as Array<{ phonePushToken: unknown }>;

    return [
      ...new Set(
        rows
          .map((r) => r.phonePushToken)
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      ),
    ];
  } catch {
    return [];
  }
}

export async function registerRequesterPushToken(
  prisma: any,
  requesterId: string,
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown'
): Promise<void> {
  const cleaned = token.trim();
  if (!cleaned) return;
  await prisma.ticketRequester.update({
    where: { id: requesterId },
    data: {
      phonePushToken: cleaned,
      phonePlatform: platform,
    },
  });
}

export async function clearRequesterPushToken(prisma: any, requesterId: string): Promise<void> {
  await prisma.ticketRequester.update({
    where: { id: requesterId },
    data: { phonePushToken: null, phonePlatform: null },
  });
}

export async function registerUserPushToken(
  prisma: any,
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown'
): Promise<void> {
  const cleaned = token.trim();
  if (!cleaned) return;
  await prisma.user.update({
    where: { id: userId },
    data: { phonePushToken: cleaned, phonePlatform: platform },
  });
}

export async function clearUserPushToken(prisma: any, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { phonePushToken: null, phonePlatform: null },
  });
}

export async function sendPushToRequesters(
  prisma: any,
  requesterIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!ensureFirebase()) return;
  const tokens = await getRequesterTokens(prisma, requesterIds);
  if (!tokens.length) return;
  const messaging = admin.messaging();
  await Promise.allSettled(
    tokens.map((token) =>
      messaging.send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: {
          payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
          headers: { 'apns-priority': '10' },
        },
      })
    )
  );
}

export async function sendPushToAllRequesters(prisma: any, payload: PushPayload): Promise<number> {
  if (!ensureFirebase()) return 0;
  const rows = (await prisma.ticketRequester.findMany({
    where: { phonePushToken: { not: null } },
    select: { phonePushToken: true },
  })) as Array<{ phonePushToken: unknown }>;

  const tokens = [
    ...new Set(
      rows
        .map((r) => r.phonePushToken)
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    ),
  ];
  if (!tokens.length) return 0;
  const messaging = admin.messaging();
  const results = await Promise.allSettled(
    tokens.map((token) =>
      messaging.send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: {
          payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
          headers: { 'apns-priority': '10' },
        },
      })
    )
  );
  return results.filter((r) => r.status === 'fulfilled').length;
}
