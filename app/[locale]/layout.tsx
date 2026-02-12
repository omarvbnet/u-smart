import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import Navbar from '@/components/Navbar';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'ar') {
    return {
      title: 'U-SMART – المدن الذكية، المنازل الذكية والحلول التقنية',
      description:
        'U-SMART حلول تقنية للمدن الذكية والمنازل الذكية، الشبكات المؤسسية والبرمجيات. ريادة التحول الرقمي من خلال الابتكار والتميز. العراق، كركوك.',
      keywords: ['المدن الذكية', 'منازل ذكية', 'أتمتة المنازل', 'KNX', 'شبكات مؤسسية', 'ألياف بصرية', 'تطوير برمجيات', 'العراق', 'كركوك', 'U-SMART'],
    };
  }
  return {};
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await params;
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="bg-[#0a0f1a] min-h-screen">
        <Navbar />
        <main className="pt-20">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
