import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key-for-usmart-api-2024';
const COOKIE_NAME = 'requester_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type RequesterPayload = {
  requesterId: string;
  username: string;
  name: string | null;
};

export function createRequesterToken(payload: RequesterPayload): string {
  return jwt.sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE },
    JWT_SECRET
  );
}

export function verifyRequesterToken(token: string): RequesterPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & RequesterPayload;
    return {
      requesterId: decoded.requesterId,
      username: decoded.username,
      name: decoded.name ?? null,
    };
  } catch {
    return null;
  }
}

export function getRequesterCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

export { COOKIE_NAME as REQUESTER_COOKIE_NAME };
