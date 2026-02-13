'use client';

import type { CVData } from '@/lib/cv-types';

const A4_WIDTH_PX = 595;

export default function CVTemplateMinimal({ data }: { data: CVData }) {
  const skillsList = data.skills
    ? data.skills.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return (
    <div
      className="bg-white text-gray-800 overflow-hidden"
      style={{
        width: A4_WIDTH_PX,
        minHeight: 842,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
      }}
    >
      <div className="px-14 py-10">
        <div className="border-l-2 border-gray-300 pl-6">
          <h1 className="text-2xl font-light tracking-tight text-gray-900" style={{ margin: 0 }}>
            {data.fullName || 'Your Name'}
          </h1>
          {data.jobTitle && (
            <p className="text-gray-500 text-sm font-light mt-0.5" style={{ margin: 0 }}>
              {data.jobTitle}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-0 mt-4 text-[10px] text-gray-500">
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.location && <span>{data.location}</span>}
          {data.website && <span>{data.website.replace(/^https?:\/\//, '')}</span>}
        </div>

        {data.summary && (
          <section className="mt-8">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
              style={{ margin: '0 0 8px 0' }}
            >
              Summary
            </h2>
            <p className="leading-relaxed text-gray-600 max-w-full" style={{ margin: 0 }}>
              {data.summary}
            </p>
          </section>
        )}

        {data.experience.length > 0 && (
          <section className="mt-8">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
              style={{ margin: '0 0 10px 0' }}
            >
              Experience
            </h2>
            <div className="space-y-5">
              {data.experience.map((exp) => (
                <div key={exp.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900" style={{ margin: 0, fontSize: 12 }}>
                      {exp.jobTitle}
                    </h3>
                    <span className="text-gray-400 text-[10px] shrink-0">
                      {exp.dateFrom}
                      {exp.dateTo ? ` – ${exp.current ? 'Present' : exp.dateTo}` : ''}
                    </span>
                  </div>
                  <p className="text-gray-500 text-[10px] mt-0.5" style={{ margin: 0 }}>
                    {exp.company}
                  </p>
                  {exp.description && (
                    <p className="text-gray-600 leading-relaxed mt-2 text-[10px]" style={{ margin: 0 }}>
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.education.length > 0 && (
          <section className="mt-8">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
              style={{ margin: '0 0 10px 0' }}
            >
              Education
            </h2>
            <div className="space-y-3">
              {data.education.map((edu) => (
                <div key={edu.id}>
                  <h3 className="font-medium text-gray-900 text-[10px]" style={{ margin: 0 }}>
                    {edu.degree}
                  </h3>
                  <p className="text-gray-500 text-[10px]" style={{ margin: 0 }}>
                    {edu.school}
                    {edu.dateFrom || edu.dateTo ? ` · ${edu.dateFrom || ''} ${edu.dateTo ? `– ${edu.dateTo}` : ''}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {skillsList.length > 0 && (
          <section className="mt-8">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
              style={{ margin: '0 0 8px 0' }}
            >
              Skills
            </h2>
            <p className="text-gray-600 leading-relaxed" style={{ margin: 0 }}>
              {skillsList.join('  ·  ')}
            </p>
          </section>
        )}

        {(data.languages || data.certifications) && (
          <div className="mt-8 flex flex-wrap gap-8">
            {data.languages && (
              <section>
                <h2
                  className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                  style={{ margin: '0 0 6px 0' }}
                >
                  Languages
                </h2>
                <p className="text-gray-600 text-[10px]" style={{ margin: 0 }}>
                  {data.languages}
                </p>
              </section>
            )}
            {data.certifications && (
              <section>
                <h2
                  className="text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                  style={{ margin: '0 0 6px 0' }}
                >
                  Certifications
                </h2>
                <p className="text-gray-600 text-[10px] whitespace-pre-line" style={{ margin: 0 }}>
                  {data.certifications}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
