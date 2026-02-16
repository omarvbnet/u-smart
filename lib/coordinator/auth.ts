import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { CoordinatorRole } from '@prisma/client';

const COORDINATOR_JWT_SECRET = process.env.COORDINATOR_JWT_SECRET || process.env.JWT_SECRET || 'coordinator-secret-change-in-production';
const COOKIE_NAME = 'coordinator_token';
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export type CoordinatorPayload = {
  sub: string;       // userId
  email: string;
  companyId: string;
  role: CoordinatorRole;
  iat?: number;
  exp?: number;
};

export { COOKIE_NAME };

export async function hashPassword(password: string): Promise<string> {
  const { createHash } = await import('crypto');
  const salt = process.env.COORDINATOR_PASSWORD_SALT || 'usmart-cp-salt';
  return createHash('sha256').update(salt + password).digest('hex');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const h = await hashPassword(password);
  return h === hash;
}

export function createCoordinatorToken(payload: Omit<CoordinatorPayload, 'iat' | 'exp'>): string {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      role: payload.role,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    },
    COORDINATOR_JWT_SECRET
  );
}

export function verifyCoordinatorToken(token: string): CoordinatorPayload | null {
  try {
    const decoded = jwt.verify(token, COORDINATOR_JWT_SECRET) as JwtPayload & CoordinatorPayload;
    return {
      sub: decoded.sub as string,
      email: decoded.email,
      companyId: decoded.companyId,
      role: decoded.role as CoordinatorRole,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

export function getCoordinatorTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Require at least one of the given roles. Throws if unauthorized. */
export function requireRole(payload: CoordinatorPayload, allowed: CoordinatorRole[]): void {
  if (!allowed.includes(payload.role)) {
    const err = new Error('Forbidden');
    (err as any).status = 403;
    throw err;
  }
}
