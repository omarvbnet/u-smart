import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { isProviserAppHost } from '@/lib/proviser-host';

const handleLocales = createIntlMiddleware({
  locales: ['ar', 'en', 'ku', 'tr'],
  defaultLocale: 'ar',
});

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  return response;
}

export default function middleware(request: NextRequest) {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DATABASE_URL غير موجود');
  }

  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  if (isProviserAppHost(host)) {
    if (pathname.startsWith('/proviser') || pathname.startsWith('/api')) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/proviser' : `/proviser${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname.startsWith('/proviser')) {
    return NextResponse.next();
  }

  const response = handleLocales(request);
  return response ? applySecurityHeaders(response) : NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|admin|coordinator|proviser|_next|.*\\..*).*)'],
};
