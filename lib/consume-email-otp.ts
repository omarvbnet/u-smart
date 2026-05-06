import { prisma } from '@/lib/prisma';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { normalizeEmailInput } from '@/lib/email-input';

/**
 * Validates the 6-digit email OTP and removes it (memory + DB) so it cannot be reused.
 */
export async function consumeEmailOtp(rawEmail: string, rawCode: string): Promise<boolean> {
  const email = typeof rawEmail === 'string' ? normalizeEmailInput(rawEmail).toLowerCase() : '';
  const codeRaw = rawCode != null ? String(rawCode).trim() : '';
  const digits = codeRaw.replace(/\D/g, '');
  const code = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
  if (!email || !codeRaw) return false;

  const db = prisma as unknown as {
    emailOtp?: {
      findFirst: (args: {
        where: { email: string; code: string; expiresAt: { gt: Date } };
        orderBy: { createdAt: 'desc' };
      }) => Promise<{ id: string } | null>;
      deleteMany: (args: { where: { email: string } }) => Promise<unknown>;
    };
  };

  let valid = checkEmailOtp(email, code);
  if (!valid && db.emailOtp?.findFirst) {
    const record = await db.emailOtp.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    valid = !!record;
    if (valid && db.emailOtp?.deleteMany) {
      await db.emailOtp.deleteMany({ where: { email } });
    }
  }

  return valid;
}
