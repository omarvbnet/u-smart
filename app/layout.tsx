import type { Metadata } from 'next';
import './globals.css';
import LocaleHtmlAttributes from '@/components/LocaleHtmlAttributes';

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://usmart-iot.com');

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'U-SMART – Smart Homes, Networking & Software Solutions',
    template: '%s | U-SMART',
  },
  description:
    'U-SMART delivers cutting-edge technology solutions for smart homes, enterprise networking, and custom software development. ' +
    'Pioneering digital transformation through innovation and excellence. Based in Iraq, Kirkuk.',
  keywords: ['smart home', 'home automation', 'KNX', 'enterprise networking', 'fiber optic', 'software development', 'Iraq', 'Kirkuk', 'U-SMART'],
  authors: [{ name: 'U-SMART', url: baseUrl }],
  creator: 'U-SMART',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'U-SMART',
    title: 'U-SMART – Smart Homes, Networking & Software Solutions',
    description:
      'U-SMART delivers cutting-edge technology solutions for smart homes, enterprise networking, and custom software development. Pioneering digital transformation through innovation and excellence.',
  },
  icons: {
    icon: '/logo/usmart.PNG',
    shortcut: '/logo/usmart.PNG',
    apple: '/logo/usmart.PNG',
  },
  appleWebApp: {
    capable: true,
    title: 'U-SMART',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LocaleHtmlAttributes />
        {children}
      </body>
    </html>
  );
}
