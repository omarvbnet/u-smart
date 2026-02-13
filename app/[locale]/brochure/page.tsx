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
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4 px-5 py-3.5 bg-[#0A0A0F]/90 border-b border-white/10 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-white shadow-lg disabled:opacity-50 transition-all duration-200"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accentLight} 100%)`,
            boxShadow: `0 4px 14px -2px ${accent}60`,
          }}
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
          fontFamily: isRtl ? "'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', Tahoma, Arial, sans-serif" : "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          width: `${A4_WIDTH_CM}cm`,
          minWidth: 320,
          ['--brochure-accent' as string]: accent,
          ['--brochure-accent-light' as string]: accentLight,
        }}
      >
        {/* Page 1 – Cover: Premium dark gradient + mesh + refined patterns */}
        <section
          className="relative flex flex-col items-center justify-center px-10 py-20 text-center overflow-hidden"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: `linear-gradient(152deg, #050816 0%, #0a0f2e 25%, ${accent}18 55%, #0f1629 85%, #050816 100%)`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Mesh glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 90% 60% at 50% -10%, ${accent}20, transparent 55%),
                radial-gradient(ellipse 70% 50% at 85% 60%, ${accent}08, transparent 50%),
                radial-gradient(ellipse 70% 50% at 15% 80%, ${accent}06, transparent 50%)`,
            }}
          />
          {/* Technical grid – finer, subtler */}
          <div
            className="absolute inset-0 opacity-[0.09]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* Hexagon pattern */}
          <div className="absolute inset-0 opacity-[0.05]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="cover-hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
                  <path d="M28 0L56 14v28L28 56 0 42V14L28 0z" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cover-hex)" style={{ color: '#94a3b8' }} />
            </svg>
          </div>
          {/* Logo container – glass style */}
          <div
            className="relative z-10 w-32 h-32 rounded-2xl flex items-center justify-center mb-12 ring-1 ring-white/10"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)',
              boxShadow: '0 8px 32px -8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <img
              src="/logo/usmart.PNG"
              alt="U Smart"
              className="h-24 w-auto object-contain rounded-xl max-h-[5.5rem]"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                if (el) {
                  el.style.display = 'none';
                  (el.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                }
              }}
            />
            <div className="hidden w-20 h-20 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-white/90">U</span>
            </div>
          </div>
          <h1
            className="relative z-10 text-[clamp(1.75rem,5vw,2.75rem)] font-bold text-white mb-3 tracking-tight"
            style={{ letterSpacing: isRtl ? 0 : '-0.04em', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}
          >
            {t('title')}
          </h1>
          {featuredTitle && (
            <p
              className="relative z-10 text-lg font-semibold mb-4 max-w-xl"
              style={{ color: accentLight, textShadow: '0 1px 10px rgba(0,0,0,0.2)' }}
            >
              {featuredTitle}
            </p>
          )}
          <p className="relative z-10 text-blue-200/95 text-base font-medium mb-6 tracking-wide">
            {t('tagline')}
          </p>
          <p className="relative z-10 text-white/80 text-[0.95rem] max-w-2xl leading-[1.65] font-light">
            {t('headline')}
          </p>
          <div
            className="absolute bottom-10 left-[10%] right-[10%] h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
          />
        </section>

        {/* Page 2 – About Us: Clean editorial layout */}
        <section
          className="relative py-16 px-10 md:px-14 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 50%, #f8fafc 100%)',
            color: '#1e293b',
          }}
        >
          <div className="absolute inset-0 opacity-[0.04]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="about-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke={accent} strokeWidth="0.6" />
                </pattern>
                <pattern id="about-circles" x="0" y="0" width="160" height="160" patternUnits="userSpaceOnUse">
                  <circle cx="80" cy="80" r="32" fill="none" stroke="#94a3b8" strokeWidth="0.35" />
                  <circle cx="80" cy="80" r="16" fill="none" stroke="#94a3b8" strokeWidth="0.25" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#about-grid)" />
              <rect width="100%" height="100%" fill="url(#about-circles)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="brochure-section-title block" style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
              {t('pageAboutTitle')}
            </span>
            <h2
              className="brochure-h2 mt-2 mb-8 pb-4 text-gray-900"
              style={{ borderBottom: `3px solid ${accent}` }}
            >
              {t('pageAboutTitle')}
            </h2>
            <p className="text-[1.05rem] leading-[1.75] text-gray-700 mb-6 font-[450]">
              {t('description')}
            </p>
            <p className="text-[0.95rem] leading-[1.7] text-gray-600 mb-6">
              {t('description2')}
            </p>
            <p
              className="text-[0.95rem] leading-[1.7] text-gray-800 font-semibold pl-6 border-l-4"
              style={{ borderColor: accent }}
            >
              {t('mission')}
            </p>
          </div>
        </section>

        {/* Featured Service: diagonal technical lines + triangles */}
        {featuredTitle && (featureItems.length > 0 || useApiFeatures || featuredDescription) && (
          <section
            className="relative py-16 px-10 md:px-14 overflow-hidden flex flex-col justify-center"
            style={{
              width: '100%',
              height: `${A4_HEIGHT_CM}cm`,
              minHeight: `${A4_HEIGHT_CM}cm`,
              background: `linear-gradient(135deg, ${accentBg} 0%, rgba(255,255,255,0.6) 50%, ${accentBg} 100%)`,
              color: '#1e293b',
            }}
          >
            <div className="absolute inset-0 opacity-[0.05]" aria-hidden>
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="featured-diag" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
                    <line x1="0" y1="0" x2="0" y2="20" stroke={accent} strokeWidth="0.35" />
                  </pattern>
                  <pattern id="featured-tri" x="0" y="0" width="96" height="84" patternUnits="userSpaceOnUse">
                    <path d="M48 0L96 42 48 84 0 42z" fill="none" stroke="#94a3b8" strokeWidth="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#featured-diag)" />
                <rect width="100%" height="100%" fill="url(#featured-tri)" />
              </svg>
            </div>
            <div className="relative z-10 max-w-4xl mx-auto">
              <div className="flex items-center gap-4 mb-8">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg"
                  style={{ backgroundColor: accent, boxShadow: `0 4px 14px -2px ${accent}50` }}
                >
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <span className="brochure-section-title block" style={{ letterSpacing: isRtl ? 0 : '0.1em' }}>
                    {t('pageServicesTitle')}
                  </span>
                  <h2 className="brochure-h2 mt-0.5" style={{ color: accent }}>
                    {featuredTitle}
                  </h2>
                </div>
              </div>
              {featuredDescription && (
                <p className="text-gray-700 leading-[1.7] mb-10 max-w-3xl text-[0.95rem]">
                  {featuredDescription}
                </p>
              )}
              {featureItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {featureItems.map((item, i) => (
                    <div
                      key={i}
                      className="p-6 rounded-2xl bg-white/95 border border-gray-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <span
                          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm"
                          style={{ backgroundColor: accent }}
                        >
                          {i + 1}
                        </span>
                        <h3 className="font-bold text-gray-900 text-[1.05rem] leading-tight">{item.name}</h3>
                      </div>
                      <p className="text-gray-600 text-[0.9rem] leading-relaxed mb-3 pl-12">{item.description}</p>
                      {item.highlights && item.highlights.length > 0 && (
                        <ul className="pl-12 space-y-1.5 list-none">
                          {item.highlights.map((h, j) => (
                            <li key={j} className="flex items-center gap-2 text-[0.875rem] text-gray-600">
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
                <ul className="space-y-4 list-none p-0 m-0">
                  {service!.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-gray-700 pl-2">
                      <span
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: accent }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-[0.95rem]">{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Page 3 – Services: Modern card grid */}
        <section
          className="relative py-16 px-10 md:px-14 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
            color: '#1e293b',
          }}
        >
          <div className="absolute inset-0 opacity-[0.06]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="services-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="12" cy="12" r="0.6" fill="#64748b" />
                </pattern>
                <pattern id="services-iso" x="0" y="0" width="64" height="56" patternUnits="userSpaceOnUse">
                  <path d="M0 28h64M0 0l32 28M32 28l32-28" fill="none" stroke="#94a3b8" strokeWidth="0.25" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#services-dots)" />
              <rect width="100%" height="100%" fill="url(#services-iso)" />
            </svg>
          </div>
          <div className="relative z-10">
            <span className="brochure-section-title block" style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
              {t('pageServicesTitle')}
            </span>
            <h2 className="brochure-h2 mt-2 mb-10 pb-4 text-gray-900" style={{ borderBottom: '2px solid #e2e8f0' }}>
              {t('pageServicesTitle')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
              {BROCHURE_SERVICES_ORDER.map(({ slug, brochureKey }, i) => {
                const isFeatured = serviceSlug === slug;
                return (
                  <div
                    key={slug}
                    className={`p-6 rounded-2xl border transition-all ${
                      isFeatured ? 'bg-white shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)]' : 'bg-white/90 border-gray-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]'
                    }`}
                    style={{
                      borderColor: isFeatured ? accent : 'rgba(226, 232, 240, 0.9)',
                      borderWidth: isFeatured ? 2 : 1,
                      boxShadow: isFeatured ? `0 8px 30px -8px ${accent}35, 0 2px 12px -4px rgba(0,0,0,0.08)` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                        style={{
                          backgroundColor: isFeatured ? accent : '#64748b',
                          boxShadow: isFeatured ? `0 4px 12px -2px ${accent}50` : '0 2px 8px -2px rgba(0,0,0,0.15)',
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className={`text-[0.95rem] font-medium block ${isFeatured ? 'text-gray-900' : 'text-gray-600'}`}>
                          {isFeatured ? (featuredTitle || t(brochureKey)) : t(brochureKey)}
                        </span>
                        {isFeatured && (
                          <span
                            className="inline-block mt-1 px-2.5 py-0.5 rounded-lg text-[0.7rem] font-bold uppercase tracking-wider text-white"
                            style={{ backgroundColor: accent }}
                          >
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

        {/* Page 4 – Why Choose: Clean list with accent highlights */}
        <section
          className="relative py-16 px-10 md:px-14 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
            color: '#1e293b',
          }}
        >
          <div className="absolute inset-0 opacity-[0.04]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="why-chevron" x="0" y="0" width="72" height="36" patternUnits="userSpaceOnUse">
                  <path d="M0 18h24l14-18 14 18h24" fill="none" stroke={accent} strokeWidth="0.4" />
                </pattern>
                <pattern id="why-lines" x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="28" x2="56" y2="28" stroke="#94a3b8" strokeWidth="0.25" />
                  <line x1="28" y1="0" x2="28" y2="56" stroke="#94a3b8" strokeWidth="0.25" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#why-chevron)" />
              <rect width="100%" height="100%" fill="url(#why-lines)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="brochure-section-title block" style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
              {t('pageWhyTitle')}
            </span>
            <h2 className="brochure-h2 mt-2 mb-6 pb-4 text-gray-900" style={{ borderBottom: `3px solid ${accent}` }}>
              {t('pageWhyTitle')}
            </h2>
            <p className="text-[1.1rem] text-gray-700 mb-10 leading-[1.65] font-medium">
              {t('valueProposition')}
            </p>
            <ul className="space-y-5 list-none p-0 m-0">
              {(t.raw('strengths') as string[]).map((s, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 text-white shadow-sm"
                    style={{ backgroundColor: accent }}
                  >
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  </span>
                  <span className="text-gray-700 leading-[1.6] text-[0.95rem] pt-0.5">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Page 5 – Contact: Tech-forward layout with QR */}
        <section
          className="relative py-16 px-10 md:px-14 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            background: 'linear-gradient(165deg, #f8fafc 0%, #f1f5f9 40%, #e2e8f0 100%)',
            color: '#1e293b',
          }}
        >
          <div className="absolute inset-0 opacity-[0.05]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="contact-circuit" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="40" height="40" fill="none" stroke="#64748b" strokeWidth="0.3" />
                  <circle cx="20" cy="20" r="2.5" fill="none" stroke="#94a3b8" strokeWidth="0.35" />
                </pattern>
                <pattern id="contact-arcs" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                  <path d="M0 60 Q 60 0 120 60 Q 60 120 0 60" fill="none" stroke="#64748b" strokeWidth="0.3" />
                  <path d="M60 0 Q 120 60 60 120 Q 0 60 60 0" fill="none" stroke="#64748b" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#contact-circuit)" />
              <rect width="100%" height="100%" fill="url(#contact-arcs)" />
            </svg>
          </div>
          <div className="relative z-10 max-w-3xl">
            <span className="brochure-section-title block" style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
              {t('pageContactTitle')}
            </span>
            <h2 className="brochure-h2 mt-2 mb-6 pb-4 text-gray-900 inline-block" style={{ borderBottom: '2px solid #cbd5e1' }}>
              {t('pageContactTitle')}
            </h2>
            <p className="text-[1rem] text-gray-700 mb-10 max-w-2xl leading-[1.65]">
              {t('cta')}
            </p>
            <div className={`flex flex-wrap items-start gap-14 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className="space-y-3 min-w-0">
                <p className="font-bold text-gray-900 text-[1.1rem]">{t('contactUs')}</p>
                <p className="text-gray-600 text-[0.95rem]">{t('visit')}: {t('websiteUrl')}</p>
                <p className="text-gray-600 text-[0.95rem]">📧 {t('email')}</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div
                  className="rounded-2xl border-2 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]"
                  style={{ borderColor: accent }}
                >
                  <QRCodeSVG value={WEBSITE_URL} size={140} level="M" />
                </div>
                <span className="text-[0.8rem] text-gray-500 text-center max-w-[160px] font-medium">{t('qrScan')}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
