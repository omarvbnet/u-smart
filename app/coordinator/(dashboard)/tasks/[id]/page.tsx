'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string };
  subTasks: { id: string; title: string; done: boolean }[];
  checklist: unknown;
  fileUrls: string[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلقة',
  APPROVED: 'معتمدة',
  IN_PROGRESS: 'قيد التنفيذ',
  UNDER_REVIEW: 'قيد المراجعة',
  COMPLETED: 'مكتملة',
  ARCHIVED: 'أرشفة',
};

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED'];

export default function CoordinatorTaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/coordinator/tasks/${id}`, { credentials: 'include' })
      .then(async (res) => ({ status: res.status, data: await res.json() }))
      .then(({ status, data }) => {
        if (data.success && data.task) setTask(data.task);
        else if (!data.success && status === 404) router.replace('/coordinator/tasks');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const updateStatus = (status: string) => {
    if (!task) return;
    setUpdating(true);
    fetch(`/api/coordinator/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.task) setTask(data.task);
      })
      .finally(() => setUpdating(false));
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('ar-IQ', { dateStyle: 'medium' });
    } catch {
      return s;
    }
  };

  if (loading && !task) {
    return (
      <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
    );
  }

  if (!task) return null;

  return (
    <div>
      <Link
        href="/coordinator/tasks"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
      >
        <ArrowRight className="w-4 h-4" />
        العودة إلى المهام
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{task.title}</h1>
        <div className="flex items-center gap-2">
          <select
            value={task.status}
            onChange={(e) => updateStatus(e.target.value)}
            disabled={updating}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium disabled:opacity-50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            أنشأها {task.createdBy.name || task.createdBy.email} · {formatDate(task.createdAt)}
          </p>
          {task.dueAt && (
            <p className="text-sm text-slate-500 mt-1">الموعد: {formatDate(task.dueAt)}</p>
          )}
        </div>
        {task.description && (
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-700 mb-2">الوصف</h3>
            <p className="text-slate-600 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}
        {task.subTasks.length > 0 && (
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-700 mb-2">المهام الفرعية</h3>
            <ul className="space-y-2">
              {task.subTasks.map((st) => (
                <li
                  key={st.id}
                  className={`flex items-center gap-2 text-sm ${st.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                >
                  <span className="w-4 h-4 rounded border border-slate-300 flex items-center justify-center">
                    {st.done && '✓'}
                  </span>
                  {st.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        {task.fileUrls.length > 0 && (
          <div className="p-6">
            <h3 className="text-sm font-medium text-slate-700 mb-2">المرفقات</h3>
            <ul className="space-y-1">
              {task.fileUrls.map((url, i) => (
                <li key={i}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                    {url.split('/').pop() || `ملف ${i + 1}`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
