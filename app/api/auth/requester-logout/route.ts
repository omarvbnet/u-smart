import { NextResponse } from 'next/server';
import { REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(REQUESTER_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
  });
  return res;
}
