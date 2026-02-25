import { cookies } from 'next/headers';
import crypto from 'crypto';

const OTP_VERIFIED_COOKIE = 'otp_verified';
const OTP_VERIFIED_MAX_AGE = 60 * 15; // 15 minutes
const SECRET = process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET || 'otp-secret-change-in-production';

function encode(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64url');
}
function decode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signPhoneVerified(phone: string): string {
  const payload = JSON.stringify({ phone, exp: Date.now() + OTP_VERIFIED_MAX_AGE * 1000 });
  const data = encode(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyPhoneVerifiedToken(token: string): string | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(decode(data));
    if (payload.exp < Date.now()) return null;
    return typeof payload.phone === 'string' ? payload.phone : null;
  } catch {
    return null;
  }
}

export async function setPhoneVerifiedCookie(phone: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OTP_VERIFIED_COOKIE, signPhoneVerified(phone), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: OTP_VERIFIED_MAX_AGE,
    path: '/',
  });
}

export async function getVerifiedPhoneFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OTP_VERIFIED_COOKIE)?.value;
  if (!token) return null;
  return verifyPhoneVerifiedToken(token);
}

export const OTP_VERIFIED_COOKIE_NAME = OTP_VERIFIED_COOKIE;

// Email verification for dashboard registration 2FA
const EMAIL_VERIFIED_COOKIE = 'email_verified';
const EMAIL_VERIFIED_MAX_AGE = 60 * 20; // 20 minutes

export function signEmailVerified(email: string): string {
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + EMAIL_VERIFIED_MAX_AGE * 1000,
  });
  const data = encode(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyEmailVerifiedToken(token: string): string | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(decode(data));
    if (payload.exp < Date.now()) return null;
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function setEmailVerifiedCookie(email: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(EMAIL_VERIFIED_COOKIE, signEmailVerified(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: EMAIL_VERIFIED_MAX_AGE,
    path: '/',
  });
}

export async function getVerifiedEmailFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(EMAIL_VERIFIED_COOKIE)?.value;
  if (!token) return null;
  return verifyEmailVerifiedToken(token);
}

export const EMAIL_VERIFIED_COOKIE_NAME = EMAIL_VERIFIED_COOKIE;
