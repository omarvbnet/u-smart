'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Plus, Loader2 } from 'lucide-react';

type JobResult = { id: string; keyword: string; source: string | null; extractedSkills: string[]; createdAt: string };

export default function CoordinatorJobResultsPage() {
  const [results, setResults] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/job-results', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.results) setResults(d.results); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/job-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          keyword: keyword.trim(),
          source: source.trim() || undefined,
          extractedSkills: skillsText.trim() ? skillsText.split(/[,،]/).map((s) => s.trim()).filter(Boolean) : [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyword('');
        setSource('');
        setSkillsText('');
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
      <h1 className="text-2xl font-bold text-slate-800">نتائج الوظائف</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">نتائج البحث</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> إضافة نتيجة
          </button>
        </div>
        {showForm && (
          <form onSubmit={addResult} className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <input
              type="text"
              placeholder="الكلمة المفتاحية"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            />
            <input
              type="text"
              placeholder="المصدر (اختياري)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
            <input
              type="text"
              placeholder="المهارات (مفصولة بفاصلة)"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              حفظ
            </button>
          </form>
        )}
        {results.length === 0 ? (
          <p className="text-slate-500">لا توجد نتائج. أضف نتيجة بحث عن وظائف.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {results.map((r) => (
              <li key={r.id} className="py-3">
                <p className="font-medium text-slate-800">{r.keyword}</p>
                {r.source && <p className="text-sm text-slate-600">المصدر: {r.source}</p>}
                {r.extractedSkills.length > 0 && (
                  <p className="text-sm text-slate-500 mt-1">المهارات: {r.extractedSkills.join(', ')}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">{new Date(r.createdAt).toLocaleString('ar-SA')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
