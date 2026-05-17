import type { Prisma, PrismaClient } from '@prisma/client';

/** Digits only (e.g. 9647701234567). */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** E.164-style +964… (matches Flutter login normalization). */
export function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return `+${trimmed.replace(/\D/g, '')}`;
}

/** Same if digits match, or Iraqi 077… vs 96477…. */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhoneDigits(a);
  const nb = normalizePhoneDigits(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const withZeroA = na.startsWith('964') ? `0${na.slice(3)}` : na;
  const with964A = na.startsWith('0') ? `964${na.slice(1)}` : na;
  return nb === withZeroA || nb === with964A;
}

/** Distinct stored-form candidates for exact-match DB filters. */
export function phoneLookupVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = normalizePhoneDigits(trimmed);
  if (!digits) return [];

  const e164 = normalizePhoneE164(trimmed);
  const local =
    digits.startsWith('964') && digits.length > 3 ? `0${digits.slice(3)}` : digits.startsWith('0') ? digits : null;

  const out = new Set<string>();
  if (trimmed) out.add(trimmed);
  if (e164) out.add(e164);
  if (digits) out.add(digits);
  if (local) out.add(local);
  return [...out];
}

export async function findTicketRequesterByPhone<S extends Prisma.TicketRequesterSelect>(
  prisma: PrismaClient,
  phone: string,
  args: {
    select: S;
    excludeId?: string;
  }
): Promise<Prisma.TicketRequesterGetPayload<{ select: S }> | null> {
  const variants = phoneLookupVariants(phone);
  if (variants.length === 0) return null;

  const candidates = await prisma.ticketRequester.findMany({
    where: {
      phone: { in: variants },
      ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
    },
    select: { id: true, phone: true },
  });

  const norm = normalizePhoneDigits(phone);
  const matched = candidates.find((row) => phonesMatch(norm, row.phone));
  if (!matched) return null;

  return prisma.ticketRequester.findUnique({
    where: { id: matched.id },
    select: args.select,
  });
}
