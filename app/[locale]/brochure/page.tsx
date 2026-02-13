'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowLeft, FileDown } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const WEBSITE_URL = 'https://www.usmart-iot.com';

export default function BrochurePage() {
  const t = useTranslations('Brochure');
  const locale = useLocale();
  const brochureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const isRtl = locale === 'ar' || locale === 'ku';

  useEffect(() => {
    if (!isRtl) return;
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [isRtl]);

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
      pdf.save(`U-Smart-Profile-${locale}.pdf`);
    } catch (e) {
      console.error('Brochure PDF failed:', e);
    } finally {
      setExporting(false);
    }
  };

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
          maxWidth: 210 * 3.78,
          minWidth: 210 * 2.5,
        }}
      >
        {/* Page 1 – Cover */}
        <section
          className="relative min-h-[100vh] flex flex-col items-center justify-center px-8 py-16 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #0a0f2e 0%, #1e3a5f 50%, #0f172a 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(59,130,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="relative z-10 mb-8">
            <img
              src="/logo/usmart.PNG"
              alt="U Smart"
              className="h-20 w-auto object-contain rounded-xl"
              onError={(e) => {
                const t = e.target as HTMLImageElement;
                if (t) { t.style.display = 'none'; t.nextElementSibling?.classList.remove('hidden'); }
              }}
            />
            <div className="hidden w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-blue-300">U</span>
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3" style={{ letterSpacing: isRtl ? 0 : '-0.02em' }}>
            {t('title')}
          </h1>
          <p className="text-blue-200/90 text-lg md:text-xl mb-6">
            {t('tagline')}
          </p>
          <p className="text-white/80 text-sm md:text-base max-w-2xl leading-relaxed">
            {t('headline')}
          </p>
        </section>

        {/* Page 2 – About Us */}
        <section className="min-h-[100vh] flex flex-col justify-center px-8 md:px-16 py-16 bg-white text-gray-800">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1e40af] mb-6 pb-2 border-b-2 border-[#1e40af] inline-block">
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
        </section>

        {/* Page 3 – Services Overview */}
        <section className="min-h-[100vh] flex flex-col justify-center px-8 md:px-16 py-16 bg-gray-50 text-gray-800">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1e40af] mb-10 pb-2 border-b-2 border-[#1e40af] inline-block">
            {t('pageServicesTitle')}
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 list-none p-0 m-0">
            {[
              t('serviceQuality'),
              t('serviceSmartHome'),
              t('serviceTelecom'),
              t('serviceCleanEnergy'),
            ].map((label, i) => (
              <li
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl bg-white border border-gray-200/80 shadow-sm"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-gray-700 font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Page 4 – Why Choose U Smart */}
        <section className="min-h-[100vh] flex flex-col justify-center px-8 md:px-16 py-16 bg-white text-gray-800">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1e40af] mb-6 pb-2 border-b-2 border-[#1e40af] inline-block">
            {t('pageWhyTitle')}
          </h2>
          <p className="text-lg text-gray-700 mb-8 leading-relaxed max-w-3xl">
            {t('valueProposition')}
          </p>
          <ul className="space-y-3 list-none p-0 m-0">
            {(t.raw('strengths') as string[]).map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-gray-700">
                <span className="text-emerald-500 font-bold">✔</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Page 5 – Contact & QR */}
        <section className="min-h-[100vh] flex flex-col justify-center px-8 md:px-16 py-16 bg-gray-50 text-gray-800">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1e40af] mb-8 pb-2 border-b-2 border-[#1e40af] inline-block">
            {t('pageContactTitle')}
          </h2>
          <p className="text-lg text-gray-700 mb-8 max-w-2xl">
            {t('cta')}
          </p>
          <div className={`flex flex-wrap items-start gap-12 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div>
              <p className="font-semibold text-gray-900 mb-2">{t('contactUs')}</p>
              <p className="text-gray-600">{t('visit')}: {t('websiteUrl')}</p>
              <p className="text-gray-600">📧 {t('email')}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={WEBSITE_URL} size={140} level="M" className="rounded-lg border border-gray-200 bg-white p-2" />
              <span className="text-sm text-gray-500">{t('qrScan')}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
