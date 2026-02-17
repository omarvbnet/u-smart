'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Plus, RefreshCw, Trash2, Play, Settings2 } from 'lucide-react';

type Template = {
  id: string;
  name: string;
  cron: string;
  frequency: string;
  taskTemplate: { title?: string; description?: string };
  createdAt: string;
};

const FREQ_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  yearly: 'سنوي',
};

export default function CoordinatorJobDutiesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [taskTitle, setTaskTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCron, setEditCron] = useState('');
  const [editFrequency, setEditFrequency] = useState('daily');
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/job-duties', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.templates) setTemplates(data.templates);
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
      const res = await fetch('/api/coordinator/job-duties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          frequency,
          taskTemplate: { title: taskTitle.trim() || name.trim(), description: '' },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates((prev) => [data.template, ...prev]);
        setName('');
        setTaskTitle('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا القالب؟')) return;
    const res = await fetch(`/api/coordinator/job-duties/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const runNow = async () => {
    setRunningNow(true);
    try {
      const res = await fetch('/api/coordinator/cron/run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        alert(`تم إنشاء ${data.generated} مهمة من القوالب.`);
      } else {
        alert(data.message || 'فشل التشغيل');
      }
    } finally {
      setRunningNow(false);
    }
  };

  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditCron(t.cron);
    setEditFrequency(t.frequency);
    setEditTaskTitle((t.taskTemplate as { title?: string })?.title ?? t.name);
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/coordinator/job-duties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName.trim(),
          cron: editCron.trim() || undefined,
          frequency: editFrequency,
          taskTemplate: { title: editTaskTitle.trim() || editName.trim(), description: '' },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates((prev) => prev.map((x) => (x.id === id ? { ...x, ...data.template } : x)));
        setEditingId(null);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarClock className="w-7 h-7" />
          واجبات الوظيفة
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runNow}
            disabled={runningNow || templates.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {runningNow ? 'جاري...' : 'تشغيل الآن'}
          </button>
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
            قالب جديد
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-6">
        قوالب المهام المتكررة (يومي / أسبوعي / شهري / سنوي). يتم إنشاء المهام تلقائياً عبر Cron عند تشغيله.
      </p>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم القالب"
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="عنوان المهمة المُنشأة (اختياري)"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(FREQ_LABELS).map(([k, v]) => (
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

      {loading && templates.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد قوالب. أضف قالباً لإنشاء مهام متكررة تلقائياً.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2"
            >
              {editingId === t.id ? (
                <div className="w-full space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="اسم القالب"
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={editTaskTitle}
                    onChange={(e) => setEditTaskTitle(e.target.value)}
                    placeholder="عنوان المهمة المُنشأة"
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={editFrequency}
                    onChange={(e) => setEditFrequency(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(FREQ_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editCron}
                    onChange={(e) => setEditCron(e.target.value)}
                    placeholder="Cron مثل: 0 9 * * *"
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(t.id)}
                      disabled={savingEdit || !editName.trim()}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingEdit ? 'جاري...' : 'حفظ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-medium text-slate-800">{t.name}</h3>
                    <p className="text-sm text-slate-500">
                      {FREQ_LABELS[t.frequency] ?? t.frequency} · Cron: {t.cron}
                    </p>
                    {(t.taskTemplate as { title?: string })?.title && (
                      <p className="text-xs text-slate-400 mt-1">
                        مهمة: {(t.taskTemplate as { title: string }).title}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                      title="تعديل"
                    >
                      <Settings2 className="w-4 h-4" />
                      ضبط
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
