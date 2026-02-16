'use client';

import { useEffect, useState } from 'react';
import { FileCheck, Plus, Loader2, ExternalLink } from 'lucide-react';

type Application = { id: string; jobResultId: string | null; cvUrl: string | null; coverLetterUrl: string | null; createdAt: string };

export default function CoordinatorApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cvUrl, setCvUrl] = useState('');
  const [coverLetterUrl, setCoverLetterUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/generated-applications', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.applications) setApplications(d.applications); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/generated-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cvUrl: cvUrl.trim() || null,
          coverLetterUrl: coverLetterUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCvUrl('');
        setCoverLetterUrl('');
        setShowForm(false);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">الطلبات المولدة</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">طلبات السيرة والخطاب</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> إضافة طلب
          </button>
        </div>
        {showForm && (
          <form onSubmit={addApplication} className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <input
              type="url"
              placeholder="رابط السيرة الذاتية"
              value={cvUrl}
              onChange={(e) => setCvUrl(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
            <input
              type="url"
              placeholder="رابط خطاب التغطية"
              value={coverLetterUrl}
              onChange={(e) => setCoverLetterUrl(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              حفظ
            </button>
          </form>
        )}
        {applications.length === 0 ? (
          <p className="text-slate-500">لا طلبات مولدة. أضف سيرة أو خطاب تغطية مولّد.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {applications.map((a) => (
              <li key={a.id} className="py-3 flex flex-wrap items-center gap-4">
                <span className="text-slate-800">{new Date(a.createdAt).toLocaleString('ar-SA')}</span>
                {a.cvUrl && (
                  <a href={a.cvUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 text-sm">
                    <ExternalLink className="w-4 h-4" /> السيرة
                  </a>
                )}
                {a.coverLetterUrl && (
                  <a href={a.coverLetterUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 text-sm">
                    <ExternalLink className="w-4 h-4" /> خطاب التغطية
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
