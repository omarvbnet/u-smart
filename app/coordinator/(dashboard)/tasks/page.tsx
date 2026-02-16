'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, ListTodo } from 'lucide-react';

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string };
  _count?: { comments: number };
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلقة',
  APPROVED: 'معتمدة',
  IN_PROGRESS: 'قيد التنفيذ',
  UNDER_REVIEW: 'قيد المراجعة',
  COMPLETED: 'مكتملة',
  ARCHIVED: 'أرشفة',
};

export default function CoordinatorTasksPage() {
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/tasks', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.tasks) setTasks(data.tasks);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get('create') === '1' && typeof window !== 'undefined') {
      try {
        const voice = sessionStorage.getItem('voiceTranscript');
        if (voice) {
          setNewTitle(voice.slice(0, 200));
          setShowForm(true);
          sessionStorage.removeItem('voiceTranscript');
        }
      } catch {}
    }
  }, [searchParams]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks((prev) => [data.task, ...prev]);
        setNewTitle('');
        setNewDesc('');
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
          <ListTodo className="w-7 h-7" />
          المهام
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
            مهمة جديدة
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createTask} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="عنوان المهمة"
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="الوصف (اختياري)"
            rows={2}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

      {loading && tasks.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري تحميل المهام...</div>
      ) : tasks.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد مهام بعد. أنشئ مهمة جديدة للبدء.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/coordinator/tasks/${task.id}`}
              className="block p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-slate-800">{task.title}</h3>
                  {task.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">{task.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    {task.createdBy.name || task.createdBy.email} · {formatDate(task.createdAt)}
                    {(task._count?.comments ?? 0) > 0 && ` · ${task._count?.comments ?? 0} تعليق`}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    task.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : task.status === 'IN_PROGRESS' || task.status === 'UNDER_REVIEW'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
