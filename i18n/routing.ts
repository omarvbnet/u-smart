import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  // 1. اللغات المدعومة لشركة المدن الذكية
  locales: ['ar', 'en', 'ku', 'tr'],

  // 2. اللغة الافتراضية عند فتح الموقع لأول مرة
  defaultLocale: 'ar',

  // 3. خيار إظهار رمز اللغة في الرابط (دائماً يظهر لضمان الـ SEO)
  localePrefix: 'always'
});

// 4. تصدير الأدوات الذكية للتنقل (استخدم هذه بدلاً من 'next/link')
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
