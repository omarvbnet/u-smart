import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // انتظر القيمة وتأكد من وجودها، وإلا استخدم اللغة الافتراضية فوراً
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  try {
    // استخدام الـ locale المضمون (locale وليس requestLocale)
    const messages = (await import(`../messages/${locale}.json`)).default;
    
    return {
      locale,
      messages
    };
  } catch (error) {
    console.error(`خطأ في تحميل ملف اللغة [${locale}]:`, error);
    // حماية نهائية: تحميل ملف اللغة الافتراضية يدوياً في حال فشل الاستيراد الديناميكي
    const fallbackMessages = (await import(`../messages/ar.json`)).default;
    return {
      locale: 'ar',
      messages: fallbackMessages
    };
  }
});

