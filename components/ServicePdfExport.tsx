'use client';

import { useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FileDown, Check, Building2, Mail, Globe, Layers, Cpu } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { BROCHURE_SERVICE_CONFIG } from '@/lib/brochure-service-config';

const A4_WIDTH_CM = 21;
const A4_HEIGHT_CM = 29.7;
const PRINT_DPI = 300;
const A4_HEIGHT_PX = Math.round((A4_HEIGHT_CM / 2.54) * PRINT_DPI);
const CANVAS_SCALE = PRINT_DPI / 96;
const WEBSITE_URL = 'https://www.usmart-iot.com';

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Building2,
  Mail,
  Globe,
  Layers,
  Cpu,
  Check,
};

function PdfIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Layers;
  return <Icon className={className} />;
}

type ServicePdfExportProps = {
  serviceTitle: string;
  serviceDescription: string;
  slug: string;
  onExport?: () => void;
};

export default function ServicePdfExport({
  serviceTitle,
  serviceDescription,
  slug,
  onExport,
}: ServicePdfExportProps) {
  const t = useTranslations('Brochure');
  const tIndex = useTranslations('Index');
  const tPdf = useTranslations('ServicePdf');
  const locale = useLocale();
  const pdfRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const isRtl = locale === 'ar' || locale === 'ku';

  const config = BROCHURE_SERVICE_CONFIG[slug] ?? {
    accent: '#1e40af',
    accentLight: '#3b82f6',
    coverBg: '#0f172a',
    pageBg: '#f8fafc',
    boxBg: '#ffffff',
    indexKey: '',
    featureKeys: [],
    aboutTitleKey: '',
    aboutDescKey: '',
    accentBg: '',
    accentDark: '#1e3a8a',
  };

  const accent = config.accent ?? '#1e40af';
  const accentLight = config.accentLight ?? '#3b82f6';
  const accentDark = config.accentDark ?? '#1e3a8a';
  const pageBg = config.pageBg ?? '#f8fafc';
  const boxBg = config.boxBg ?? '#ffffff';

  // Resolve feature items from Index
  const featureItems: { name: string; description: string; highlights?: string[] }[] = [];
  if (config.indexKey && config.featureKeys) {
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

  // Systems (Smart Home)
  const systemsObj = config.systemsPageKey && config.systemsKeys
    ? (tIndex.raw(config.systemsPageKey) as Record<string, unknown>)
    : null;
  const systemsKeys = config.systemsKeys ?? [];

  const coverTaglines = tPdf.raw('coverTagline') as Record<string, string> | undefined;
  const coverTaglineResolved = (coverTaglines && typeof coverTaglines === 'object' && coverTaglines[slug])
    ? coverTaglines[slug]
    : serviceDescription.slice(0, 140) + (serviceDescription.length > 140 ? '…' : '');

  const handleExport = async () => {
    const el = pdfRef.current;
    if (!el) return;
    setExporting(true);
    onExport?.();
    try {
      if (isRtl && document.fonts?.ready) {
        await document.fonts.ready;
        await new Promise((r) => setTimeout(r, 200));
      }
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      await new Promise((r) => requestAnimationFrame(r));
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: CANVAS_SCALE,
        useCORS: true,
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const imgW = canvas.width;
      const imgH = canvas.height;
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
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, imgW, sh);
          ctx.drawImage(canvas, 0, sy, imgW, sh, 0, 0, imgW, sh);
        }
        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceH = sh * scaleToPdf;
        pdf.addImage(sliceData, 'PNG', 0, 0, pdfW, sliceH);
      }
      pdf.save(`U-Smart-${slug}-${locale}.pdf`);
    } catch (e) {
      console.error('Service PDF export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium transition-colors disabled:opacity-60"
      >
        <FileDown className="w-4 h-4" />
        {exporting ? '…' : tPdf('exportAsPdf')}
      </button>

      {/* Hidden PDF content - positioned off-screen */}
      <div
        ref={pdfRef}
        dir={isRtl ? 'rtl' : 'ltr'}
        lang={locale}
        className="absolute left-[-9999px] top-0 w-[21cm]"
        style={{
          fontFamily: isRtl ? "'Amiri', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif" : "ui-sans-serif, system-ui, sans-serif",
          letterSpacing: isRtl ? 0 : undefined,
        }}
      >
        {/* PAGE 1: Abstract Modern Cover - per service colors */}
        <section
          style={{
            width: '100%',
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            padding: '2rem 1.75rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Flowing abstract wave shapes - colored per service */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            preserveAspectRatio="none"
            viewBox="0 0 210 297"
          >
            <defs>
              <linearGradient id={`wave1-${slug}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accentLight} stopOpacity="0.55" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.25" />
              </linearGradient>
              <linearGradient id={`wave2-${slug}`} x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
                <stop offset="100%" stopColor={accentDark} stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id={`wave3-${slug}`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={accentDark} stopOpacity="0.5" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id={`wave4-${slug}`} x1="100%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {/* Top left flowing wave - organic curve */}
            <path d="M0,0 C30,60 20,120 50,180 C80,240 40,297 0,297 V0 Z" fill={`url(#wave1-${slug})`} />
            <path d="M0,40 C25,100 30,160 45,220 C60,260 35,297 0,297 V0 Z" fill={`url(#wave4-${slug})`} />
            {/* Top right / middle wave */}
            <path d="M210,0 C180,80 190,150 170,220 C150,270 200,297 210,297 V0 Z" fill={`url(#wave2-${slug})`} />
            {/* Bottom shapes - flowing curves */}
            <path d="M0,220 Q60,250 120,270 Q180,285 210,297 H0 Z" fill={`url(#wave3-${slug})`} />
            <path d="M90,250 Q140,265 210,297 H120 Z" fill={`url(#wave4-${slug})`} />
          </svg>

          {/* Top left identifier box */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              display: 'inline-flex',
              flexDirection: 'column',
              padding: '0.4rem 0.7rem',
              backgroundColor: accentLight,
              borderRadius: 4,
              width: 'fit-content',
            }}
          >
            <span style={{ fontSize: '0.5rem', fontWeight: 600, color: '#fff', letterSpacing: '0.1em' }}>U SMART</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff' }}>{tPdf('coverSubtitle')}</span>
          </div>

          {/* Central content with open-corner frame */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
              justifyContent: 'center',
              marginTop: '-1rem',
            }}
          >
            {/* Open-corner frame */}
            <div
              style={{
                position: 'relative',
                padding: '1.5rem 2rem',
                borderLeft: `2px solid ${accentLight}`,
                borderRight: `2px solid ${accentLight}`,
                borderTop: `2px solid ${accentLight}`,
                borderBottom: 'none',
                maxWidth: 320,
              }}
            >
              {/* Decorative dots - right side */}
              <div
                style={{
                  position: 'absolute',
                  right: -24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 3, height: 3, backgroundColor: accentLight, borderRadius: 1 }} />
                    <div style={{ width: 3, height: 3, backgroundColor: accentLight, borderRadius: 1 }} />
                  </div>
                ))}
              </div>
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: accentDark,
                  margin: 0,
                  lineHeight: 1.3,
                  letterSpacing: isRtl ? 0 : '-0.02em',
                  textAlign: 'center',
                }}
              >
                {serviceTitle}
              </h1>
              {/* Dotted line */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 4,
                  margin: '0.6rem 0',
                }}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ width: 3, height: 2, backgroundColor: accentLight, borderRadius: 1 }} />
                ))}
              </div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: accentLight,
                  margin: 0,
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                {tPdf('featuresTitle')}
              </p>
              <div
                style={{
                  width: 40,
                  height: 1,
                  backgroundColor: accentLight,
                  margin: '0.4rem auto 0',
                  opacity: 0.7,
                }}
              />
              <p
                style={{
                  fontSize: '0.65rem',
                  color: accentLight,
                  lineHeight: 1.6,
                  margin: '0.5rem 0 0',
                  opacity: 0.9,
                }}
              >
                {coverTaglineResolved}
              </p>
            </div>
          </div>

          {/* Bottom row: year + features left, contact + QR right */}
          <div
            style={{
              position: 'relative',
              zIndex: 5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginTop: 'auto',
            }}
          >
            {/* Bottom left - year and features */}
            <div>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: accentDark, margin: '0 0 0.4rem' }}>
                {new Date().getFullYear()}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {featureItems.slice(0, 2).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, backgroundColor: accentLight, borderRadius: 1 }} />
                    <span style={{ fontSize: '0.55rem', color: accentLight, opacity: 0.9 }}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom right - contact on dark shape + QR code */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0.6rem 1rem',
                backgroundColor: accentDark,
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.55rem', color: '#fff', fontWeight: 500 }}>www.usmart-iot.com</span>
                <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.9)' }}>info@usmart-iot.com</span>
              </div>
              <QRCodeSVG value={WEBSITE_URL} size={44} level="M" bgColor="#fff" fgColor={accentDark} />
            </div>
          </div>
        </section>

        {/* PAGE 2: Service Overview + Features */}
        <section
          style={{
            width: '100%',
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: pageBg,
            color: '#1e293b',
            padding: '2rem',
          }}
        >
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div
              style={{
                padding: '1rem',
                borderRadius: 12,
                border: `2px solid ${accent}`,
                backgroundColor: boxBg,
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: `${accent}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: accent,
                }}
              >
                <PdfIcon name="Layers" className="w-6 h-6" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: accent, margin: 0 }}>
                  {tPdf('featuresTitle')}
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                  {serviceTitle}
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#475569', marginBottom: '1.5rem' }}>
              {serviceDescription}
            </p>
            {featureItems.length > 0 && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {featureItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '1rem',
                      borderRadius: 12,
                      border: `1px solid ${accent}40`,
                      backgroundColor: boxBg,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: accent,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Check style={{ width: 18, height: 18 }} />
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        {item.name}
                      </h3>
                    </div>
                    <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#475569', margin: '0 0 0 2.75rem' }}>
                      {item.description}
                    </p>
                    {item.highlights && item.highlights.length > 0 && (
                      <ul style={{ margin: '0.5rem 0 0 2.75rem', padding: 0, listStyle: 'none', fontSize: '0.8rem', color: '#64748b' }}>
                        {item.highlights.map((h, j) => (
                          <li key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <Check style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PAGE 3: Systems (Smart Home only) */}
        {systemsObj && systemsKeys.length > 0 && (
          <section
            style={{
              width: '100%',
              minHeight: `${A4_HEIGHT_CM}cm`,
              backgroundColor: pageBg,
              color: '#1e293b',
              padding: '2rem',
            }}
          >
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: accent, marginBottom: '1rem' }}>
                {(systemsObj.title as string) || tPdf('systemsTitle')}
              </h2>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {(systemsObj.intro as string) || ''}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {systemsKeys.map((key) => {
                  const sys = (systemsObj as Record<string, Record<string, unknown>>)[key];
                  if (!sys || typeof sys !== 'object') return null;
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '1rem',
                        borderRadius: 12,
                        border: `1px solid ${accent}50`,
                        backgroundColor: boxBg,
                      }}
                    >
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem' }}>
                        {String(sys.name ?? key)}
                      </h3>
                      <p style={{ fontSize: '0.8rem', lineHeight: 1.5, color: '#64748b', margin: 0 }}>
                        {String(sys.description ?? '')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* PAGE: Contact */}
        <section
          style={{
            width: '100%',
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: pageBg,
            color: '#1e293b',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: accent, marginBottom: '1rem' }}>
              {t('pageContactTitle')}
            </h2>
            <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {t('cta')}
            </p>
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 12,
                border: `2px solid ${accent}50`,
                backgroundColor: boxBg,
              }}
            >
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.5rem' }}>
                {t('websiteUrl')}
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                {t('email')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
