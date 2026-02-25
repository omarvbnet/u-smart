/**
 * In-memory email OTP store for development when DB is unavailable.
 * Uses globalThis so the same store is shared across all API route invocations.
 * Key: email (normalized lowercase), Value: { code, expiresAt }
 */
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000; // 10 min

declare global {
  // eslint-disable-next-line no-var
  var __email_otp_store: Map<string, { code: string; expiresAt: number }> | undefined;
}

function getStore(): Map<string, { code: string; expiresAt: number }> {
  if (typeof globalThis.__email_otp_store === 'undefined') {
    globalThis.__email_otp_store = new Map();
  }
  return globalThis.__email_otp_store;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function setEmailOtp(email: string, code: string): void {
  const key = normalizeEmail(email);
  const digits = String(code).replace(/\D/g, '');
  const codeStr = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
  getStore().set(key, {
    code: codeStr,
    expiresAt: Date.now() + EMAIL_OTP_TTL_MS,
  });
}

export function checkEmailOtp(email: string, code: string): boolean {
  const key = normalizeEmail(email);
  const digits = String(code).replace(/\D/g, '');
  const codeStr = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
  const entry = getStore().get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    getStore().delete(key);
    return false;
  }
  const storedDigits = String(entry.code).replace(/\D/g, '');
  const storedCode = storedDigits.length >= 6 ? storedDigits.slice(-6) : storedDigits.padStart(6, '0');
  if (codeStr !== storedCode) return false;
  getStore().delete(key);
  return true;
}
