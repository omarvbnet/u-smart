'use client';

import type { CVData } from '@/lib/cv-types';

const A4_WIDTH_PX = 595;

export default function CVTemplateClassic({ data }: { data: CVData }) {
  const skillsList = data.skills
    ? data.skills.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return (
    <div
      className="bg-[#fefefe] text-gray-800 overflow-hidden"
      style={{
        width: A4_WIDTH_PX,
        minHeight: 842,
        fontFamily: 'Georgia, serif',
        fontSize: 11,
      }}
    >
      <div className="px-12 py-8">
        <h1
          className="text-3xl font-bold text-gray-900 text-center tracking-tight"
          style={{ margin: 0, fontFamily: 'Georgia, serif', borderBottom: '1px solid #333', paddingBottom: 12 }}
        >
          {data.fullName || 'Your Name'}
        </h1>
        {data.jobTitle && (
          <p className="text-center text-gray-600 mt-2 text-sm italic" style={{ margin: 0 }}>
            {data.jobTitle}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-x-4 mt-3 text-sm text-gray-600">
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.location && <span>{data.location}</span>}
          {data.website && <span>{data.website.replace(/^https?:\/\//, '')}</span>}
        </div>

        {data.summary && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 6px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Professional Summary
            </h2>
            <p className="leading-relaxed text-gray-700" style={{ margin: 0 }}>
              {data.summary}
            </p>
          </section>
        )}

        {data.experience.length > 0 && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 8px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Work Experience
            </h2>
            <div className="space-y-4">
              {data.experience.map((exp) => (
                <div key={exp.id}>
                  <h3 className="font-bold text-gray-900" style={{ margin: 0, fontSize: 12 }}>
                    {exp.jobTitle}
                  </h3>
                  <p className="text-gray-600 italic text-[10px]" style={{ margin: 0 }}>
                    {exp.company} · {exp.dateFrom}
                    {exp.dateTo ? ` – ${exp.current ? 'Present' : exp.dateTo}` : ''}
                  </p>
                  {exp.description && (
                    <p className="text-gray-700 leading-relaxed mt-1 text-[10px]" style={{ margin: 0 }}>
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.education.length > 0 && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 8px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Education
            </h2>
            <div className="space-y-3">
              {data.education.map((edu) => (
                <div key={edu.id}>
                  <h3 className="font-bold text-gray-900" style={{ margin: 0, fontSize: 12 }}>
                    {edu.degree}
                  </h3>
                  <p className="text-gray-600 text-[10px]" style={{ margin: 0 }}>
                    {edu.school}
                    {edu.dateFrom || edu.dateTo ? `, ${edu.dateFrom || ''} ${edu.dateTo ? `– ${edu.dateTo}` : ''}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {skillsList.length > 0 && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 6px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Skills
            </h2>
            <p className="text-gray-700 leading-relaxed" style={{ margin: 0 }}>
              {skillsList.join(', ')}
            </p>
          </section>
        )}

        {data.languages && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 6px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Languages
            </h2>
            <p className="text-gray-700 text-[10px]" style={{ margin: 0 }}>
              {data.languages}
            </p>
          </section>
        )}

        {data.certifications && (
          <section className="mt-6">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-gray-900"
              style={{ margin: '0 0 6px 0', fontFamily: 'system-ui, sans-serif' }}
            >
              Certifications
            </h2>
            <p className="text-gray-700 text-[10px] whitespace-pre-line" style={{ margin: 0 }}>
              {data.certifications}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
