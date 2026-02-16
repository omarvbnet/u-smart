'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListTodo, TrendingUp } from 'lucide-react';

export default function CoordinatorDashboardPage() {
  const [stats, setStats] = useState<{ tasks: number; pending: number } | null>(null);

  useEffect(() => {
    fetch('/api/coordinator/tasks', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tasks)) {
          const tasks = data.tasks;
          const pending = tasks.filter((t: { status: string }) => t.status === 'PENDING').length;
          setStats({ tasks: tasks.length, pending });
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
