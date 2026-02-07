import type { Metadata } from 'next';
import './globals.css';
import LocaleHtmlAttributes from '@/components/LocaleHtmlAttributes';

export const metadata: Metadata = {
  title: 'U-SMART',
  description: 'Pioneering digital transformation through innovation and excellence.',
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
