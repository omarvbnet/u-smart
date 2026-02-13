'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  FileDown,
  Plus,
  Trash2,
  ArrowLeft,
  LayoutTemplate,
  User,
  Briefcase,
  GraduationCap,
  Award,
  Languages,
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import type { CVData, CVExperience, CVEducation, CVTemplateId } from '@/lib/cv-types';
import { defaultCVData } from '@/lib/cv-types';
import CVTemplateRenderer from '@/components/cv-templates';

const TEMPLATE_IDS: CVTemplateId[] = ['modern', 'classic', 'minimal'];

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

export default function CVBuilderPage() {
  const t = useTranslations('CV');
  const locale = useLocale();
  const [data, setData] = useState<CVData>(defaultCVData);
  const [templateId, setTemplateId] = useState<CVTemplateId>('modern');
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Load Arabic font for RTL locales so PDF export renders correctly
  useEffect(() => {
    if (locale !== 'ar' && locale !== 'ku') return;
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [locale]);

  const update = useCallback((updates: Partial<CVData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const addExperience = useCallback(() => {
    setData((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        {
          id: generateId(),
          jobTitle: '',
          company: '',
          dateFrom: '',
          dateTo: '',
          current: false,
          description: '',
        },
      ],
    }));
  }, []);

  const updateExperience = useCallback((id: string, updates: Partial<CVExperience>) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  }, []);

  const removeExperience = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.filter((e) => e.id !== id),
    }));
  }, []);

  const addEducation = useCallback(() => {
    setData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          id: generateId(),
          degree: '',
          school: '',
          dateFrom: '',
          dateTo: '',
        },
      ],
    }));
  }, []);

  const updateEducation = useCallback((id: string, updates: Partial<CVEducation>) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  }, []);

  const removeEducation = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id),
    }));
  }, []);

  const handleExportPdf = async () => {
    const el = previewRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
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
      const totalPdfH = (imgH * scale);
      const pageCount = Math.ceil(totalPdfH / pdfH) || 1;
      const pageHeightPx = (pdfH / scale);
      for (let i = 0; i < pageCount; i++) {
        if (i > 0) pdf.addPage();
        const sy = i * pageHeightPx;
        const sh = Math.min(pageHeightPx, imgH - sy);
        const dw = imgW;
        const dh = sh;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = dw;
        sliceCanvas.height = dh;
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, dw, dh);
          ctx.drawImage(canvas, 0, sy, dw, sh, 0, 0, dw, dh);
        }
        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceScale = pdfW / dw;
        const sliceH = dh * sliceScale;
        pdf.addImage(sliceData, 'PNG', 0, 0, pdfW, sliceH);
      }
      const name = (data.fullName || 'CV').replace(/\s+/g, '-');
      pdf.save(`${name}-${templateId}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('title')}</h1>
          <p className="text-gray-400 max-w-2xl">{t('subtitle')}</p>
        </header>

        {/* Template selector */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {t('template')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TEMPLATE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTemplateId(id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  templateId === id
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-white/10 bg-white/5 hover:border-white/20 text-gray-300'
                }`}
              >
                <span className="font-semibold block">{t(`templates.${id}`)}</span>
                <span className="text-xs opacity-80 mt-1 block">{t(`templates.${id}Desc`)}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12">
          {/* Form */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <User className="w-4 h-4 text-blue-400" />
                {t('personal')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{t('fullName')}</label>
                  <input
                    type="text"
                    value={data.fullName}
                    onChange={(e) => update({ fullName: e.target.value })}
                    placeholder={t('fullNamePlaceholder')}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{t('jobTitle')}</label>
                  <input
                    type="text"
                    value={data.jobTitle}
                    onChange={(e) => update({ jobTitle: e.target.value })}
                    placeholder={t('jobTitlePlaceholder')}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{t('email')}</label>
                  <input
                    type="email"
                    value={data.email}
                    onChange={(e) => update({ email: e.target.value })}
                    placeholder={t('emailPlaceholder')}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{t('phone')}</label>
                  <input
                    type="tel"
                    value={data.phone}
                    onChange={(e) => update({ phone: e.target.value })}
                    placeholder={t('phonePlaceholder')}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">{t('location')}</label>
                <input
                  type="text"
                  value={data.location}
                  onChange={(e) => update({ location: e.target.value })}
                  placeholder={t('locationPlaceholder')}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">{t('website')}</label>
                <input
                  type="url"
                  value={data.website}
                  onChange={(e) => update({ website: e.target.value })}
                  placeholder={t('websitePlaceholder')}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-white mb-4">
                <Briefcase className="w-4 h-4 text-blue-400" />
                {t('summary')}
              </h3>
              <textarea
                value={data.summary}
                onChange={(e) => update({ summary: e.target.value })}
                placeholder={t('summaryPlaceholder')}
                rows={4}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none resize-y"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 font-semibold text-white">
                  <Briefcase className="w-4 h-4 text-amber-400" />
                  {t('experience')}
                </h3>
                <button
                  type="button"
                  onClick={addExperience}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('addExperience')}
                </button>
              </div>
              <div className="space-y-4">
                {data.experience.map((exp) => (
                  <div key={exp.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                        <input
                          type="text"
                          value={exp.jobTitle}
                          onChange={(e) => updateExperience(exp.id, { jobTitle: e.target.value })}
                          placeholder={t('jobTitleLabel')}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 outline-none"
                        />
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => updateExperience(exp.id, { company: e.target.value })}
                          placeholder={t('companyPlaceholder')}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExperience(exp.id)}
                        className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                        aria-label={t('remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={exp.dateFrom}
                        onChange={(e) => updateExperience(exp.id, { dateFrom: e.target.value })}
                        placeholder={t('dateFrom')}
                        className="w-24 px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs placeholder-gray-500 focus:border-amber-500 outline-none"
                      />
                      <input
                        type="text"
                        value={exp.dateTo}
                        onChange={(e) => updateExperience(exp.id, { dateTo: e.target.value })}
                        placeholder={data.experience.find((e) => e.id === exp.id)?.current ? t('current') : t('dateTo')}
                        className="w-24 px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs placeholder-gray-500 focus:border-amber-500 outline-none"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-gray-400">
                        <input
                          type="checkbox"
                          checked={exp.current}
                          onChange={(e) => updateExperience(exp.id, { current: e.target.checked })}
                          className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/50"
                        />
                        {t('current')}
                      </label>
                    </div>
                    <textarea
                      value={exp.description}
                      onChange={(e) => updateExperience(exp.id, { description: e.target.value })}
                      placeholder={t('descriptionPlaceholder')}
                      rows={2}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 outline-none resize-y"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 font-semibold text-white">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  {t('education')}
                </h3>
                <button
                  type="button"
                  onClick={addEducation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('addEducation')}
                </button>
              </div>
              <div className="space-y-4">
                {data.education.map((edu) => (
                  <div key={edu.id} className="flex gap-2 p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={edu.degree}
                        onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                        placeholder={t('degreePlaceholder')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:border-emerald-500 outline-none"
                      />
                      <input
                        type="text"
                        value={edu.school}
                        onChange={(e) => updateEducation(edu.id, { school: e.target.value })}
                        placeholder={t('schoolPlaceholder')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:border-emerald-500 outline-none"
                      />
                      <input
                        type="text"
                        value={edu.dateFrom}
                        onChange={(e) => updateEducation(edu.id, { dateFrom: e.target.value })}
                        placeholder={t('dateFrom')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:border-emerald-500 outline-none"
                      />
                      <input
                        type="text"
                        value={edu.dateTo}
                        onChange={(e) => updateEducation(edu.id, { dateTo: e.target.value })}
                        placeholder={t('dateTo')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEducation(edu.id)}
                      className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors shrink-0 h-fit"
                      aria-label={t('remove')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <Award className="w-4 h-4 text-cyan-400" />
                {t('skills')}
              </h3>
              <input
                type="text"
                value={data.skills}
                onChange={(e) => update({ skills: e.target.value })}
                placeholder={t('skillsPlaceholder')}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 outline-none"
              />
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
                  <Languages className="w-3.5 h-3.5" />
                  {t('languages')}
                </label>
                <input
                  type="text"
                  value={data.languages}
                  onChange={(e) => update({ languages: e.target.value })}
                  placeholder={t('languagesPlaceholder')}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">{t('certifications')}</label>
                <textarea
                  value={data.certifications}
                  onChange={(e) => update({ certifications: e.target.value })}
                  placeholder={t('certificationsPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none resize-y"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-2xl border border-white/10 bg-gray-900/50 p-4 overflow-auto max-h-[calc(100vh-8rem)]">
              <div
                ref={previewRef}
                className="inline-block shadow-2xl origin-top"
                style={{ minWidth: 595 }}
              >
                <CVTemplateRenderer templateId={templateId} data={data} locale={locale} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors"
              >
                <FileDown className="w-5 h-5" />
                {exporting ? t('exporting') : t('exportPdf')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
