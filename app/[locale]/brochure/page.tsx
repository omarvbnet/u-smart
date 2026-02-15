'use client';

import { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  ArrowLeft,
  FileDown,
  Check,
  Layers,
  Sparkles,
  Building2,
  Target,
  BarChart3,
  ShieldCheck,
  Zap,
  Home,
  Cable,
  Leaf,
  ClipboardCheck,
  Network,
  Code2,
  Search,
  Eye,
  Shield,
  FileSearch,
  TrendingUp,
  LayoutList,
  Box,
  Link2,
  Map,
  PencilRuler,
  Wrench,
  Cpu,
  Radio,
  Wifi,
  Server,
  Smartphone,
  Terminal,
  Database,
  HardDrive,
  Mail,
  Globe,
  Lightbulb,
  PanelTop,
  Thermometer,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  BROCHURE_SERVICE_CONFIG,
  BROCHURE_SERVICES_ORDER,
  SERVICE_IMAGES,
  FEATURE_IMAGES,
  WHY_CHOOSE_ICONS,
  FEATURE_ICONS,
} from '@/lib/brochure-service-config';

const WEBSITE_URL = 'https://www.usmart-iot.com';

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Sparkles,
  Building2,
  Target,
  BarChart3,
  ShieldCheck,
  Zap,
  Home,
  Cable,
  Leaf,
  ClipboardCheck,
  Network,
  Code2,
  Layers,
  Search,
  Eye,
  Shield,
  FileSearch,
  TrendingUp,
  LayoutList,
  Box,
  Link2,
  Map,
  PencilRuler,
  Wrench,
  Cpu,
  Radio,
  Wifi,
  Server,
  Smartphone,
  Terminal,
  Database,
  HardDrive,
  Mail,
  Globe,
  Lightbulb,
  PanelTop,
  Thermometer,
};

function BrochureIcon({ name, className = 'w-5 h-5', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[name] ?? Layers;
  const content = <Icon className={className} />;
  return style ? <span style={style} className="inline-flex">{content}</span> : content;
}

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
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect);
    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect2);
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      link.parentNode?.removeChild(link);
      preconnect2.parentNode?.removeChild(preconnect2);
      preconnect.parentNode?.removeChild(preconnect);
    };
  }, [isRtl]);

  const config = serviceSlug ? BROCHURE_SERVICE_CONFIG[serviceSlug] : null;
  const accent = config?.accent ?? '#1e40af';
  const accentLight = config?.accentLight ?? '#3b82f6';
  const accentDark = config?.accentDark ?? '#1e3a8a';
  const accentBg = config?.accentBg ?? 'rgba(59, 130, 246, 0.12)';
  const coverBg = config?.coverBg ?? '#0f172a';
  const pageBg = config?.pageBg ?? '#f8fafc';
  const boxBg = config?.boxBg ?? '#ffffff';

  const handleDownloadPdf = async () => {
    const el = brochureRef.current;
    if (!el) return;
    setExporting(true);
    try {
      // RTL: wait for Arabic/Kurdish fonts to load before capture (fixes broken text in PDF)
      if (isRtl && typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
        // Extra brief delay for Google Fonts (Amiri) to paint
        await new Promise((r) => setTimeout(r, 150));
      }
      // Scroll brochure into view and ensure full content is laid out
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      await new Promise((r) => requestAnimationFrame(r));
      const canvas = await html2canvas(el, {
        backgroundColor: coverBg,
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
          ctx.fillStyle = coverBg;
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
          style={{ backgroundColor: accent, boxShadow: `0 4px 14px -2px ${accent}60` }}
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
          letterSpacing: isRtl ? 0 : undefined,
          ['--brochure-accent' as string]: accent,
          ['--brochure-accent-light' as string]: accentLight,
        }}
      >
        {/* Page 1 – Cover: Creative agency style (main image + curved branding, Our Services, About Us, Contact) */}
        <section
          className={`relative flex flex-col overflow-hidden ${isRtl ? '' : ''}`}
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: '#f8fafc',
            color: '#1e293b',
          }}
        >
          {/* Top: main image (left) + curved accent with logo (right) */}
          <div className={`flex shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`} style={{ height: '42%', minHeight: 140 }}>
            <div className="relative w-[55%] overflow-hidden rounded-br-[20%] rounded-bl-[8%]" style={{ backgroundColor: '#e2e8f0' }}>
              <img
                src={SERVICE_IMAGES[BROCHURE_SERVICES_ORDER[0]?.slug] || ''}
                alt=""
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div
              className="relative w-[45%] flex items-center justify-center pl-6 pr-8 py-6"
              style={{ backgroundColor: accent }}
            >
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0,0 L100,0 L100,100 Q0,100 0,0 Z" fill={accent} />
              </svg>
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center bg-white/20 border-2 border-white/40 mb-3">
                  <img src="/logo/usmart.PNG" alt="U Smart" className="h-12 sm:h-14 w-auto object-contain" onError={(e) => { const el = e.target as HTMLImageElement; if (el) { el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.classList.remove('hidden'); } }} />
                  <div className="hidden w-12 h-12 rounded-xl bg-white/30 flex items-center justify-center"><span className="text-2xl font-bold text-white">U</span></div>
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white leading-tight" style={{ letterSpacing: isRtl ? 0 : '0.02em' }}>
                  U SMART
                </h1>
                <p className="text-xs text-white/95 mt-1">{t('title')}</p>
              </div>
            </div>
          </div>

          {/* Mid: Our Services (left) + About Us (right) */}
          <div className={`flex flex-1 min-h-0 px-6 py-4 gap-6 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="flex-1 min-w-0">
              <h2 className={`text-sm font-bold text-gray-800 mb-3 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>{t('coverOurServices')}</h2>
              <div className="space-y-2.5">
                {BROCHURE_SERVICES_ORDER.slice(0, 3).map(({ slug, brochureKey, icon }) => {
                  const svcCfg = BROCHURE_SERVICE_CONFIG[slug];
                  const svcAccent = svcCfg?.accent ?? accent;
                  const svcTitle = svcCfg ? tAbout(svcCfg.aboutTitleKey) : t(brochureKey);
                  const shortDesc = svcCfg ? (tAbout(svcCfg.aboutDescKey) as string).slice(0, 65) + '…' : t('headline');
                  return (
                    <div key={slug} className="flex gap-3">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: svcAccent }}>
                        <BrochureIcon name={icon} className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900">{svcTitle}</p>
                        <p className="text-[0.65rem] text-gray-600 leading-snug mt-0.5">{shortDesc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`text-sm font-bold text-gray-800 mb-3 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>{t('coverAboutUs')}</h2>
              <p className="text-[0.7rem] sm:text-[0.75rem] text-gray-600 leading-relaxed">{t('description')}</p>
            </div>
          </div>

          {/* Bottom: curved Contact strip + web */}
          <div className="relative shrink-0 h-20 overflow-hidden">
            <div className="absolute inset-0 flex items-center" style={{ backgroundColor: accent }}>
              <svg className="absolute top-0 left-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0,100 L0,40 Q50,0 100,40 L100,100 Z" fill={accent} />
              </svg>
              <div className={`relative z-10 w-full flex flex-wrap items-center justify-between gap-3 px-6 py-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className="flex flex-wrap items-center gap-4 text-white text-[0.7rem] sm:text-xs">
                  <span className="flex items-center gap-1.5">
                    <BrochureIcon name="Mail" className="w-4 h-4" />
                    {t('email')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BrochureIcon name="Globe" className="w-4 h-4" />
                    {t('contactUs')}
                  </span>
                </div>
                <span className="text-white/95 text-[0.65rem] sm:text-xs font-medium">
                  {t('visit')}: {t('websiteUrl')}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Page 2 – About Us: Solid background, text in boxes */}
        <section
          className="relative py-12 px-8 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: pageBg,
            color: '#1e293b',
          }}
        >
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
              <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                <BrochureIcon name="Building2" className="w-7 h-7" style={{ color: accent }} />
              </span>
              <div>
                <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.1em' }}>
                  {t('pageAboutTitle')}
                </span>
                <h2 className="brochure-h2 mt-1 text-gray-900" style={{ color: accent }}>
                  {t('pageAboutTitle')}
                </h2>
              </div>
            </div>
            <div className="p-5 rounded-xl border-2 flex gap-4 items-start" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
              <span className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}12` }}>
                <BrochureIcon name="Globe" className="w-10 h-10" style={{ color: accent }} />
              </span>
              <p className="text-[0.95rem] leading-[1.7] text-gray-700 font-medium flex-1">{t('description')}</p>
            </div>
            <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}40`, backgroundColor: boxBg }}>
              <p className="text-[0.9rem] leading-[1.65] text-gray-600">{t('description2')}</p>
            </div>
            <div className="p-5 rounded-xl border-l-4 pl-5" style={{ borderColor: accent, backgroundColor: `${accent}10` }}>
              <p className="text-[0.95rem] leading-[1.7] text-gray-800 font-semibold">{t('mission')}</p>
            </div>
          </div>
        </section>

        {/* Featured Service: diagonal technical lines + triangles */}
        {featuredTitle && (featureItems.length > 0 || useApiFeatures || featuredDescription) && (
          <section
            className="relative py-12 px-8 overflow-hidden flex flex-col justify-center"
            style={{
              width: '100%',
              height: `${A4_HEIGHT_CM}cm`,
              minHeight: `${A4_HEIGHT_CM}cm`,
              backgroundColor: pageBg,
              color: '#1e293b',
            }}
          >
            <div className="relative z-10 max-w-4xl mx-auto space-y-4">
              <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: accent }}>
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.1em' }}>
                    {t('pageServicesTitle')}
                  </span>
                  <h2 className="brochure-h2 mt-0.5" style={{ color: accent }}>
                    {featuredTitle}
                  </h2>
                </div>
              </div>
              {featuredDescription && (
                <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
                  <p className="text-[0.9rem] leading-[1.65] text-gray-700">{featuredDescription}</p>
                </div>
              )}
              {featureItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {featureItems.map((item, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-xl border-2"
                      style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <span
                          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white"
                          style={{ backgroundColor: accent }}
                        >
                          <BrochureIcon
                            name={FEATURE_ICONS[config!.featureKeys[i]] ?? 'Layers'}
                            className="w-5 h-5"
                          />
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
                <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
                  <ul className="space-y-3 list-none p-0 m-0">
                    {service!.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-3 text-gray-700">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: accent }}>
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-[0.9rem]">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Systems We Use page – Smart Home only: KNX, Buspro, Zigbee, Electrical Solutions */}
        {config?.systemsPageKey && config?.systemsKeys && config.systemsKeys.length > 0 && (() => {
          const systemsObj = tIndex.raw(config.systemsPageKey) as Record<string, unknown> | undefined;
          if (!systemsObj || typeof systemsObj !== 'object') return null;
          const title = (systemsObj.title as string) || 'Systems We Use';
          const intro = (systemsObj.intro as string) || '';
          const idealForLabel = (systemsObj.idealForLabel as string) || 'Ideal for';
          const advantagesLabel = (systemsObj.advantagesLabel as string) || 'Advantages';
          const disadvantagesLabel = (systemsObj.disadvantagesLabel as string) || 'Disadvantages';
          return (
            <section
              className="relative py-12 px-8 overflow-visible flex flex-col justify-start"
              style={{
                width: '100%',
                minHeight: `${A4_HEIGHT_CM}cm`,
                backgroundColor: pageBg,
                color: '#1e293b',
              }}
            >
              <div className="relative z-10 max-w-4xl mx-auto space-y-4">
                <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
                  <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                    <BrochureIcon name="Cpu" className="w-7 h-7" style={{ color: accent }} />
                  </span>
                  <div>
                    <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.1em' }}>
                      {t('pageServicesTitle')}
                    </span>
                    <h2 className="brochure-h2 mt-1 text-gray-900" style={{ color: accent }}>
                      {title}
                    </h2>
                  </div>
                </div>
                {intro && (
                  <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
                    <p className="text-[0.9rem] leading-[1.65] text-gray-700">{intro}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {config.systemsKeys.map((key) => {
                    const sys = (systemsObj as Record<string, Record<string, unknown>>)[key];
                    if (!sys || typeof sys !== 'object') return null;
                    const name = String(sys.name ?? key);
                    const description = String(sys.description ?? '');
                    const idealFor = sys.idealFor ? String(sys.idealFor) : '';
                    const advantages = Array.isArray(sys.advantages) ? (sys.advantages as string[]) : [];
                    const disadvantages = Array.isArray(sys.disadvantages) ? (sys.disadvantages as string[]) : [];
                    return (
                      <div
                        key={key}
                        className="p-4 rounded-xl border-2"
                        style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}
                      >
                        <div className="flex items-start gap-2 mb-1.5">
                          <span
                            className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white"
                            style={{ backgroundColor: accent }}
                          >
                            <BrochureIcon name={FEATURE_ICONS[key] ?? 'Cpu'} className="w-4 h-4" />
                          </span>
                          <h3 className="font-bold text-gray-900 text-[0.95rem] leading-tight">{name}</h3>
                        </div>
                        <p className="text-gray-600 text-[0.8rem] leading-relaxed mb-1.5 pl-10">{description}</p>
                        {idealFor && (
                          <p className="text-[0.75rem] pl-10 mb-2 font-medium" style={{ color: accent }}>
                            <span className="text-gray-600 font-normal">{idealForLabel}: </span>
                            {idealFor}
                          </p>
                        )}
                        <div className={`flex flex-col gap-2 pl-10 ${isRtl ? 'items-end' : ''}`}>
                          {advantages.length > 0 && (
                            <div className="min-w-0 w-full">
                              <span className={`text-[0.65rem] font-semibold text-gray-500 block mb-0.5 ${!isRtl ? 'uppercase' : ''}`}>{advantagesLabel}</span>
                              <ul className="space-y-0.5 list-none p-0 m-0">
                                {advantages.slice(0, 4).map((a, j) => (
                                  <li key={j} className="flex items-start gap-1.5 text-[0.7rem] text-gray-600">
                                    <Check className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: accent }} />
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {disadvantages.length > 0 && (
                            <div className="min-w-0 w-full">
                              <span className={`text-[0.65rem] font-semibold text-gray-500 block mb-0.5 ${!isRtl ? 'uppercase' : ''}`}>{disadvantagesLabel}</span>
                              <ul className="space-y-0.5 list-none p-0 m-0">
                                {disadvantages.slice(0, 3).map((d, j) => (
                                  <li key={j} className="flex items-start gap-1.5 text-[0.7rem] text-gray-600">
                                    <span className="inline-block w-1 h-1 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: accent }} />
                                    {d}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })()}

        {/* One full page per service: hero image + description + detailed features (no blank space) */}
        {BROCHURE_SERVICES_ORDER.map(({ slug, brochureKey, icon }) => {
          const svcConfig = BROCHURE_SERVICE_CONFIG[slug];
          const svcTitle = svcConfig ? tAbout(svcConfig.aboutTitleKey) : t(brochureKey);
          const svcAccent = svcConfig?.accent ?? accent;
          const svcAccentLight = svcConfig?.accentLight ?? accentLight;
          const svcPageBg = svcConfig?.pageBg ?? '#f8fafc';
          const svcBoxBg = svcConfig?.boxBg ?? '#ffffff';
          const imgUrl = SERVICE_IMAGES[slug];
          const pageDescs = t.raw('servicePageDesc') as Record<string, string> | undefined;
          const pageHighlights = t.raw('servicePageHighlights') as Record<string, string[]> | undefined;
          const pageDesc = (pageDescs?.[slug] ?? (svcConfig ? tAbout(svcConfig.aboutDescKey) : '')) as string;
          const highlights = (pageHighlights?.[slug] ?? []) as string[];
          const indexObj = svcConfig ? (tIndex.raw(svcConfig.indexKey) as Record<string, unknown>) : null;
          const featureItems: { key: string; name: string; description: string; highlights?: string[] }[] = [];
          if (svcConfig && indexObj && typeof indexObj === 'object') {
            for (const key of svcConfig.featureKeys) {
              const item = (indexObj as Record<string, Record<string, unknown>>)[key];
              if (item && typeof item === 'object' && item.name) {
                featureItems.push({
                  key,
                  name: String(item.name),
                  description: typeof item.description === 'string' ? item.description : '',
                  highlights: Array.isArray(item.highlights) ? (item.highlights as string[]) : undefined,
                });
              }
            }
          }
          return (
            <section
              key={slug}
              className="relative overflow-hidden flex flex-col"
              style={{
                width: '100%',
                height: `${A4_HEIGHT_CM}cm`,
                minHeight: `${A4_HEIGHT_CM}cm`,
                backgroundColor: svcPageBg,
                color: '#1e293b',
              }}
            >
              {/* Hero image - larger, responsive - logo stacked on top */}
              <div className="relative h-32 sm:h-40 md:h-44 shrink-0 overflow-hidden">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt=""
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: `${svcAccent}20` }}
                  >
                    <BrochureIcon name={icon} className="w-14 h-14 opacity-50" style={{ color: svcAccent }} />
                  </div>
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(to bottom, transparent 30%, ${svcAccent}ee 100%)` }}
                />
                {/* Logo badge - stacked on hero */}
                <div
                  className={`absolute top-3 sm:top-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg backdrop-blur-sm border ${
                    isRtl ? 'right-3 sm:right-4' : 'left-3 sm:left-4'
                  }`}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderColor: `${svcAccent}40`,
                    boxShadow: `0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px ${svcAccent}30`,
                  }}
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: `${svcAccent}15` }}>
                    <img src="/logo/usmart.PNG" alt="U Smart" className="h-6 sm:h-7 w-auto object-contain" onError={(e) => { const el = e.target as HTMLImageElement; if (el) { el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.classList.remove('hidden'); } }} />
                    <div className="hidden w-6 h-6 rounded bg-white/20 flex items-center justify-center"><span className="text-sm font-bold text-white">U</span></div>
                  </div>
                  <div>
                    <span className="block text-[0.6rem] sm:text-[0.65rem] font-bold text-gray-500" style={{ letterSpacing: isRtl ? 0 : '0.08em' }}>U SMART</span>
                    <span className="block text-[0.55rem] sm:text-[0.6rem] font-medium text-gray-400">{t('servicesShowcaseTitle')}</span>
                  </div>
                </div>
                <div className="absolute inset-0 flex items-end p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0"
                      style={{ backgroundColor: svcAccent }}
                    >
                      <BrochureIcon name={icon} className="w-5 h-5" />
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-white drop-shadow-lg">
                      {svcTitle}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Content - fills all space */}
              <div className="flex-1 p-3 sm:p-4 flex flex-col gap-2 min-h-0 overflow-hidden">
                <div
                  className="rounded-xl border-2 p-3 shrink-0"
                  style={{
                    borderColor: `${svcAccent}50`,
                    backgroundColor: svcBoxBg,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <p className="text-[0.78rem] sm:text-[0.85rem] text-gray-700 leading-[1.6]">
                    {pageDesc}
                  </p>
                </div>

                {featureItems.length > 0 ? (
                  <div
                    className="flex-1 min-h-0 overflow-auto rounded-xl border-2 p-3"
                    style={{
                      borderColor: `${svcAccent}40`,
                      backgroundColor: svcBoxBg,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <p className={`text-[0.6rem] sm:text-[0.65rem] font-semibold text-gray-600 mb-2 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>
                      {t('pageServicesTitle')} — {t('featuresLabel')}
                    </p>
                    <div className="space-y-3">
                      {featureItems.map((f, i) => {
                        const featureImg = FEATURE_IMAGES[f.key];
                        const FeatureIcon = FEATURE_ICONS[f.key] ? ICON_MAP[FEATURE_ICONS[f.key]] : null;
                        return (
                          <div
                            key={i}
                            className={`flex gap-3 rounded-lg border overflow-hidden ${isRtl ? 'flex-row-reverse' : ''}`}
                            style={{ borderColor: `${svcAccent}40`, backgroundColor: 'rgba(255,255,255,0.6)' }}
                          >
                            <div className="w-20 sm:w-24 h-16 sm:h-20 shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center relative">
                              {featureImg && (
                                <img
                                  src={featureImg}
                                  alt=""
                                  crossOrigin="anonymous"
                                  className="w-full h-full object-cover absolute inset-0"
                                  onError={(e) => {
                                    const el = e.target as HTMLImageElement;
                                    if (el) { el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.classList.remove('hidden'); }
                                  }}
                                />
                              )}
                              <div
                                className={`w-full h-full flex items-center justify-center ${featureImg ? 'hidden' : ''}`}
                                style={{ backgroundColor: `${svcAccent}20` }}
                              >
                                {FeatureIcon ? <FeatureIcon className="w-8 h-8 opacity-70" style={{ color: svcAccent }} /> : <BrochureIcon name="Layers" className="w-8 h-8 opacity-70" style={{ color: svcAccent }} />}
                              </div>
                            </div>
                            <div className={`flex-1 min-w-0 py-1.5 sm:py-2 ${isRtl ? 'pl-2 pr-0' : 'pr-2 pl-0'}`}>
                              <h4 className="text-[0.75rem] sm:text-[0.8rem] font-bold text-gray-900">{f.name}</h4>
                              <p className="text-[0.7rem] sm:text-[0.72rem] text-gray-600 leading-[1.45] mt-0.5">{f.description}</p>
                              {f.highlights && f.highlights.length > 0 && (
                                <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
                                  {f.highlights.slice(0, 3).map((h, j) => (
                                    <li key={j} className="flex items-center gap-1.5 text-[0.65rem] sm:text-[0.68rem] text-gray-500">
                                      <Check className="w-2.5 h-2.5 flex-shrink-0" style={{ color: svcAccent }} />
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : highlights.length > 0 && (
                  <div
                    className="flex-1 min-h-0 overflow-auto rounded-xl border-2 p-3"
                    style={{
                      borderColor: `${svcAccent}40`,
                      backgroundColor: svcBoxBg,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <p className={`text-[0.6rem] sm:text-[0.65rem] font-semibold text-gray-600 mb-2 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>
                      {t('pageServicesTitle')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {highlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: `${svcAccent}25` }}
                          >
                            <Check className="w-2.5 h-2.5" style={{ color: svcAccent }} />
                          </span>
                          <span className="text-[0.7rem] sm:text-[0.75rem] text-gray-700 leading-tight">{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer - never empty */}
                <div
                  className={`shrink-0 mt-2 flex flex-wrap items-center justify-between gap-2 sm:gap-4 p-3 rounded-xl border-2 ${isRtl ? 'flex-row-reverse' : ''}`}
                  style={{
                    borderColor: `${svcAccent}35`,
                    backgroundColor: `${svcAccent}08`,
                  }}
                >
                  <div className="flex items-center gap-3 sm:gap-4 text-[0.7rem] sm:text-[0.75rem] text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <BrochureIcon name="Globe" className="w-3.5 h-3.5 shrink-0" style={{ color: svcAccent }} />
                      {t('websiteUrl')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BrochureIcon name="Mail" className="w-3.5 h-3.5 shrink-0" style={{ color: svcAccent }} />
                      {t('email')}
                    </span>
                  </div>
                  <Link
                    href={`/services/${slug}`}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                    style={{ color: svcAccentLight, backgroundColor: `${svcAccent}20` }}
                  >
                    <span>{tAbout('learnMore')}</span>
                    <ArrowLeft className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
                  </Link>
                </div>
              </div>
            </section>
          );
        })}

        {/* Page 4 – Why Choose: Solid background, strengths in boxes */}
        <section
          className="relative py-12 px-8 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: pageBg,
            color: '#1e293b',
          }}
        >
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
              <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                <BrochureIcon name="Target" className="w-7 h-7" style={{ color: accent }} />
              </span>
              <div>
                <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
                  {t('pageWhyTitle')}
                </span>
                <h2 className="brochure-h2 mt-1 text-gray-900" style={{ color: accent }}>
                  {t('pageWhyTitle')}
                </h2>
              </div>
            </div>
            <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
              <p className="text-[1rem] text-gray-700 leading-[1.6] font-medium">{t('valueProposition')}</p>
            </div>
            <div className="space-y-3">
              {(t.raw('strengths') as string[]).map((s, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border-2 flex items-start gap-3"
                  style={{ borderColor: `${accent}40`, backgroundColor: boxBg }}
                >
                  <span className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5" style={{ backgroundColor: `${accent}20` }}>
                    <BrochureIcon name={WHY_CHOOSE_ICONS[i] ?? 'Check'} className="w-5 h-5" style={{ color: accent }} />
                  </span>
                  <span className="text-gray-700 leading-[1.55] text-[0.9rem] pt-0.5">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Page 5 – Contact: Solid background, contact in boxes */}
        <section
          className="relative py-12 px-8 overflow-hidden flex flex-col justify-center"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: pageBg,
            color: '#1e293b',
          }}
        >
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
              <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                <BrochureIcon name="Mail" className="w-7 h-7" style={{ color: accent }} />
              </span>
              <div>
                <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
                  {t('pageContactTitle')}
                </span>
                <h2 className="brochure-h2 mt-1 text-gray-900" style={{ color: accent }}>
                  {t('pageContactTitle')}
                </h2>
              </div>
            </div>
            <div className="p-5 rounded-xl border-2" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
              <p className="text-[0.95rem] text-gray-700 leading-[1.65]">{t('cta')}</p>
            </div>
            <div className={`flex flex-wrap items-stretch gap-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className="p-5 rounded-xl border-2 flex-1 min-w-[200px]" style={{ borderColor: `${accent}50`, backgroundColor: boxBg }}>
                <p className="font-bold text-gray-900 text-[1rem] mb-3 flex items-center gap-2">
                  <BrochureIcon name="Mail" className="w-5 h-5" style={{ color: accent }} />
                  {t('contactUs')}
                </p>
                <p className="text-gray-600 text-[0.9rem] flex items-center gap-2">
                  <BrochureIcon name="Globe" className="w-4 h-4 shrink-0" style={{ color: accent }} />
                  {t('visit')}: {t('websiteUrl')}
                </p>
                <p className="text-gray-600 text-[0.9rem] mt-2 flex items-center gap-2">
                  <BrochureIcon name="Mail" className="w-4 h-4 shrink-0" style={{ color: accent }} />
                  {t('email')}
                </p>
              </div>
              <div className="p-5 rounded-xl border-2 flex flex-col items-center justify-center" style={{ borderColor: accent, backgroundColor: boxBg }}>
                <QRCodeSVG value={WEBSITE_URL} size={130} level="M" />
                <span className="text-[0.75rem] text-gray-500 text-center mt-2 max-w-[140px] font-medium">{t('qrScan')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* End cover – logo, tagline, thank you */}
        <section
          className="relative flex flex-col items-center justify-center overflow-hidden"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: coverBg,
            color: '#fff',
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: `radial-gradient(circle at 50% 50%, ${accent} 0%, transparent 70%)` }}
          />
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-8">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center border-2 mb-6" style={{ borderColor: `${accent}80`, backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <img src="/logo/usmart.PNG" alt="U Smart" className="h-16 sm:h-20 w-auto object-contain" onError={(e) => { const el = e.target as HTMLImageElement; if (el) { el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.classList.remove('hidden'); } }} />
              <div className="hidden w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center"><span className="text-3xl font-bold text-white">U</span></div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">U SMART</h2>
            <p className="text-sm text-white/90 mb-6 max-w-sm">{t('endCoverTagline')}</p>
            <p className="text-sm text-white/80 mb-4">{t('endCoverThanks')}</p>
            <p className="text-xs text-white/70">{new Date().getFullYear()} · {t('visit')}: {t('websiteUrl')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
