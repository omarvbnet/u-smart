import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { isProviserAppHost } from '@/lib/proviser-host';
import { routing } from '@/i18n/routing';

const handleLocales = createIntlMiddleware({
  locales: [...routing.locales],
  defaultLocale: routing.defaultLocale,
});

/** Marketing/legal pages live under `app/[locale]/…`, not under `/proviser`. */
const LEGAL_PAGE_SLUGS = new Set(['privacy-policy', 'terms-of-service']);

function isLocalizedLegalPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1 && LEGAL_PAGE_SLUGS.has(segments[0]!)) return true;
  if (
    segments.length === 2 &&
    routing.locales.includes(segments[0] as (typeof routing.locales)[number]) &&
    LEGAL_PAGE_SLUGS.has(segments[1]!)
  ) {
    return true;
  }
  return false;
}

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
    if (isLocalizedLegalPath(pathname)) {
      const response = handleLocales(request);
      return response ? applySecurityHeaders(response) : NextResponse.next();
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
