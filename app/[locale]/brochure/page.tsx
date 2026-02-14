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
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
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
        {/* Page 1 – Cover: Solid background, text in boxes */}
        <section
          className="relative flex flex-col items-center justify-center px-8 py-14 overflow-hidden"
          style={{
            width: '100%',
            height: `${A4_HEIGHT_CM}cm`,
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: coverBg,
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `linear-gradient(${accentLight}44 1px, transparent 1px), linear-gradient(90deg, ${accentLight}44 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative z-10 w-full max-w-xl space-y-4">
            <div
              className="w-28 h-28 mx-auto rounded-2xl flex items-center justify-center mb-6 border-2"
              style={{ borderColor: `${accent}60`, backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              <img
                src="/logo/usmart.PNG"
                alt="U Smart"
                className="h-20 w-auto object-contain rounded-xl"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  if (el) {
                    el.style.display = 'none';
                    (el.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                  }
                }}
              />
              <div className="hidden w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-white/90">U</span>
              </div>
            </div>
            <div className="p-6 rounded-xl border-2 text-center" style={{ borderColor: accent, backgroundColor: `${accent}15` }}>
              <div className="flex justify-center mb-3">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accentLight}30` }}>
                  <BrochureIcon name="Sparkles" className="w-6 h-6" style={{ color: accentLight }} />
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mb-2" style={{ letterSpacing: isRtl ? 0 : '-0.03em' }}>
                {t('title')}
              </h1>
              {featuredTitle && (
                <p className="text-base font-semibold mb-2" style={{ color: accentLight }}>
                  {featuredTitle}
                </p>
              )}
              <p className="text-sm font-medium text-white/90 flex items-center justify-center gap-2">
                <BrochureIcon name="Sparkles" className="w-4 h-4" style={{ color: accentLight }} />
                {t('tagline')}
              </p>
            </div>
            <div className="p-5 rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <p className="text-sm text-white/85 leading-relaxed">{t('headline')}</p>
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

        {/* Page 3 – Services: Solid background, service boxes */}
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
          <div className="relative z-10 space-y-4">
            <div className="p-4 rounded-xl border-2 flex items-center gap-4" style={{ borderColor: accent, backgroundColor: boxBg }}>
              <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                <BrochureIcon name="Layers" className="w-7 h-7" style={{ color: accent }} />
              </span>
              <div>
                <span className={`text-xs font-semibold text-gray-500 ${!isRtl ? 'uppercase tracking-wider' : ''}`} style={{ letterSpacing: isRtl ? 0 : '0.12em' }}>
                  {t('pageServicesTitle')}
                </span>
                <h2 className="brochure-h2 mt-1 text-gray-900" style={{ color: accent }}>
                  {t('pageServicesTitle')}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
              {BROCHURE_SERVICES_ORDER.map(({ slug, brochureKey, icon }, i) => {
                const isFeatured = serviceSlug === slug;
                return (
                  <div
                    key={slug}
                    className="p-5 rounded-xl border-2"
                    style={{
                      borderColor: isFeatured ? accent : `${accent}40`,
                      backgroundColor: boxBg,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white"
                        style={{ backgroundColor: isFeatured ? accent : accentDark }}
                      >
                        <BrochureIcon name={icon} className="w-6 h-6" />
                      </span>
                      <div className="min-w-0">
                        <span className={`text-[0.95rem] font-medium block ${isFeatured ? 'text-gray-900' : 'text-gray-600'}`}>
                          {isFeatured ? (featuredTitle || t(brochureKey)) : t(brochureKey)}
                        </span>
                        {isFeatured && (
                          <span
                            className={`inline-block mt-1 px-2.5 py-0.5 rounded-lg text-[0.7rem] font-bold text-white ${!isRtl ? 'uppercase tracking-wider' : ''}`}
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
      </div>
    </div>
  );
}
