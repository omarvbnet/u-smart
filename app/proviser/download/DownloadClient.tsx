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
type Lang = 'ar' | 'en' | 'ku' | 'tr';

const SUPPORTED_LANGS: Lang[] = ['ar', 'en', 'ku', 'tr'];
const RTL_LANGS: Lang[] = ['ar', 'ku'];

const LANG_NAMES: Record<Lang, string> = {
  ar: 'العربية',
  ku: 'کوردی',
  tr: 'Türkçe',
  en: 'English',
};

type Feature = { title: string; desc: string };
type Dict = {
  brandBy: string;
  title: string; // contains the literal "Provisor" to be highlighted
  subtitle: string;
  recIos: string;
  recAndroid: string;
  recOther: string;
  choose: string;
  appStoreTop: string;
  playTop: string;
  features: Feature[];
  trust: string;
  openWebApp: string;
  privacy: string;
  terms: string;
};

const DICT: Record<Lang, Dict> = {
  en: {
    brandBy: 'by U-SMART',
    title: 'Get the Provisor app',
    subtitle:
      'Quality control and supervision tickets for field teams and companies — now in your pocket.',
    recIos: 'We detected an iOS device — get it from the App Store.',
    recAndroid: 'We detected an Android device — get it from Google Play.',
    recOther: 'Available for iPhone, iPad and Android devices.',
    choose: 'Choose your platform below.',
    appStoreTop: 'Download on the',
    playTop: 'Get it on',
    features: [
      {
        title: 'QC tickets on the go',
        desc: 'Create, assign and track quality-control and supervision tickets from the field.',
      },
      {
        title: 'Site mapping',
        desc: 'Locate sites, capture geo-tagged inspections and navigate to assignments.',
      },
      {
        title: 'Real-time alerts',
        desc: 'Instant notifications keep engineers and companies in sync at every step.',
      },
      {
        title: 'Works offline',
        desc: 'Capture inspections without a connection and sync automatically later.',
      },
    ],
    trust:
      'Official app from U-SMART · Secure & verified on the App Store and Google Play',
    openWebApp: 'Open web app',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  },
  ar: {
    brandBy: 'من U-SMART',
    title: 'حمّل تطبيق Provisor',
    subtitle:
      'تذاكر مراقبة الجودة والإشراف للفرق الميدانية والشركات — الآن بين يديك.',
    recIos: 'اكتشفنا أنك تستخدم جهاز iOS — حمّله من App Store.',
    recAndroid: 'اكتشفنا أنك تستخدم جهاز Android — حمّله من Google Play.',
    recOther: 'متوفر لأجهزة iPhone وiPad وAndroid.',
    choose: 'اختر منصتك من الأسفل.',
    appStoreTop: 'حمّله من',
    playTop: 'احصل عليه من',
    features: [
      {
        title: 'تذاكر الجودة أينما كنت',
        desc: 'أنشئ تذاكر مراقبة الجودة والإشراف وعيّنها وتابعها من الميدان.',
      },
      {
        title: 'خرائط المواقع',
        desc: 'حدّد المواقع والتقط عمليات تفتيش موسومة بالموقع وتنقّل إلى مهامك.',
      },
      {
        title: 'تنبيهات فورية',
        desc: 'إشعارات لحظية تبقي المهندسين والشركات على تواصل في كل خطوة.',
      },
      {
        title: 'يعمل دون اتصال',
        desc: 'سجّل عمليات التفتيش دون إنترنت وتتم المزامنة تلقائياً لاحقاً.',
      },
    ],
    trust: 'تطبيق رسمي من U-SMART · آمن وموثّق على App Store وGoogle Play',
    openWebApp: 'افتح تطبيق الويب',
    privacy: 'سياسة الخصوصية',
    terms: 'شروط الخدمة',
  },
  ku: {
    brandBy: 'لە U-SMART',
    title: 'ئەپی Provisor دابگرە',
    subtitle:
      'بلیتەکانی کۆنترۆڵی جۆری و سەرپەرشتی بۆ تیمە مەیدانییەکان و کۆمپانیاکان — ئێستا لە بەردەستتدایە.',
    recIos: 'بینیمان ئامێرێکی iOS بەکاردەهێنیت — لە App Store دایبگرە.',
    recAndroid: 'بینیمان ئامێرێکی Android بەکاردەهێنیت — لە Google Play دایبگرە.',
    recOther: 'بەردەستە بۆ ئامێرەکانی iPhone، iPad و Android.',
    choose: 'پلاتفۆرمەکەت لە خوارەوە هەڵبژێرە.',
    appStoreTop: 'دایبگرە لە',
    playTop: 'بیهێنە لە',
    features: [
      {
        title: 'بلیتی جۆری لە هەر شوێنێک',
        desc: 'بلیتی کۆنترۆڵی جۆری و سەرپەرشتی دروستبکە، دیاریبکە و بەدوایدا بگەڕێ لە مەیدان.',
      },
      {
        title: 'نەخشەی شوێنەکان',
        desc: 'شوێنەکان بدۆزەرەوە، پشکنینی شوێن‌دیاریکراو تۆمار بکە و بگەڕێ بۆ ئەرکەکانت.',
      },
      {
        title: 'ئاگادارکردنەوەی خێرا',
        desc: 'ئاگادارکردنەوەی دەستبەجێ ئەندازیار و کۆمپانیاکان لە هەموو هەنگاوێکدا هاوکات ڕادەگرێت.',
      },
      {
        title: 'بەبێ ئینتەرنێت کاردەکات',
        desc: 'پشکنینەکان بەبێ پەیوەندی تۆمار بکە و دواتر خۆکارانە هاوکات دەکرێن.',
      },
    ],
    trust: 'ئەپی فەرمی لە U-SMART · پارێزراو و پشتڕاستکراوە لە App Store و Google Play',
    openWebApp: 'ئەپی وێب بکەرەوە',
    privacy: 'سیاسەتی تایبەتمەندی',
    terms: 'مەرجەکانی خزمەتگوزاری',
  },
  tr: {
    brandBy: 'U-SMART tarafından',
    title: 'Provisor uygulamasını indirin',
    subtitle:
      'Saha ekipleri ve şirketler için kalite kontrol ve denetim biletleri — artık cebinizde.',
    recIos: "Bir iOS cihazı algıladık — App Store'dan indirin.",
    recAndroid: "Bir Android cihazı algıladık — Google Play'den indirin.",
    recOther: 'iPhone, iPad ve Android cihazlar için kullanılabilir.',
    choose: 'Aşağıdan platformunuzu seçin.',
    appStoreTop: 'Şuradan indirin',
    playTop: 'Şuradan edinin',
    features: [
      {
        title: 'Her yerde QC biletleri',
        desc: 'Kalite kontrol ve denetim biletlerini sahadan oluşturun, atayın ve takip edin.',
      },
      {
        title: 'Saha haritalama',
        desc: 'Sahaları bulun, konum etiketli denetimler yapın ve görevlerinize yön bulun.',
      },
      {
        title: 'Anlık bildirimler',
        desc: 'Anlık bildirimler mühendisleri ve şirketleri her adımda senkronize tutar.',
      },
      {
        title: 'Çevrimdışı çalışır',
        desc: 'Denetimleri bağlantı olmadan kaydedin, daha sonra otomatik olarak senkronize olsun.',
      },
    ],
    trust:
      "U-SMART'ın resmi uygulaması · App Store ve Google Play'de güvenli ve doğrulanmış",
    openWebApp: 'Web uygulamasını aç',
    privacy: 'Gizlilik Politikası',
    terms: 'Hizmet Şartları',
  },
};

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

function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('provisor_lang') as Lang | null;
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const candidates =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || 'en'];
  for (const raw of candidates) {
    const code = raw.toLowerCase().split('-')[0] as Lang;
    if (SUPPORTED_LANGS.includes(code)) return code;
    // Treat common Kurdish tags (ckb, kmr) as Kurdish
    if (raw.toLowerCase().startsWith('ckb') || raw.toLowerCase().startsWith('kmr')) {
      return 'ku';
    }
  }
  return 'en';
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
      <span className="flex flex-col text-start leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {top}
        </span>
        <span className="text-base font-semibold text-white">{bottom}</span>
      </span>
    </Link>
  );
}

const FEATURE_ICONS = [ClipboardCheck, MapPin, Bell, Wifi];

export default function DownloadClient() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [lang, setLang] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setLang(detectLang());
    setReady(true);
  }, []);

  const t = DICT[lang];
  const dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';

  const changeLang = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem('provisor_lang', next);
    } catch {
      /* ignore */
    }
  };

  const [titleBefore, titleAfter] = useMemo(() => {
    const parts = t.title.split('Provisor');
    return [parts[0] ?? '', parts[1] ?? ''];
  }, [t.title]);

  const iosBadge = (
    <StoreButton
      href={APP_STORE_URL}
      badge={<AppleBadge />}
      top={t.appStoreTop}
      bottom="App Store"
      highlighted={platform === 'ios'}
    />
  );

  const androidBadge = (
    <StoreButton
      href={PLAY_STORE_URL}
      badge={<GooglePlayBadge />}
      top={t.playTop}
      bottom="Google Play"
      highlighted={platform === 'android'}
    />
  );

  const orderedBadges =
    platform === 'android' ? [androidBadge, iosBadge] : [iosBadge, androidBadge];

  const recommendation =
    platform === 'ios' ? t.recIos : platform === 'android' ? t.recAndroid : t.recOther;

  return (
    <div
      dir={dir}
      lang={lang}
      className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[320px] rounded-full bg-amber-400/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-5 py-12 sm:py-16">
        {/* Top bar: brand + language switcher */}
        <div className="mb-8 flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-lg font-bold tracking-wide text-amber-400">
              Provisor
            </span>
            <span className="text-gray-600">{t.brandBy}</span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changeLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  lang === l
                    ? 'bg-amber-500 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>

        {/* App logo */}
        <div className="relative mb-7">
          <div className="absolute inset-0 -z-10 rounded-[28px] bg-amber-400/30 blur-2xl" />
          <Image
            src="/app/provisor-logo.png"
            alt="Provisor app logo"
            width={120}
            height={120}
            className="h-28 w-28 rounded-[28px] border border-white/10 shadow-2xl"
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          {titleBefore}
          <span className="text-amber-400">Provisor</span>
          {titleAfter}
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-gray-400 sm:text-lg">
          {t.subtitle}
        </p>

        {/* Recommendation pill */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-300">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
          {ready ? recommendation : t.choose}
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
          {t.features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? ClipboardCheck;
            return (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Trust line */}
        <div className="mt-12 flex items-center gap-2 text-center text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400/70" />
          {t.trust}
        </div>

        {/* Footer links */}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-600">
          <Link href="/proviser/login" className="hover:text-amber-400">
            {t.openWebApp}
          </Link>
          <span className="text-gray-800">·</span>
          <Link href="/privacy-policy" className="hover:text-gray-400">
            {t.privacy}
          </Link>
          <span className="text-gray-800">·</span>
          <Link href="/terms-of-service" className="hover:text-gray-400">
            {t.terms}
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
