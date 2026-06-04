import type { Metadata } from 'next';
import { getProviserWebOrigin } from '@/lib/proviser-host';
import DownloadClient from './DownloadClient';

const ORIGIN = getProviserWebOrigin();

export const metadata: Metadata = {
  title: 'Download the Provisor app — iOS & Android',
  description:
    'Download Provisor by U-SMART for iPhone, iPad and Android. Quality control and supervision tickets for field teams and companies.',
  alternates: { canonical: `${ORIGIN}/download` },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Download the Provisor app',
    description:
      'Quality control and supervision tickets for field teams and companies — get Provisor for iOS and Android.',
    url: `${ORIGIN}/download`,
    siteName: 'Provisor',
    images: [{ url: `${ORIGIN}/app/provisor-logo.png`, width: 512, height: 512 }],
    type: 'website',
  },
};

export default function ProviserDownloadPage() {
  return <DownloadClient />;
}
