'use client';

import { useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FileDown, Check, Building2, Mail, Globe, Layers, Cpu } from 'lucide-react';
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
  const coverBg = config.coverBg ?? '#0f172a';
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
        backgroundColor: coverBg,
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
          ctx.fillStyle = coverBg;
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
        {/* PAGE 1: Professional Cover */}
        <section
          style={{
            width: '100%',
            minHeight: `${A4_HEIGHT_CM}cm`,
            backgroundColor: coverBg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2.5rem 2rem 2rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top accent stripe */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              backgroundColor: accent,
            }}
          />
          {/* Geometric accent - bottom left corner */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '40%',
              height: '30%',
              background: `linear-gradient(135deg, ${accent}22 0%, transparent 70%)`,
              borderRadius: '0 80px 0 0',
            }}
          />
          {/* Grid pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.04,
              backgroundImage: `linear-gradient(${accentLight} 1px, transparent 1px), linear-gradient(90deg, ${accentLight} 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />
          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', width: '100%' }}>
            <div
              style={{
                width: 72,
                height: 72,
                margin: '0 auto 1.25rem',
                borderRadius: 16,
                border: `2px solid ${accent}aa`,
                backgroundColor: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src="/logo/usmart.PNG" alt="U Smart" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
            </div>
            <p
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: isRtl ? 0 : '0.25em',
                color: accentLight,
                marginBottom: '0.5rem',
                textTransform: isRtl ? 'none' : 'uppercase',
              }}
            >
              {tPdf('coverSubtitle')}
            </p>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#fff',
                marginBottom: '1rem',
                lineHeight: 1.25,
                letterSpacing: isRtl ? 0 : '-0.02em',
                maxWidth: 400,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              {serviceTitle}
            </h1>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.9)',
                lineHeight: 1.65,
                maxWidth: 380,
                margin: '0 auto',
              }}
            >
              {coverTaglineResolved}
            </p>
          </div>
          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 3,
                backgroundColor: accent,
                margin: '0 auto',
                borderRadius: 2,
              }}
            />
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: '1rem' }}>
              U Smart Integrated Solutions · {new Date().getFullYear()}
            </p>
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
