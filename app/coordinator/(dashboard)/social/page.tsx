'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, Plus, Send, Trash2, Loader2, Sparkles, ListTodo } from 'lucide-react';

type Account = { id: string; platform: string; accountId: string; messageCount: number; createdAt: string };
type Message = { id: string; accountId: string; platform: string; recipient: string; body: string; sentAt: string | null; taskId: string | null; createdAt: string };
type Task = { id: string; title: string };

export default function CoordinatorSocialPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [platform, setPlatform] = useState('linkedin');
  const [accountId, setAccountId] = useState('');
  const [msgAccountId, setMsgAccountId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [taskId, setTaskId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/coordinator/social-accounts', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coordinator/outreach-messages', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coordinator/tasks', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([aRes, mRes, tRes]) => {
        if (aRes.success && aRes.accounts) setAccounts(aRes.accounts);
        if (mRes.success && mRes.messages) setMessages(mRes.messages);
        if (tRes.success && Array.isArray(tRes.tasks)) setTasks((tRes.tasks as Task[]).slice(0, 100));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/social-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ platform, accountId: accountId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setAccountId('');
        setShowAccountForm(false);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('حذف الحساب؟')) return;
    await fetch(`/api/coordinator/social-accounts/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const composeWithAi = async () => {
    if (!body.trim()) return;
    setComposing(true);
    try {
      const res = await fetch('/api/coordinator/ai/compose-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ draft: body }),
      });
      const data = await res.json();
      if (data.success && data.composed) setBody(data.composed);
      else alert(data.message || 'فشل التحسين');
    } finally {
      setComposing(false);
    }
  };

  const addMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgAccountId || !recipient.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coordinator/outreach-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId: msgAccountId,
          recipient: recipient.trim(),
          body: body.trim(),
          taskId: taskId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRecipient('');
        setBody('');
        setTaskId('');
        setShowMessageForm(false);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">التواصل الاجتماعي</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">الحسابات المرتبطة</h2>
          <button
            type="button"
            onClick={() => setShowAccountForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> إضافة حساب
          </button>
        </div>
        {showAccountForm && (
          <form onSubmit={addAccount} className="mb-4 p-4 bg-slate-50 rounded-lg flex flex-wrap gap-3 items-end">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="border rounded px-3 py-2">
              <option value="linkedin">LinkedIn</option>
              <option value="meta">Meta</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <input
              type="text"
              placeholder="معرف الحساب"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="border rounded px-3 py-2 min-w-[200px]"
            />
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              حفظ
            </button>
          </form>
        )}
        {accounts.length === 0 ? (
          <p className="text-slate-500">لا حسابات. أضف حساباً للبدء.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {accounts.map((a) => (
              <li key={a.id} className="py-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-slate-500" />
                  {a.platform} — {a.accountId} ({a.messageCount} رسالة)
                </span>
                <button type="button" onClick={() => deleteAccount(a.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">رسائل التواصل</h2>
          <button
            type="button"
            onClick={() => setShowMessageForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            <Send className="w-4 h-4" /> رسالة جديدة
          </button>
        </div>
        {showMessageForm && (
          <form onSubmit={addMessage} className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <select
              value={msgAccountId}
              onChange={(e) => setMsgAccountId(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            >
              <option value="">اختر الحساب</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.platform} — {a.accountId}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="المستلم"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="">ربط بمهمة (اختياري)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <div className="flex flex-col gap-1">
              <textarea
                placeholder="نص الرسالة"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="border rounded px-3 py-2 w-full min-h-[80px]"
              />
              <button
                type="button"
                onClick={composeWithAi}
                disabled={composing || !body.trim()}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-violet-300 text-violet-700 text-sm hover:bg-violet-50 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {composing ? 'جاري التحسين...' : 'تحسين النص بالذكاء الاصطناعي'}
              </button>
            </div>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              إنشاء رسالة
            </button>
          </form>
        )}
        {messages.length === 0 ? (
          <p className="text-slate-500">لا رسائل.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {messages.map((m) => (
              <li key={m.id} className="py-3">
                <p className="text-sm text-slate-600">{m.platform} → {m.recipient}</p>
                <p className="text-slate-800 mt-1">{m.body.slice(0, 120)}{m.body.length > 120 ? '…' : ''}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="text-xs text-slate-400">{m.sentAt ? `أُرسلت: ${new Date(m.sentAt).toLocaleString('ar-SA')}` : `إنشاء: ${new Date(m.createdAt).toLocaleString('ar-SA')}`}</p>
                  {m.taskId && (
                    <Link
                      href={`/coordinator/tasks/${m.taskId}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ListTodo className="w-3 h-3" /> مرتبطة بمهمة
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
