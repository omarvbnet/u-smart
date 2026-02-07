'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
const RTL_LOCALES = ['ar', 'ku'];

export default function LocaleHtmlAttributes() {
  const pathname = usePathname();

  useEffect(() => {
    const segment = pathname?.split('/')[1];
    const locale = LOCALES.includes(segment as (typeof LOCALES)[number])
      ? (segment as (typeof LOCALES)[number])
      : 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
  }, [pathname]);

  return null;
}
