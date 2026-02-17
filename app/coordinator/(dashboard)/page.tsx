'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListTodo, TrendingUp, ChevronLeft } from 'lucide-react';

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
  const [stats, setStats] = useState<{ tasks: number; pending: number } | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    fetch('/api/coordinator/tasks', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tasks)) {
          const tasks = data.tasks as TaskItem[];
          const pending = tasks.filter((t) => t.status === 'PENDING').length;
          setStats({ tasks: tasks.length, pending });
          setRecentTasks(tasks.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">لوحة التحكم</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
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
