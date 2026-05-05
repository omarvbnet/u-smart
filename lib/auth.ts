import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key-for-usmart-api-2024';
const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type AuthPayload = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  mustChangePassword?: boolean;
};

export function createToken(payload: AuthPayload): string {
  return jwt.sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE },
    JWT_SECRET
  );
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & AuthPayload;
    return {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name ?? null,
      role: decoded.role,
      mustChangePassword: decoded.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}

export function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

export { COOKIE_NAME };
