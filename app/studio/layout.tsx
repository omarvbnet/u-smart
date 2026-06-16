import type { Metadata } from 'next';
import { getStudioWebOrigin } from '@/lib/studio-host';
import './studio.css';

export const metadata: Metadata = {
  title: {
    default: 'U Smart Studio — Proviser Electrical Digital Twin',
    template: '%s | U Smart Studio',
  },
  description:
    'U Smart Studio — a next-generation Electrical, HVAC, Smart Home and Building Automation design & simulation platform (Digital Twin).',
  metadataBase: new URL(getStudioWebOrigin()),
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
