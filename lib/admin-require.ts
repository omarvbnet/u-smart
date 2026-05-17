import { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export function requireAdmin(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return { ok: false, status: 401, message: 'Not authenticated' };
  }
  const payload = verifyToken(token);
  if (!payload) {
    return { ok: false, status: 401, message: 'Invalid or expired session' };
  }
  if (payload.role !== 'ADMIN') {
    return { ok: false, status: 403, message: 'Admin privileges required' };
  }
  return { ok: true };
}
