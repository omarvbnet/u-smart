'use client';

import { useEffect, useState } from 'react';
import { Plug, Plus, RefreshCw, Trash2, Play } from 'lucide-react';

type System = {
  id: string;
  name: string;
  type: string;
  companyId: string;
  createdAt: string;
  configEnc: string | null;
  actionLogCount: number;
};

const TYPE_LABELS: Record<string, string> = {
  API: 'API',
  PLAYWRIGHT: 'Playwright',
  OAUTH2: 'OAuth2',
};

export default function CoordinatorIntegrationsPage() {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('API');
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/external-systems', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.systems) setSystems(data.systems);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/external-systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), type }),
      });
      const data = await res.json();
      if (data.success) {
        setSystems((prev) => [data.system, ...prev]);
        setName('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/coordinator/external-systems/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'run' }),
      });
      const data = await res.json();
      if (data.success) alert('تم تنفيذ الإجراء');
      else alert(data.message || data.error || 'فشل التنفيذ');
    } finally {
      setRunningId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا التكامل؟')) return;
    const res = await fetch(`/api/coordinator/external-systems/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setSystems((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Plug className="w-7 h-7" />
          التكاملات
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
            نظام جديد
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-6">
        أنظمة خارجية (API / Playwright / OAuth2). تسجيل الإجراءات وإعادة المحاولة عند الفشل.
      </p>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم النظام"
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

      {loading && systems.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
      ) : systems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد أنظمة. أضف نظاماً خارجياً للربط (API / Playwright / OAuth2).
        </div>
      ) : (
        <div className="space-y-3">
          {systems.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <h3 className="font-medium text-slate-800">{s.name}</h3>
                <p className="text-sm text-slate-500">
                  {TYPE_LABELS[s.type] ?? s.type} · {s.actionLogCount} سجل إجراء
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runAction(s.id)}
                  disabled={runningId === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {runningId === s.id ? 'جاري...' : 'تشغيل'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
