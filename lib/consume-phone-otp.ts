import { prisma } from '@/lib/prisma';
import { normalizePhoneE164, phoneLookupVariants } from '@/lib/phone-match';
import { checkOtp, normalizeCode, peekOtpValid as peekOtpInMemory } from '@/lib/otp-store';

/**
 * Validates phone OTP without consuming (same rules as consume) — use before login/account lookup
 * so "no account" flows can still call register with the same code.
 */
export async function peekPhoneOtpValid(rawPhone: string, rawCode: string): Promise<boolean> {
  const phone = normalizePhoneE164(typeof rawPhone === 'string' ? rawPhone : '');
  const codeRaw = rawCode != null ? String(rawCode).trim() : '';
  const code = normalizeCode(codeRaw);
  if (!phone || !codeRaw) return false;

  for (const variant of phoneLookupVariants(phone)) {
    if (peekOtpInMemory(variant, code)) return true;
  }

  const db = prisma as unknown as {
    phoneOtp?: {
      findFirst: (args: {
        where: { phone: string; code: string; expiresAt: { gt: Date } };
        orderBy: { createdAt: 'desc' };
      }) => Promise<{ id: string } | null>;
    };
  };

  if (!db.phoneOtp?.findFirst) return false;
  for (const variant of phoneLookupVariants(phone)) {
    const record = await db.phoneOtp.findFirst({
      where: { phone: variant, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (record) return true;
  }
  return false;
}

async function consumePhoneOtpFromDb(phone: string, code: string): Promise<boolean> {
  const db = prisma as unknown as {
    phoneOtp?: {
      findFirst: (args: {
        where: { phone: string; code: string; expiresAt: { gt: Date } };
        orderBy: { createdAt: 'desc' };
      }) => Promise<{ id: string } | null>;
      deleteMany: (args: { where: { phone: string } }) => Promise<unknown>;
    };
  };
  if (!db.phoneOtp?.findFirst) return false;

  for (const variant of phoneLookupVariants(phone)) {
    const record = await db.phoneOtp.findFirst({
      where: { phone: variant, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) continue;
    if (db.phoneOtp.deleteMany) {
      await db.phoneOtp.deleteMany({ where: { phone: variant } });
    }
    return true;
  }
  return false;
}

/**
 * Validates and consumes a phone OTP from memory and DB.
 */
export async function consumePhoneOtp(rawPhone: string, rawCode: string): Promise<boolean> {
  const phone = normalizePhoneE164(typeof rawPhone === 'string' ? rawPhone : '');
  const codeRaw = rawCode != null ? String(rawCode).trim() : '';
  const code = normalizeCode(codeRaw);
  if (!phone || !codeRaw) return false;

  let valid = false;
  for (const variant of phoneLookupVariants(phone)) {
    if (checkOtp(variant, code)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    valid = await consumePhoneOtpFromDb(phone, code);
  }

  return valid;
}
