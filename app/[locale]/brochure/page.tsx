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
        scale: 2,
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
      const scale = pdfW / imgW;
      const totalPdfH = imgH * scale;
      const pageCount = Math.ceil(totalPdfH / pdfH) || 1;
      const pageHeightPx = pdfH / scale;
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
        const sliceH = sh * scale;
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
          maxWidth: 800,
          minWidth: 320,
        }}
      >
        {/* Page 1 – Cover (expert design) */}
        <section
          className="relative min-h-[100vh] flex flex-col items-center justify-center px-8 py-20 text-center overflow-hidden"
          style={{
            background: `linear-gradient(165deg, #0a0f2e 0%, ${accent}22 40%, #0f172a 100%)`,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
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

        {/* Page 2 – About Us (refined) */}
        <section className="py-20 px-8 md:px-16 bg-white text-gray-800">
          <div className="max-w-3xl">
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

        {/* Featured Service – only when service selected (expert section) */}
        {featuredTitle && (featureItems.length > 0 || useApiFeatures || featuredDescription) && (
          <section
            className="py-20 px-8 md:px-16"
            style={{ backgroundColor: accentBg }}
          >
            <div className="max-w-4xl mx-auto">
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

        {/* Page 3 – All Services Overview (professional cards) */}
        <section className="py-20 px-8 md:px-16 bg-gray-50 text-gray-800">
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
        </section>

        {/* Page 4 – Why Choose U Smart (elegant list) */}
        <section className="py-20 px-8 md:px-16 bg-white text-gray-800">
          <div className="max-w-3xl">
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

        {/* Page 5 – Contact & QR (professional footer) */}
        <section className="py-20 px-8 md:px-16 bg-gray-50 text-gray-800">
          <div className="max-w-3xl">
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
