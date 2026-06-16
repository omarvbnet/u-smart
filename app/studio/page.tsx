'use client';

import Link from 'next/link';
import StudioLogo from './components/StudioLogo';
import { useStudio } from './lib/store';
import { useT } from './components/hooks';
import { STUDIO_LOCALES, LOCALE_LABELS, RTL_LOCALES, type StudioLocale } from './lib/i18n';
import { ArrowRight, ArrowLeft, MousePointerClick, ShieldCheck, Radio } from 'lucide-react';

export default function StudioLandingPage() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const setLocale = useStudio((s) => s.setLocale);
  const theme = useStudio((s) => s.theme);
  const rtl = RTL_LOCALES.has(locale);
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  const features = [
    { icon: MousePointerClick, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: ShieldCheck, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: Radio, title: t('feature3Title'), desc: t('feature3Desc') },
  ];

  return (
    <div
      data-studio-theme={theme}
      dir={rtl ? 'rtl' : 'ltr'}
      className="studio-root relative min-h-screen overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(34,211,238,0.12),transparent_70%)]" />

      <header className="relative flex items-center justify-between px-6 py-4">
        <StudioLogo />
        <div className="flex items-center gap-1">
          {STUDIO_LOCALES.map((l: StudioLocale) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${l === locale ? 'bg-cyan-400/15 text-cyan-300' : 'text-[var(--studio-muted)] hover:text-[var(--studio-text)]'}`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-panel)] px-4 py-1.5 text-xs font-medium text-cyan-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          {t('digitalTwin')} · {t('electrical')} · {t('smartBuilding')}
        </div>

        <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          U<span className="text-cyan-400">Smart</span> Studio
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-[var(--studio-muted)]">
          {t('tagline')}
        </p>

        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/studio/design"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02]"
          >
            {t('open')}
            <Arrow className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-20 grid gap-5 sm:grid-cols-3">
          {features.map((f, i) => (
            <div key={i} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] p-6 text-start">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--studio-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 text-xs text-[var(--studio-muted)]">{t('poweredBy')}</p>
      </main>
    </div>
  );
}
