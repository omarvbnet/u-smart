import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const API_KEY_PREFIX = 'usk_';

export const TICKET_API_REQUEST_ELIGIBLE_ROLES = new Set([
  'COMPANY',
  'MANAGER',
  'COORDINATOR',
]);

export function isEligibleForTicketApiRequest(role: string | null | undefined): boolean {
  return TICKET_API_REQUEST_ELIGIBLE_ROLES.has(String(role ?? '').toUpperCase());
}

export function generateTicketApiKey(): { fullKey: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(24).toString('hex');
  const fullKey = `${API_KEY_PREFIX}${secret}`;
  const prefix = fullKey.slice(0, 12);
  const hash = hashTicketApiKey(fullKey);
  return { fullKey, prefix, hash };
}

export function hashTicketApiKey(fullKey: string): string {
  return crypto.createHash('sha256').update(fullKey).digest('hex');
}

export function extractTicketApiKeyFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    if (raw.startsWith(API_KEY_PREFIX)) return raw;
  }
  const headerKey = req.headers.get('x-api-key')?.trim();
  if (headerKey?.startsWith(API_KEY_PREFIX)) return headerKey;
  return null;
}

export type ResolvedTicketApiKey = {
  id: string;
  requesterId: string;
  label: string | null;
};

export async function resolveTicketApiKey(
  fullKey: string
): Promise<ResolvedTicketApiKey | null> {
  if (!fullKey.startsWith(API_KEY_PREFIX) || fullKey.length < 20) return null;
  const prefix = fullKey.slice(0, 12);
  const hash = hashTicketApiKey(fullKey);
  const delegate = prisma.ticketApiKey;
  if (!delegate?.findFirst) return null;

  const row = await delegate.findFirst({
    where: {
      keyPrefix: prefix,
      keyHash: hash,
      revokedAt: null,
    },
    select: { id: true, requesterId: true, label: true },
  });
  if (!row) return null;

  await delegate.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    id: row.id,
    requesterId: row.requesterId,
    label: row.label ?? null,
  };
}
