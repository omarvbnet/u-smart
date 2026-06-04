'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShieldCheck,
  Bell,
  MapPin,
  ClipboardCheck,
  Wifi,
  Sparkles,
} from 'lucide-react';

const APP_STORE_URL = 'https://apps.apple.com/iq/app/provisor/id6760374377';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.usmart.usmart_qc';

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || navigator.vendor || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac with touch support
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

function AppleBadge() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.42 2.21-1.12 3.02-.78.92-2.06 1.63-3.1 1.55-.13-1.1.43-2.27 1.08-3.01.74-.84 2.08-1.49 3.06-1.56.06.33.08.66.08 1zM20.7 17.06c-.55 1.27-.82 1.84-1.53 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C-.06 16.6-.6 12.06 1.06 9.36c1.18-1.93 3.04-3.06 4.79-3.06 1.78 0 2.9 1.01 4.37 1.01 1.43 0 2.3-1.01 4.36-1.01 1.56 0 3.21.85 4.39 2.32-3.86 2.11-3.23 7.62.73 9.44z" />
    </svg>
  );
}

function GooglePlayBadge() {
  return (
    <svg viewBox="0 0 512 512" className="h-7 w-7" aria-hidden>
      <path
        fill="#00D4FF"
        d="M47 24.4C42.7 28.9 40 35.6 40 44.4v423.2c0 8.8 2.7 15.5 7 20l1.5 1.4 237-237v-5.6l-237-237z"
      />
      <path
        fill="#FFD400"
        d="M363.4 333.3 284.5 254.4v-5.6l78.9-78.9 1.8 1 93.4 53.1c26.7 15.1 26.7 39.9 0 55.1l-93.4 53.1z"
      />
      <path
        fill="#FF3333"
        d="M365.2 332.3 284.5 251.6 47 489c8.8 9.3 23.3 10.5 39.7 1.2z"
      />
      <path
        fill="#48FF48"
        d="M365.2 170.9 86.7 12.6C70.3 3.3 55.8 4.5 47 13.8l237.5 237.8z"
      />
    </svg>
  );
}

function StoreButton({
  href,
  badge,
  top,
  bottom,
  highlighted,
}: {
  href: string;
  badge: React.ReactNode;
  top: string;
  bottom: string;
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-2xl border px-5 py-3.5 transition-all duration-200 ${
        highlighted
          ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_30px_-10px_rgba(245,158,11,0.6)] hover:bg-amber-500/15'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
      }`}
    >
      <span
        className={`shrink-0 ${highlighted ? 'text-amber-300' : 'text-white'}`}
      >
        {badge}
      </span>
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {top}
        </span>
        <span className="text-base font-semibold text-white">{bottom}</span>
      </span>
    </Link>
  );
}

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: 'QC tickets on the go',
    desc: 'Create, assign and track quality-control and supervision tickets from the field.',
  },
  {
    icon: MapPin,
    title: 'Site mapping',
    desc: 'Locate sites, capture geo-tagged inspections and navigate to assignments.',
  },
  {
    icon: Bell,
    title: 'Real-time alerts',
    desc: 'Instant notifications keep engineers and companies in sync at every step.',
  },
  {
    icon: Wifi,
    title: 'Works offline',
    desc: 'Capture inspections without a connection and sync automatically later.',
  },
];

export default function DownloadClient() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setReady(true);
  }, []);

  const iosBadge = (
    <StoreButton
      href={APP_STORE_URL}
      badge={<AppleBadge />}
      top="Download on the"
      bottom="App Store"
      highlighted={platform === 'ios'}
    />
  );

  const androidBadge = (
    <StoreButton
      href={PLAY_STORE_URL}
      badge={<GooglePlayBadge />}
      top="Get it on"
      bottom="Google Play"
      highlighted={platform === 'android'}
    />
  );

  // On a known platform, show the recommended store first.
  const orderedBadges = useMemo(() => {
    if (platform === 'android') return [androidBadge, iosBadge];
    return [iosBadge, androidBadge];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const recommendation =
    platform === 'ios'
      ? 'We detected an iOS device — get it from the App Store.'
      : platform === 'android'
        ? 'We detected an Android device — get it from Google Play.'
        : 'Available for iPhone, iPad and Android devices.';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[320px] rounded-full bg-amber-400/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-5 py-16 sm:py-20">
        {/* Brand */}
        <div className="mb-10 flex items-center gap-2 text-sm text-gray-400">
          <span className="text-lg font-bold tracking-wide text-amber-400">
            Proviser
          </span>
          <span className="text-gray-600">by U-SMART</span>
        </div>

        {/* App icon */}
        <div className="relative mb-7">
          <div className="absolute inset-0 -z-10 rounded-[28px] bg-amber-400/30 blur-2xl" />
          <Image
            src="/app/icon-512.png"
            alt="Provisor app icon"
            width={112}
            height={112}
            className="h-28 w-28 rounded-[28px] border border-white/10 shadow-2xl"
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          Get the <span className="text-amber-400">Provisor</span> app
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-gray-400 sm:text-lg">
          Quality control and supervision tickets for field teams and companies
          — now in your pocket.
        </p>

        {/* Recommendation pill */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-300">
          <Sparkles className="h-4 w-4 text-amber-400" />
          {ready ? recommendation : 'Choose your platform below.'}
        </div>

        {/* Store badges */}
        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {orderedBadges.map((b, i) => (
            <div key={i} className="w-full sm:w-auto">
              {b}
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-400">
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* Trust line */}
        <div className="mt-12 flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-amber-400/70" />
          Official app from U-SMART · Secure &amp; verified on the App Store and
          Google Play
        </div>

        {/* Footer links */}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-600">
          <Link href="/proviser/login" className="hover:text-amber-400">
            Open web app
          </Link>
          <span className="text-gray-800">·</span>
          <Link href="/privacy-policy" className="hover:text-gray-400">
            Privacy Policy
          </Link>
          <span className="text-gray-800">·</span>
          <Link href="/terms-of-service" className="hover:text-gray-400">
            Terms of Service
          </Link>
          <span className="text-gray-800">·</span>
          <Link
            href="https://www.usmart-iot.com"
            className="hover:text-gray-400"
          >
            usmart-iot.com
          </Link>
        </footer>
      </div>
    </div>
  );
}
