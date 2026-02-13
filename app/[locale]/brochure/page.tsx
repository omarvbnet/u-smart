'use client';

import { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowLeft, FileDown, Check, Layers } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  BROCHURE_SERVICE_CONFIG,
  BROCHURE_SERVICES_ORDER,
} from '@/lib/brochure-service-config';

const WEBSITE_URL = 'https://www.usmart-iot.com';

// A4 print: 21 × 29.7 cm → 300 DPI = 2480 × 3508 px
const A4_WIDTH_CM = 21;
const A4_HEIGHT_CM = 29.7;
const PRINT_DPI = 300;
const A4_WIDTH_PX = Math.round((A4_WIDTH_CM / 2.54) * PRINT_DPI);   // 2480
const A4_HEIGHT_PX = Math.round((A4_HEIGHT_CM / 2.54) * PRINT_DPI); // 3508
const CANVAS_SCALE = PRINT_DPI / 96; // ~3.125 for 300 DPI from 96-DPI CSS

type FetchedService = {
  title: string;
  description: string;
  features: string[];
} | null;

export default function BrochurePage() {
  const t = useTranslations('Brochure');
  const tIndex = useTranslations('Index');
  const tAbout = useTranslations('About');
  const locale = useLocale();
  const brochureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const searchParams = useSearchParams();
  const serviceSlug = searchParams.get('service')?.toLowerCase().trim() || null;
  const [service, setService] = useState<FetchedService>(null);
  const isRtl = locale === 'ar' || locale === 'ku';

  // Fetch service when slug present
  useEffect(() => {
    if (!serviceSlug) {
      setService(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/services/slug/${encodeURIComponent(serviceSlug)}?locale=${encodeURIComponent(locale)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.service) return;
        setService({
          title: data.service.title,
          description: data.service.description,
          features: Array.isArray(data.service.features) ? data.service.features : [],
        });
      })
      .catch(() => setService(null));
    return () => {
      cancelled = true;
    };
  }, [serviceSlug, locale]);

  useEffect(() => {
    if (!isRtl) return;
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [isRtl]);

  const config = serviceSlug ? BROCHURE_SERVICE_CONFIG[serviceSlug] : null;
  const accent = config?.accent ?? '#1e40af';
  const accentLight = config?.accentLight ?? '#3b82f6';
  const accentBg = config?.accentBg ?? 'rgba(59, 130, 246, 0.08)';

  const handleDownloadPdf = async () => {
    const el = brochureRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#0a0f2e',
        scale: CANVAS_SCALE,
        useCORS: true,
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgW = canvas.width;
      const imgH = canvas.height;
      // Each brochure section = one A4 page at 300 DPI → slice height = A4_HEIGHT_PX
      const pageHeightPx = A4_HEIGHT_PX;
      const pageCount = Math.ceil(imgH / pageHeightPx) || 1;
      const scaleToPdf = pdfW / imgW;
      for (let i = 0; i < pageCount; i++) {
        if (i > 0) pdf.addPage();
        const sy = i * pageHeightPx;
        const sh = Math.min(pageHeightPx, imgH - sy);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgW;
        sliceCanvas.height = sh;
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0a0f2e';
          ctx.fillRect(0, 0, imgW, sh);
          ctx.drawImage(canvas, 0, sy, imgW, sh, 0, 0, imgW, sh);
        }
        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceH = sh * scaleToPdf;
        pdf.addImage(sliceData, 'PNG', 0, 0, pdfW, sliceH);
      }
      const name = serviceSlug ? `U-Smart-Profile-${serviceSlug}-${locale}` : `U-Smart-Profile-${locale}`;
      pdf.save(`${name}.pdf`);
    } catch (e) {
      console.error('Brochure PDF failed:', e);
    } finally {
      setExporting(false);
    }
  };

  // Resolve featured service title/description (API or About)
  const featuredTitle = service?.title ?? (config ? tAbout(config.aboutTitleKey) : null);
  const featuredDescription = service?.description ?? (config ? tAbout(config.aboutDescKey) : null);

  // Feature items from Index (e.g. qualityControlTechnologies.inspection.name + description/highlights)
  const featureItems: { name: string; description: string; highlights?: string[] }[] = [];
  if (config) {
    const indexObj = tIndex.raw(config.indexKey) as Record<string, unknown> | undefined;
    if (indexObj && typeof indexObj === 'object') {
      for (const key of config.featureKeys) {
        const item = (indexObj as Record<string, Record<string, unknown>>)[key];
        if (item && typeof item === 'object' && item.name) {
          featureItems.push({
            name: String(item.name),
            description: typeof item.description === 'string' ? item.description : '',
            highlights: Array.isArray(item.highlights) ? (item.highlights as string[]) : undefined,
          });
        }
      }
    }
  }
  // If we have API features and no Index items, use API features as simple list
  const useApiFeatures = featureItems.length === 0 && service?.features?.length;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="sticky top-20 z-10 flex items-center justify-between gap-4 px-4 py-3 bg-[#0A0A0F]/95 border-b border-white/10 backdrop-blur-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors"
        >
          <FileDown className="w-5 h-5" />
          {exporting ? '…' : t('downloadPdf')}
        </button>
      </div>

      <div
        ref={brochureRef}
        dir={isRtl ? 'rtl' : 'ltr'}
        lang={locale}
        className="brochure-content mx-auto"
        style={{
          fontFamily: isRtl ? "'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', Tahoma, Arial, sans-serif" : 'system-ui, sans-serif',
          width: `${A4_WIDTH_CM}cm`,
          minWidth: 320,
        }}
      >
        {/* Page 1 – Cover: A4 21×29.7 cm */}
        <section
          className="relative flex flex-col items-center justify-center px-8 py-16 text-center overflow-hidden"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: `linear-gradient(165deg, #0a0f2e 0%, ${accent}22 40%, #0f172a 100%)`,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Blueprint-style grid */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          {/* Hexagon pattern – engineering / technical */}
          <div className="absolute inset-0 opacity-[0.06]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="cover-hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
                  <path d="M28 0L56 14v28L28 56 0 42V14L28 0z" fill="none" stroke="currentColor" strokeWidth="0.6" />
                  <path d="M56 14L28 28v28M0 14l28 14v28" fill="none" stroke="currentColor" strokeWidth="0.4" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cover-hex)" style={{ color: '#94a3b8' }} />
            </svg>
          </div>
          <div className="relative z-10 w-28 h-28 rounded-2xl flex items-center justify-center mb-10" style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <img
              src="/logo/usmart.PNG"
              alt="U Smart"
              className="h-20 w-auto object-contain rounded-xl"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                if (el) {
                  el.style.display = 'none';
                  el.nextElementSibling?.classList.remove('hidden');
                }
              }}
            />
            <div className="hidden w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-3xl font-bold text-white/90">U</span>
            </div>
          </div>
          <h1
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 tracking-tight"
            style={{ letterSpacing: isRtl ? 0 : '-0.03em', lineHeight: 1.15 }}
          >
            {t('title')}
          </h1>
          {featuredTitle && (
            <p
              className="text-lg md:text-xl font-medium mb-4 max-w-xl"
              style={{ color: accentLight }}
            >
              {featuredTitle}
            </p>
          )}
          <p className="text-blue-200/90 text-base md:text-lg mb-8">
            {t('tagline')}
          </p>
          <p className="text-white/75 text-sm md:text-base max-w-2xl leading-relaxed">
            {t('headline')}
          </p>
          <div className="absolute bottom-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </section>

        {/* Page 2 – About Us: A4 21×29.7 cm */}
        <section
          className="relative py-16 px-8 md:px-12 bg-white text-gray-800 overflow-hidden flex flex-col justify-center"
          style={{ width: '100%', height: `${A4_HEIGHT_CM}cm`, minHeight: `${A4_HEIGHT_CM}cm` }}
        >
          <div className="absolute inset-0 opacity-[0.05]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="about-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e40af" strokeWidth="0.5" />
                </pattern>
                <pattern id="about-circles" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                  <circle cx="60" cy="60" r="24" fill="none" stroke="#64748b" strokeWidth="0.4" />
                  <circle cx="60" cy="60" r="12" fill="none" stroke="#64748b" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#about-grid)" />
              <rect width="100%" height="100%" fill="url(#about-circles)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ letterSpacing: isRtl ? 0 : '0.15em' }}>
              {t('pageAboutTitle')}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2 mb-8 pb-3 border-b-2" style={{ borderColor: accent }}>
              {t('pageAboutTitle')}
            </h2>
            <p className="text-lg leading-relaxed text-gray-700 mb-6">
              {t('description')}
            </p>
            <p className="text-base leading-relaxed text-gray-600 mb-6">
              {t('description2')}
            </p>
            <p className="text-base leading-relaxed text-gray-700 font-medium">
              {t('mission')}
            </p>
          </div>
        </section>

        {/* Featured Service: diagonal technical lines + triangles */}
        {featuredTitle && (featureItems.length > 0 || useApiFeatures || featuredDescription) && (
          <section
            className="relative py-16 px-8 md:px-12 overflow-hidden flex flex-col justify-center"
            style={{
              width: '100%',
              height: `${A4_HEIGHT_CM}cm`,
              minHeight: `${A4_HEIGHT_CM}cm`,
              backgroundColor: accentBg,
            }}
          >
            <div className="absolute inset-0 opacity-[0.06]" aria-hidden>
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="featured-diag" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                    <line x1="0" y1="0" x2="0" y2="24" stroke="#475569" strokeWidth="0.4" />
                  </pattern>
                  <pattern id="featured-tri" x="0" y="0" width="80" height="70" patternUnits="userSpaceOnUse">
                    <path d="M40 0L80 35 40 70 0 35z" fill="none" stroke="#64748b" strokeWidth="0.35" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#featured-diag)" />
                <rect width="100%" height="100%" fill="url(#featured-tri)" />
              </svg>
            </div>
            <div className="relative z-10 max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: accent }}>
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-500" style={{ letterSpacing: isRtl ? 0 : '0.1em' }}>
                    {t('pageServicesTitle')}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900" style={{ color: accent }}>
                    {featuredTitle}
                  </h2>
                </div>
              </div>
              {featuredDescription && (
                <p className="text-gray-700 leading-relaxed mb-10 max-w-3xl">
                  {featuredDescription}
                </p>
              )}
              {featureItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {featureItems.map((item, i) => (
                    <div
                      key={i}
                      className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: accent }}>
                          {i + 1}
                        </span>
                        <h3 className="font-bold text-gray-900 text-lg">{item.name}</h3>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed mb-3 pl-11">{item.description}</p>
                      {item.highlights && item.highlights.length > 0 && (
                        <ul className="pl-11 space-y-1.5 list-none">
                          {item.highlights.map((h, j) => (
                            <li key={j} className="flex items-center gap-2 text-sm text-gray-600">
                              <Check className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
                              {h}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : useApiFeatures && (
                <ul className="space-y-3 list-none p-0 m-0">
                  {service!.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-gray-700">
                      <Check className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Page 3 – Services: A4 21×29.7 cm */}
        <section
          className="relative py-16 px-8 md:px-12 bg-gray-50 text-gray-800 overflow-hidden flex flex-col justify-center"
          style={{ width: '100%', height: `${A4_HEIGHT_CM}cm`, minHeight: `${A4_HEIGHT_CM}cm` }}
        >
          <div className="absolute inset-0 opacity-[0.07]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="services-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="14" cy="14" r="0.8" fill="#475569" />
                </pattern>
                <pattern id="services-iso" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
                  <path d="M0 26h60M0 0l30 26M30 26l30-26" fill="none" stroke="#94a3b8" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#services-dots)" />
              <rect width="100%" height="100%" fill="url(#services-iso)" />
            </svg>
          </div>
          <div className="relative z-10">
<span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ letterSpacing: isRtl ? 0 : '0.15em' }}>
              {t('pageServicesTitle')}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2 mb-12 pb-3 border-b-2 border-gray-200">
              {t('pageServicesTitle')}
            </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            {BROCHURE_SERVICES_ORDER.map(({ slug, brochureKey }, i) => {
              const isFeatured = serviceSlug === slug;
              return (
                <div
                  key={slug}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    isFeatured
                      ? 'bg-white shadow-lg'
                      : 'bg-white border-gray-100 shadow-sm'
                  }`}
                  style={{
                    borderColor: isFeatured ? accent : undefined,
                    boxShadow: isFeatured ? `0 10px 40px -10px ${accent}40` : undefined,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: isFeatured ? accent : '#64748b' }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-gray-500">
                        {isFeatured ? (featuredTitle || t(brochureKey)) : t(brochureKey)}
                      </span>
                      {isFeatured && (
                        <span className="ml-2 px-2 py-0.5 rounded-md text-xs font-semibold text-white" style={{ backgroundColor: accent }}>
                          Featured
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </section>

        {/* Page 4 – Why Choose: A4 21×29.7 cm */}
        <section
          className="relative py-16 px-8 md:px-12 bg-white text-gray-800 overflow-hidden flex flex-col justify-center"
          style={{ width: '100%', height: `${A4_HEIGHT_CM}cm`, minHeight: `${A4_HEIGHT_CM}cm` }}
        >
          <div className="absolute inset-0 opacity-[0.05]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="why-chevron" x="0" y="0" width="64" height="32" patternUnits="userSpaceOnUse">
                  <path d="M0 16h20l12-16 12 16h20" fill="none" stroke="#1e40af" strokeWidth="0.45" />
                </pattern>
                <pattern id="why-lines" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="24" x2="48" y2="24" stroke="#64748b" strokeWidth="0.3" />
                  <line x1="24" y1="0" x2="24" y2="48" stroke="#64748b" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#why-chevron)" />
              <rect width="100%" height="100%" fill="url(#why-lines)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ letterSpacing: isRtl ? 0 : '0.15em' }}>
              {t('pageWhyTitle')}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2 mb-6 pb-3 border-b-2" style={{ borderColor: accent }}>
              {t('pageWhyTitle')}
            </h2>
            <p className="text-xl text-gray-700 mb-10 leading-relaxed">
              {t('valueProposition')}
            </p>
            <ul className="space-y-4 list-none p-0 m-0">
              {(t.raw('strengths') as string[]).map((s, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 text-white" style={{ backgroundColor: accent }}>
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-gray-700 leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Page 5 – Contact: A4 21×29.7 cm */}
        <section
          className="relative py-16 px-8 md:px-12 bg-gray-50 text-gray-800 overflow-hidden flex flex-col justify-center"
          style={{ width: '100%', height: `${A4_HEIGHT_CM}cm`, minHeight: `${A4_HEIGHT_CM}cm` }}
        >
          <div className="absolute inset-0 opacity-[0.06]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="contact-circuit" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="36" height="36" fill="none" stroke="#94a3b8" strokeWidth="0.35" />
                  <circle cx="18" cy="18" r="2" fill="none" stroke="#64748b" strokeWidth="0.4" />
                </pattern>
                <pattern id="contact-arcs" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                  <path d="M0 50 Q 50 0 100 50 Q 50 100 0 50" fill="none" stroke="#475569" strokeWidth="0.35" />
                  <path d="M50 0 Q 100 50 50 100 Q 0 50 50 0" fill="none" stroke="#475569" strokeWidth="0.35" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#contact-circuit)" />
              <rect width="100%" height="100%" fill="url(#contact-arcs)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ letterSpacing: isRtl ? 0 : '0.15em' }}>
              {t('pageContactTitle')}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2 mb-6 pb-3 border-b-2 border-gray-200 inline-block">
              {t('pageContactTitle')}
            </h2>
            <p className="text-lg text-gray-700 mb-10 max-w-2xl">
              {t('cta')}
            </p>
            <div className={`flex flex-wrap items-start gap-12 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className="space-y-2">
                <p className="font-semibold text-gray-900 text-lg">{t('contactUs')}</p>
                <p className="text-gray-600">{t('visit')}: {t('websiteUrl')}</p>
                <p className="text-gray-600">📧 {t('email')}</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                  <QRCodeSVG value={WEBSITE_URL} size={140} level="M" />
                </div>
                <span className="text-sm text-gray-500 text-center max-w-[160px]">{t('qrScan')}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
