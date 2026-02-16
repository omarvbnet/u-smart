import { Request } from 'next/server';
import {
  getCoordinatorTokenFromRequest,
  verifyCoordinatorToken,
  requireRole,
  type CoordinatorPayload,
} from '@/lib/coordinator/auth';
import { CoordinatorRole } from '@prisma/client';

/**
 * Returns the coordinator JWT payload if the request is authenticated.
 * Returns null if no token or invalid token.
 */
export function getCoordinatorPayload(request: Request): CoordinatorPayload | null {
  const token = getCoordinatorTokenFromRequest(request);
  if (!token) return null;
  return verifyCoordinatorToken(token);
}

/**
 * Ensures the request is authenticated. Returns payload or throws response for 401.
 */
export function requireCoordinatorAuth(request: Request): CoordinatorPayload {
  const payload = getCoordinatorPayload(request);
  if (!payload) {
    const err = new Error('Unauthorized') as Error & { status?: number; json?: () => Promise<unknown> };
    err.status = 401;
    err.json = async () => ({ success: false, message: 'Authentication required' });
    throw err;
  }
  return payload;
}

/**
 * Ensures the request is authenticated and has one of the allowed roles.
 */
export function requireCoordinatorRole(request: Request, allowedRoles: CoordinatorRole[]): CoordinatorPayload {
  const payload = requireCoordinatorAuth(request);
  requireRole(payload, allowedRoles);
  return payload;
}
