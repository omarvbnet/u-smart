import { NextRequest } from 'next/server';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import type { RequesterPayload } from '@/lib/requester-auth';

/**
 * Extract and verify the requester JWT from either:
 *  1. Authorization: Bearer <token>  (mobile apps)
 *  2. requester_token cookie          (web dashboard)
 */
export function getRequesterFromRequest(req: NextRequest): { token: string; payload: RequesterPayload } | null {
  let raw: string | undefined;

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    raw = authHeader.slice(7).trim();
  }

  if (!raw) {
    raw = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
  }

  if (!raw) return null;

  const payload = verifyRequesterToken(raw);
  if (!payload) return null;

  return { token: raw, payload };
}
