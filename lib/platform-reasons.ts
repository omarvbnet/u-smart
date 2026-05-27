import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type PlatformReasonKind = 'MAINTENANCE' | 'EXPENSE';
export type PlatformReasonAudience = 'INDIVIDUAL' | 'COMPANY' | 'BOTH';

export type PlatformReasonRow = {
  id: string;
  kind: PlatformReasonKind;
  audience: PlatformReasonAudience;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function audienceFromRequesterRole(role: string | null | undefined): PlatformReasonAudience | null {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'PERSONAL') return 'INDIVIDUAL';
  if (r === 'COMPANY' || r === 'COMPANY_OWNER') return 'COMPANY';
  return null;
}

export async function listActiveReasons(opts: {
  kind: PlatformReasonKind;
  audience: PlatformReasonAudience;
}): Promise<PlatformReasonRow[]> {
  try {
    const rows = await prisma.platformReason.findMany({
      where: {
        kind: opts.kind,
        active: true,
        OR: [{ audience: opts.audience }, { audience: 'BOTH' }],
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows as PlatformReasonRow[];
  } catch {
    return [];
  }
}

export async function incrementReasonUsage(reasonLabel: string, opts: {
  kind: PlatformReasonKind;
  audience: PlatformReasonAudience;
}): Promise<void> {
  const trimmed = reasonLabel.trim();
  if (!trimmed) return;
  try {
    await prisma.platformReason.updateMany({
      where: {
        kind: opts.kind,
        label: trimmed,
        OR: [{ audience: opts.audience }, { audience: 'BOTH' }],
      },
      data: { usageCount: { increment: 1 } },
    });
  } catch (e) {
    console.error('incrementReasonUsage:', e);
  }
}
