/**
 * In-memory OTP store for development when DB is unavailable or not used.
 * Uses globalThis so the same store is shared across all API route invocations in this process.
 * Key: phone (normalized), Value: { code, expiresAt }
 */
const OTP_TTL_MS = 10 * 60 * 1000; // 10 min

declare global {
  // eslint-disable-next-line no-var
  var __otp_store: Map<string, { code: string; expiresAt: number }> | undefined;
}

function getStore(): Map<string, { code: string; expiresAt: number }> {
  if (typeof globalThis.__otp_store === 'undefined') {
    globalThis.__otp_store = new Map();
  }
  return globalThis.__otp_store;
}

export function setOtp(phone: string, code: string): void {
  const normalized = phone.trim();
  const codeStr = normalizeCode(code);
  getStore().set(normalized, {
    code: codeStr,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

/** Normalize code to 6 digits (string), e.g. 230 -> "000230". Exported for use in verify route. */
export function normalizeCode(code: string): string {
  const digits = String(code).replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
}

/** True if code matches in-memory OTP for this phone, without removing it (for verify-login peek). */
export function peekOtpValid(phone: string, code: string): boolean {
  const normalized = phone.trim();
  const codeStr = normalizeCode(code);
  const entry = getStore().get(normalized);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    getStore().delete(normalized);
    return false;
  }
  return normalizeCode(entry.code) === codeStr;
}

export function checkOtp(phone: string, code: string): boolean {
  const normalized = phone.trim();
  const codeStr = normalizeCode(code);
  const entry = getStore().get(normalized);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    getStore().delete(normalized);
    return false;
  }
  const storedNormalized = normalizeCode(entry.code);
  if (storedNormalized !== codeStr) return false;
  getStore().delete(normalized);
  return true;
}
