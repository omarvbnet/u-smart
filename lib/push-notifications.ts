import * as admin from 'firebase-admin';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

let initialized = false;

function isMissingPushColumnsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('P2022') && (msg.includes('phonePushToken') || msg.includes('phonePlatform'));
}

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

async function getLegacyRequesterTokens(prisma: any, requesterIds: string[]): Promise<string[]> {
  if (!requesterIds.length) return [];
  try {
    const rows = (await prisma.notification.findMany({
      where: {
        type: 'push_token',
        forAdmin: false,
        requesterId: { in: requesterIds },
      },
      select: { message: true },
    })) as Array<{ message: unknown }>;
    return [
      ...new Set(
        rows
          .map((r) => r.message)
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      ),
    ];
  } catch {
    return [];
  }
}

async function getAllLegacyRequesterTokens(prisma: any): Promise<string[]> {
  try {
    const rows = (await prisma.notification.findMany({
      where: { type: 'push_token', forAdmin: false },
      select: { message: true },
    })) as Array<{ message: unknown }>;
    return [
      ...new Set(
        rows
          .map((r) => r.message)
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
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
  try {
    await prisma.ticketRequester.update({
      where: { id: requesterId },
      data: {
        phonePushToken: cleaned,
        phonePlatform: platform,
      },
    });
  } catch (err) {
    if (!isMissingPushColumnsError(err)) throw err;
  }

  // Backward compatibility while environments still use legacy storage.
  try {
    await prisma.notification.create({
      data: {
        type: 'push_token',
        title: platform,
        message: cleaned,
        requesterId,
        forAdmin: false,
        read: true,
      },
    });
  } catch {
    // Ignore duplicate/legacy write failures.
  }
}

export async function clearRequesterPushToken(prisma: any, requesterId: string): Promise<void> {
  try {
    await prisma.ticketRequester.update({
      where: { id: requesterId },
      data: { phonePushToken: null, phonePlatform: null },
    });
  } catch (err) {
    if (!isMissingPushColumnsError(err)) throw err;
  }

  try {
    await prisma.notification.deleteMany({
      where: { type: 'push_token', forAdmin: false, requesterId },
    });
  } catch {
    // Ignore legacy cleanup failures.
  }
}

export async function registerUserPushToken(
  prisma: any,
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown'
): Promise<void> {
  const cleaned = token.trim();
  if (!cleaned) return;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { phonePushToken: cleaned, phonePlatform: platform },
    });
  } catch (err) {
    if (!isMissingPushColumnsError(err)) throw err;
  }
}

export async function clearUserPushToken(prisma: any, userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { phonePushToken: null, phonePlatform: null },
    });
  } catch (err) {
    if (!isMissingPushColumnsError(err)) throw err;
  }
}

export async function sendPushToRequesters(
  prisma: any,
  requesterIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!ensureFirebase()) return;
  const [primary, legacy] = await Promise.all([
    getRequesterTokens(prisma, requesterIds),
    getLegacyRequesterTokens(prisma, requesterIds),
  ]);
  const tokens = [...new Set([...primary, ...legacy])];
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
  let primary: string[] = [];
  try {
    const rows = (await prisma.ticketRequester.findMany({
      where: { phonePushToken: { not: null } },
      select: { phonePushToken: true },
    })) as Array<{ phonePushToken: unknown }>;
    primary = [
      ...new Set(
        rows
          .map((r) => r.phonePushToken)
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      ),
    ];
  } catch {
    primary = [];
  }
  const legacy = await getAllLegacyRequesterTokens(prisma);
  const tokens = [...new Set([...primary, ...legacy])];
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
