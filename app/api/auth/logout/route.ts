import { NextResponse } from 'next/server';
import { COOKIE_NAME, getAuthCookieOptions } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, '', { ...getAuthCookieOptions(), maxAge: 0 });
  return res;
}
