import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type WhatsAppConsent = {
  granted: boolean;
  canSendMessages: boolean;
  canSendFiles: boolean;
  canStartCalls: boolean;
  grantedAt: string | null;
};

const DENIED: WhatsAppConsent = {
  granted: false,
  canSendMessages: false,
  canSendFiles: false,
  canStartCalls: false,
  grantedAt: null,
};

export async function getWhatsAppConsent(userId: string): Promise<WhatsAppConsent> {
  if (!prisma.uAgentWhatsAppConsent?.findUnique) return { ...DENIED };
  try {
    const row = await prisma.uAgentWhatsAppConsent.findUnique({ where: { userId } });
    if (!row) return { ...DENIED };
    return {
      granted: row.granted === true,
      canSendMessages: row.canSendMessages === true,
      canSendFiles: row.canSendFiles === true,
      canStartCalls: row.canStartCalls === true,
      grantedAt: row.grantedAt ? new Date(row.grantedAt).toISOString() : null,
    };
  } catch {
    return { ...DENIED };
  }
}

export async function upsertWhatsAppConsent(
  userId: string,
  patch: Partial<{
    granted: boolean;
    canSendMessages: boolean;
    canSendFiles: boolean;
    canStartCalls: boolean;
  }>
): Promise<WhatsAppConsent> {
  if (!prisma.uAgentWhatsAppConsent?.upsert) {
    throw new Error('WhatsApp consent table missing. Run prisma migrate deploy.');
  }
  const granted = patch.granted === true;
  const row = await prisma.uAgentWhatsAppConsent.upsert({
    where: { userId },
    create: {
      userId,
      granted,
      canSendMessages: granted && patch.canSendMessages !== false,
      canSendFiles: granted && patch.canSendFiles !== false,
      canStartCalls: granted && patch.canStartCalls !== false,
      grantedAt: granted ? new Date() : null,
      revokedAt: granted ? null : new Date(),
    },
    update: {
      ...(typeof patch.granted === 'boolean'
        ? {
            granted: patch.granted,
            grantedAt: patch.granted ? new Date() : undefined,
            revokedAt: patch.granted ? null : new Date(),
          }
        : {}),
      ...(typeof patch.canSendMessages === 'boolean'
        ? { canSendMessages: patch.canSendMessages }
        : {}),
      ...(typeof patch.canSendFiles === 'boolean' ? { canSendFiles: patch.canSendFiles } : {}),
      ...(typeof patch.canStartCalls === 'boolean' ? { canStartCalls: patch.canStartCalls } : {}),
    },
  });
  return {
    granted: row.granted === true,
    canSendMessages: row.canSendMessages === true,
    canSendFiles: row.canSendFiles === true,
    canStartCalls: row.canStartCalls === true,
    grantedAt: row.grantedAt ? new Date(row.grantedAt).toISOString() : null,
  };
}
