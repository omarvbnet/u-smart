import type { Metadata } from 'next';
import { getProviserWebOrigin } from '@/lib/proviser-host';

export const metadata: Metadata = {
  title: {
    default: 'Proviser — QC & Supervision',
    template: '%s | Proviser',
  },
  description: 'Quality control and supervision tickets for field teams and companies.',
  metadataBase: new URL(getProviserWebOrigin()),
  robots: { index: false, follow: false },
};

export default function ProviserLayout({ children }: { children: React.ReactNode }) {
  return children;
}
