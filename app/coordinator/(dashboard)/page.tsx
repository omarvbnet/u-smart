'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListTodo, TrendingUp, ChevronLeft, CalendarClock, Plug, Phone, FileText, Activity, Sparkles } from 'lucide-react';

type TaskItem = { id: string; title: string; status: string };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلقة',
  APPROVED: 'معتمدة',
  IN_PROGRESS: 'قيد التنفيذ',
  UNDER_REVIEW: 'قيد المراجعة',
  COMPLETED: 'مكتملة',
  ARCHIVED: 'أرشفة',
};

export default function CoordinatorDashboardPage() {
  const [stats, setStats] = useState<{ tasks: number; pending: number; inProgress: number } | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState<{ summary: string; recommendations?: string; answer: string } | null>(null);

  useEffect(() => {
    fetch('/api/coordinator/tasks', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tasks)) {
          const tasks = data.tasks as TaskItem[];
          const pending = tasks.filter((t) => t.status === 'PENDING').length;
          const inProgress = tasks.filter(
            (t) => t.status === 'IN_PROGRESS' || t.status === 'UNDER_REVIEW'
          ).length;
          setStats({ tasks: tasks.length, pending, inProgress });
          setRecentTasks(tasks.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  const askAgent = () => {
    setAiLoading(true);
    setAiResult(null);
    fetch('/api/coordinator/ai/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: aiQuery.trim() || undefined }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAiResult({
            summary: data.summary ?? '',
            recommendations: data.recommendations,
            answer: data.answer ?? data.summary ?? '',
          });
        } else {
          setAiResult({ summary: '', answer: data.message || 'فشل تحميل المنسق الذكي.' });
        }
      })
      .catch(() => setAiResult({ summary: '', answer: 'خطأ في الاتصال.' }))
      .finally(() => setAiLoading(false));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">لوحة التحكم</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-100">
              <ListTodo className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">إجمالي المهام</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.tasks ?? '—'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-amber-100">
              <TrendingUp className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">مهام قيد الانتظار</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.pending ?? '—'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-emerald-100">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">قيد التنفيذ / المراجعة</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.inProgress ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-violet-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          المنسق الذكي — يقرأ كل البيانات ويعطيك ملخصاً وتوصيات
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          يطلع على المهام، المؤشرات، التقارير، السجل والصوت ويعطيك ملخصاً وتوصيات. اسأل سؤالاً (اختياري) أو اضغط لتحصل على الملخص.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="مثال: ما أولوياتي اليوم؟ أو اترك فارغاً للملخص"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <button
            type="button"
            onClick={askAgent}
            disabled={aiLoading}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {aiLoading ? 'جاري التحليل...' : 'اسأل المنسق الذكي'}
          </button>
        </div>
        {aiResult && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm space-y-2">
            {aiResult.summary && (
              <div>
                <p className="font-medium text-slate-700 mb-1">الملخص</p>
                <p className="text-slate-600 whitespace-pre-wrap">{aiResult.summary}</p>
              </div>
            )}
            {aiResult.recommendations && (
              <div>
                <p className="font-medium text-slate-700 mb-1">التوصيات</p>
                <p className="text-slate-600 whitespace-pre-wrap">{aiResult.recommendations}</p>
              </div>
            )}
            {aiResult.answer && !aiResult.summary && <p className="text-slate-600 whitespace-pre-wrap">{aiResult.answer}</p>}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-4">روابط سريعة</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/coordinator/job-duties"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            واجبات الوظيفة
          </Link>
          <Link
            href="/coordinator/integrations"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Plug className="w-4 h-4" />
            التكاملات
          </Link>
          <Link
            href="/coordinator/voice"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Phone className="w-4 h-4" />
            المكالمات والصوت
          </Link>
          <Link
            href="/coordinator/reports"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <FileText className="w-4 h-4" />
            التقارير
          </Link>
        </div>
      </div>

      {recentTasks.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">آخر المهام</h2>
            <Link
              href="/coordinator/tasks"
              className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              عرض الكل
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
          <ul className="space-y-2">
            {recentTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/coordinator/tasks/${t.id}`}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-colors"
                >
                  <span className="font-medium text-slate-800 truncate">{t.title}</span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs ${
                      t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-2">البدء السريع</h2>
        <p className="text-slate-600 text-sm mb-4">
          أنشئ مهامًا جديدة، تتبع الحالة، وأكمل القوائم الفرعية. دورة حياة المهمة: معلقة → معتمدة → قيد التنفيذ → قيد المراجعة → مكتملة → أرشفة.
        </p>
        <Link
          href="/coordinator/tasks"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <ListTodo className="w-4 h-4" />
          عرض المهام
        </Link>
      </div>
    </div>
  );
}
