import { prisma } from '@/lib/prisma';
import { checkOtp, normalizeCode, peekOtpValid } from '@/lib/otp-store';

/**
 * Validates phone OTP without consuming (same rules as consume) — use before login/account lookup
 * so "no account" flows can still call register with the same code.
 */
export async function peekPhoneOtpValid(rawPhone: string, rawCode: string): Promise<boolean> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const codeRaw = rawCode != null ? String(rawCode).trim() : '';
  const code = normalizeCode(codeRaw);
  if (!phone || !codeRaw) return false;

  if (peekOtpValid(phone, code)) return true;

  const db = prisma as unknown as {
    phoneOtp?: {
      findFirst: (args: {
        where: { phone: string; code: string; expiresAt: { gt: Date } };
        orderBy: { createdAt: 'desc' };
      }) => Promise<{ id: string } | null>;
    };
  };

  if (!db.phoneOtp?.findFirst) return false;
  const record = await db.phoneOtp.findFirst({
    where: { phone, code, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return !!record;
}

/**
 * Validates and consumes a phone OTP from memory and DB.
 */
export async function consumePhoneOtp(rawPhone: string, rawCode: string): Promise<boolean> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const codeRaw = rawCode != null ? String(rawCode).trim() : '';
  const code = normalizeCode(codeRaw);
  if (!phone || !codeRaw) return false;

  const db = prisma as unknown as {
    phoneOtp?: {
      findFirst: (args: {
        where: { phone: string; code: string; expiresAt: { gt: Date } };
        orderBy: { createdAt: 'desc' };
      }) => Promise<{ id: string } | null>;
      deleteMany: (args: { where: { phone: string } }) => Promise<unknown>;
    };
  };

  let valid = checkOtp(phone, code);
  if (!valid && db.phoneOtp?.findFirst) {
    const record = await db.phoneOtp.findFirst({
      where: { phone, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    valid = !!record;
    if (valid && db.phoneOtp?.deleteMany) {
      await db.phoneOtp.deleteMany({ where: { phone } });
    }
  }

  return valid;
}
