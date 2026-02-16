'use client';

import { useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';

type Report = {
  id: string;
  title: string;
  type: string;
  pdfUrl: string | null;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  custom: 'مخصص',
};

export default function CoordinatorReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('custom');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/reports', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.reports) setReports(data.reports);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          type,
          periodFrom: new Date().toISOString(),
          periodTo: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReports((prev) => [data.report, ...prev]);
        setTitle('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleDateString('ar-IQ', { dateStyle: 'short' });
    } catch {
      return s;
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-7 h-7" />
          التقارير
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            تقرير جديد
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-6">
        سجلات التقارير. ربط التقرير التلقائي الشهري والتصدير PDF في مرحلة لاحقة.
      </p>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان التقرير"
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'جاري الحفظ...' : 'إنشاء'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {loading && reports.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد تقارير. أنشئ تقريراً للبدء.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <h3 className="font-medium text-slate-800">{r.title}</h3>
                <p className="text-sm text-slate-500">
                  {TYPE_LABELS[r.type] ?? r.type} · من {formatDate(r.periodFrom)} إلى {formatDate(r.periodTo)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.pdfUrl ? (
                  <a
                    href={r.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                    تحميل PDF
                  </a>
                ) : (
                  <span className="text-slate-400 text-sm">بدون PDF بعد</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
