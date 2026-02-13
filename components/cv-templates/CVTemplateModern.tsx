'use client';

import type { CVData } from '@/lib/cv-types';
import { isRtlLocale, ARABIC_FONT } from '@/lib/cv-types';

const A4_WIDTH_PX = 595; // 210mm at 72dpi

export default function CVTemplateModern({ data, locale }: { data: CVData; locale: string }) {
  const rtl = isRtlLocale(locale);
  const skillsList = data.skills
    ? data.skills.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return (
    <div
      className="bg-white text-gray-900 overflow-hidden"
      dir={rtl ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        width: A4_WIDTH_PX,
        minHeight: 842,
        fontFamily: rtl ? ARABIC_FONT : 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
        textAlign: rtl ? 'right' : 'left',
      }}
    >
      {/* Header block - blue accent */}
      <div
        className="text-white px-10 py-6"
        style={{ backgroundColor: '#1e40af' }}
      >
        <h1 className="text-2xl font-bold" style={{ margin: 0, letterSpacing: 0 }}>
          {data.fullName || 'Your Name'}
        </h1>
        {data.jobTitle && (
          <p className="text-blue-100 text-sm mt-1" style={{ margin: 0 }}>
            {data.jobTitle}
          </p>
        )}
        <div className={`flex flex-wrap gap-x-4 gap-y-0 mt-3 text-sm text-blue-100 ${rtl ? 'flex-row-reverse' : ''}`} style={{ justifyContent: rtl ? 'flex-end' : undefined }}>
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.location && <span>{data.location}</span>}
          {data.website && (
            <a
              href={data.website}
              className="underline"
              style={{ color: 'inherit' }}
            >
              {data.website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </div>

      <div className="px-10 py-6">
        {data.summary && (
          <section className="mb-5">
            <h2
              className="text-xs font-bold uppercase mb-2"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Summary
            </h2>
            <p className="leading-relaxed text-gray-700" style={{ margin: 0 }}>
              {data.summary}
            </p>
          </section>
        )}

        {data.experience.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-xs font-bold uppercase mb-3"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Experience
            </h2>
            <div className="space-y-4">
              {data.experience.map((exp) => (
                <div key={exp.id}>
                  <div className={`flex justify-between items-baseline flex-wrap gap-1 ${rtl ? 'flex-row-reverse' : ''}`}>
                    <h3 className="font-bold text-gray-900" style={{ margin: 0 }}>
                      {exp.jobTitle}
                    </h3>
                    <span className="text-gray-500 text-[10px]">
                      {exp.dateFrom}
                      {exp.dateTo ? ` – ${exp.current ? 'Present' : exp.dateTo}` : ''}
                    </span>
                  </div>
                  <p className="text-gray-600 text-[10px] mb-1" style={{ margin: 0 }}>
                    {exp.company}
                  </p>
                  {exp.description && (
                    <p className="text-gray-700 leading-relaxed text-[10px]" style={{ margin: 0 }}>
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.education.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-xs font-bold uppercase mb-3"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Education
            </h2>
            <div className="space-y-3">
              {data.education.map((edu) => (
                <div key={edu.id}>
                  <h3 className="font-bold text-gray-900 text-[10px]" style={{ margin: 0 }}>
                    {edu.degree}
                  </h3>
                  <p className="text-gray-600 text-[10px]" style={{ margin: 0 }}>
                    {edu.school}
                    {edu.dateFrom || edu.dateTo ? ` · ${edu.dateFrom || ''} ${edu.dateTo ? `– ${edu.dateTo}` : ''}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {skillsList.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-xs font-bold uppercase mb-2"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Skills
            </h2>
            <p className="text-gray-700 leading-relaxed" style={{ margin: 0 }}>
              {skillsList.join(' · ')}
            </p>
          </section>
        )}

        {(data.languages || data.certifications) && (
          <section>
            {data.languages && (
              <div className="mb-3">
                <h2
              className="text-xs font-bold uppercase mb-1"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Languages
                </h2>
                <p className="text-gray-700 text-[10px]" style={{ margin: 0 }}>
                  {data.languages}
                </p>
              </div>
            )}
            {data.certifications && (
              <div>
                <h2
              className="text-xs font-bold uppercase mb-1"
              style={{ color: '#1e40af', borderBottom: '2px solid #1e40af', paddingBottom: 4, display: 'inline-block', letterSpacing: 0 }}
            >
              Certifications
                </h2>
                <p className="text-gray-700 text-[10px] whitespace-pre-line" style={{ margin: 0 }}>
                  {data.certifications}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
