'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, RefreshCw, AlertTriangle, Phone, Mail, MessageCircle, Sparkles } from 'lucide-react';

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
  source?: string | null;
  coordinatorFeedback?: string | null;
  inboundReplyTo?: string | null;
  priority?: string | null;
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
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [sendFeedbackResult, setSendFeedbackResult] = useState<'sent' | 'saved' | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<{ statusUpdated?: boolean; replySent?: boolean; replyMessage?: string } | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/coordinator/tasks/${id}`, { credentials: 'include' })
      .then(async (res) => ({ status: res.status, data: await res.json() }))
      .then(({ status, data }) => {
        if (data.success && data.task) {
          setTask(data.task);
          setFeedbackDraft((data.task as Task).coordinatorFeedback ?? '');
        } else if (!data.success && status === 404) router.replace('/coordinator/tasks');
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

  const saveFeedback = (showResult = false) => {
    if (!task) return;
    setSendFeedbackResult(null);
    setUpdating(true);
    fetch(`/api/coordinator/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ coordinatorFeedback: feedbackDraft }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.task) {
          setTask(data.task);
          if (showResult) setSendFeedbackResult(data.sentToSender ? 'sent' : 'saved');
        }
      })
      .finally(() => setUpdating(false));
  };

  const runAiProcess = () => {
    if (!task || !feedbackDraft.trim()) {
      alert('أضف التغذية الراجعة أولاً.');
      return;
    }
    setAiResult(null);
    setAiProcessing(true);
    // Save feedback first so AI and WhatsApp use latest text
    fetch(`/api/coordinator/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ coordinatorFeedback: feedbackDraft }),
    })
      .then((res) => res.json())
      .then((saveData) => {
        if (saveData.success && saveData.task) setTask(saveData.task);
        return fetch(`/api/coordinator/tasks/${id}/ai-process`, { method: 'POST', credentials: 'include' });
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.task) setTask(data.task);
          setAiResult({
            statusUpdated: data.statusUpdated,
            replySent: data.replySent,
            replyMessage: data.replyMessage,
          });
        } else {
          alert(data.message || 'فشلت المعالجة.');
        }
      })
      .catch(() => alert('خطأ في الاتصال.'))
      .finally(() => setAiProcessing(false));
  };

  const escalate = () => {
    if (!task || task.priority === 'urgent') return;
    const reason = window.prompt('سبب التصعيد (اختياري):');
    setEscalating(true);
    fetch(`/api/coordinator/tasks/${id}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason: reason ?? undefined }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTask((t) => (t ? { ...t, priority: 'urgent' } : null));
          alert('تم تصعيد المهمة. تم إخطار المسؤولين.');
        } else alert(data.message || 'فشل التصعيد');
      })
      .finally(() => setEscalating(false));
  };

  const SOURCE_LABELS: Record<string, string> = {
    voice: 'مكالمة',
    email: 'بريد',
    whatsapp: 'واتساب',
    manual: 'يدوي',
  };
  const PRIORITY_LABELS: Record<string, string> = {
    normal: 'عادي',
    high: 'عالي',
    urgent: 'عاجل',
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
          <div className="flex flex-wrap items-center gap-2">
            {task.source && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                {task.source === 'voice' && <Phone className="w-3 h-3" />}
                {task.source === 'email' && <Mail className="w-3 h-3" />}
                {task.source === 'whatsapp' && <MessageCircle className="w-3 h-3" />}
                {SOURCE_LABELS[task.source] ?? task.source}
              </span>
            )}
            {(task.priority === 'high' || task.priority === 'urgent') && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${task.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                <AlertTriangle className="w-3 h-3" />
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-2">
            أنشأها {task.createdBy.name || task.createdBy.email} · {formatDate(task.createdAt)}
          </p>
          {task.source === 'whatsapp' && task.inboundReplyTo && (
            <p className="text-sm text-emerald-700 mt-1">
              رقم المتابعة: #{task.id.slice(-6).toUpperCase()} · إرسال التحديثات إلى: {task.inboundReplyTo.replace(/^whatsapp:/i, '')}
            </p>
          )}
          {task.dueAt && (
            <p className="text-sm text-slate-500 mt-1">الموعد: {formatDate(task.dueAt)}</p>
          )}
          {task.priority !== 'urgent' && (
            <button
              type="button"
              onClick={escalate}
              disabled={escalating}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" />
              {escalating ? 'جاري...' : 'تصعيد عاجل'}
            </button>
          )}
        </div>
        {task.description && (
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-700 mb-2">الوصف</h3>
            <p className="text-slate-600 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-700 mb-2">تغذية راجعة منسق (بعد المتابعة أو الاتصال)</h3>
          {(task.source === 'voice' || task.source === 'email' || task.source === 'whatsapp') && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              {task.source === 'whatsapp'
                ? 'مهمة واردة من واتساب — أضف نتيجة المتابعة أدناه ثم اضغط «حفظ وإرسال للمرسل» لإرسال التغذية الراجعة إلى المرسل على واتساب.'
                : 'مهمة واردة — أضف نتيجة المتابعة أو الاتصال أدناه (يُحفظ تلقائياً).'}
            </p>
          )}
          <textarea
            value={feedbackDraft}
            onChange={(e) => { setFeedbackDraft(e.target.value); setSendFeedbackResult(null); }}
            onBlur={() => saveFeedback(false)}
            placeholder="مثال: تم الاتصال بأحمد، قال إن الوضع تحت السيطرة..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => saveFeedback(true)}
              disabled={updating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <MessageCircle className="w-4 h-4" />
              {updating ? 'جاري...' : task.source === 'whatsapp' && task.inboundReplyTo ? 'حفظ وإرسال للمرسل' : 'حفظ'}
            </button>
            <span className="text-xs text-slate-400">يُحفظ تلقائياً عند الخروج من الحقل.</span>
            {sendFeedbackResult === 'sent' && (
              <span className="text-xs text-emerald-700 font-medium">تم إرسال التغذية الراجعة إلى المرسل على واتساب.</span>
            )}
            {sendFeedbackResult === 'saved' && (
              <span className="text-xs text-slate-600">تم الحفظ.</span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-600 mb-2">منسق ذكي: يحدّث حالة المهمة حسب التغذية الراجعة ويكتب رسالة رد للمرسل (واتساب إن وُجد).</p>
            <button
              type="button"
              onClick={runAiProcess}
              disabled={aiProcessing || !feedbackDraft.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {aiProcessing ? 'جاري المعالجة...' : 'معالجة بالذكاء الاصطناعي'}
            </button>
            {aiResult && (
              <div className="mt-2 text-xs text-slate-700 space-y-1">
                {aiResult.statusUpdated && <p className="text-emerald-700">تم تحديث حالة المهمة.</p>}
                {aiResult.replySent && <p className="text-emerald-700">تم إرسال الرد إلى المرسل على واتساب.</p>}
                {aiResult.replyMessage && <p className="text-slate-600">الرد: {aiResult.replyMessage}</p>}
              </div>
            )}
          </div>
        </div>
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
