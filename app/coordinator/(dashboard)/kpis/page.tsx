'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Plus, RefreshCw, Trash2 } from 'lucide-react';

type KPI = {
  id: string;
  name: string;
  targetValue: number;
  actualValue: number;
  unit: string | null;
  status: string;
  reportedAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  ON_TRACK: 'على المسار',
  AT_RISK: 'في خطر',
  FAILED: 'فشل',
};

export default function CoordinatorKPIsPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [actualValue, setActualValue] = useState('');
  const [unit, setUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/kpis', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.kpis) setKpis(data.kpis);
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
      const res = await fetch('/api/coordinator/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          targetValue: parseFloat(targetValue) || 0,
          actualValue: parseFloat(actualValue) || 0,
          unit: unit.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKpis((prev) => [data.kpi, ...prev]);
        setName('');
        setTargetValue('');
        setActualValue('');
        setUnit('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateActual = async (id: string, value: number) => {
    const res = await fetch(`/api/coordinator/kpis/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ actualValue: value }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.kpi) {
        setKpis((prev) => prev.map((k) => (k.id === id ? data.kpi : k)));
      }
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا المؤشر؟')) return;
    const res = await fetch(`/api/coordinator/kpis/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setKpis((prev) => prev.filter((k) => k.id !== id));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-7 h-7" />
          مؤشرات الأداء
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
            مؤشر جديد
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-6">
        الهدف مقابل الفعلي. الحالة تُحسب تلقائياً: على المسار / في خطر / فشل.
      </p>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم المؤشر"
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="الهدف"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              step="any"
              value={actualValue}
              onChange={(e) => setActualValue(e.target.value)}
              placeholder="الفعلي"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="الوحدة (مثلاً % أو عدد)"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
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

      {loading && kpis.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
      ) : kpis.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد مؤشرات. أضف مؤشر أداء للبدء.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <div
              key={k.id}
              className={`p-4 rounded-xl border shadow-sm ${
                k.status === 'ON_TRACK'
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : k.status === 'AT_RISK'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-red-50/50 border-red-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-slate-800">{k.name}</h3>
                <button
                  type="button"
                  onClick={() => remove(k.id)}
                  className="p-1 rounded text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {k.actualValue} {k.unit || ''} / {k.targetValue} {k.unit || ''}
              </p>
              <p className="text-sm font-medium mt-1">
                {STATUS_LABELS[k.status] ?? k.status}
              </p>
              <input
                type="number"
                step="any"
                defaultValue={k.actualValue}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v !== k.actualValue) updateActual(k.id, v);
                }}
                className="mt-2 w-full px-2 py-1 text-sm rounded border border-slate-300"
                placeholder="تحديث الفعلي"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
