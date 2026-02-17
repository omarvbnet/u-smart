'use client';

import { useEffect, useState } from 'react';
import { Mic, Phone, Loader2, MessageCircle, Send } from 'lucide-react';

type VoiceLog = { id: string; transcript: string | null; detectedLanguage: string | null; intent: string | null; actionTaken: string | null; createdAt: string };
type CallRecord = { id: string; direction: string; duration: number | null; transcript: string | null; taskLinked: string | null; status: string; createdAt: string };

export default function CoordinatorVoicePage() {
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'logs' | 'calls'>('calls');
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/coordinator/voice-logs?limit=30', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coordinator/voice-call-records?limit=30', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coordinator/whatsapp/contact', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([logRes, callRes, waRes]) => {
        if (logRes.success && logRes.logs) setLogs(logRes.logs);
        if (callRes.success && callRes.records) setCalls(callRes.records);
        if (waRes.success && waRes.number) setWhatsappNumber(waRes.number);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">المكالمات والصوت</h1>

      <p className="text-slate-600 text-sm">
        سجلات الصوت والمكالمات. لربط Twilio: أضف في Twilio Console عنوان الويب لاستقبال المكالمات:
        <code className="block mt-2 p-2 bg-slate-100 rounded text-xs break-all">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/coordinator/voice/webhook/incoming` : 'https://yourdomain.com/api/coordinator/voice/webhook/incoming'}
        </code>
        ثم اضبط TWILIO_COORDINATOR_COMPANY_ID و TWILIO_AUTH_TOKEN في البيئة.
      </p>

      {whatsappNumber && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-wrap items-center gap-3">
          <MessageCircle className="w-6 h-6 text-emerald-600" />
          <div>
            <p className="font-medium text-slate-800">تواصل المنسق عبر واتساب</p>
            <p className="text-sm text-slate-600">رقم واتساب المنسق: {whatsappNumber}</p>
          </div>
          <a
            href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#25D366] text-white font-medium hover:opacity-90"
          >
            <MessageCircle className="w-4 h-4" /> فتح واتساب
          </a>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
          <Send className="w-4 h-4" /> إرسال رسالة واتساب (مسؤول فقط)
        </h2>
        <form
          className="space-y-3 max-w-md"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!sendTo.trim() || !sendBody.trim()) return;
            setSending(true);
            setSendResult(null);
            try {
              const res = await fetch('/api/coordinator/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ to: sendTo.trim(), body: sendBody.trim() }),
              });
              const data = await res.json();
              if (data.success) {
                setSendResult('تم الإرسال.');
                setSendBody('');
              } else {
                setSendResult(data.message || (res.status === 403 ? 'مسموح للمسؤولين فقط.' : 'فشل الإرسال.'));
              }
            } catch {
              setSendResult('خطأ في الاتصال.');
            } finally {
              setSending(false);
            }
          }}
        >
          <input
            type="text"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            placeholder="رقم المستلم (مثال: +9647712345678)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <textarea
            value={sendBody}
            onChange={(e) => setSendBody(e.target.value)}
            placeholder="نص الرسالة"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium disabled:opacity-50"
            >
              {sending ? 'جاري الإرسال...' : 'إرسال'}
            </button>
            {sendResult && <span className="text-sm text-slate-600">{sendResult}</span>}
          </div>
        </form>
      </section>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('calls')}
          className={`px-4 py-2 rounded-t flex items-center gap-2 ${tab === 'calls' ? 'bg-slate-100 font-medium' : 'text-slate-600'}`}
        >
          <Phone className="w-4 h-4" /> سجل المكالمات
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={`px-4 py-2 rounded-t flex items-center gap-2 ${tab === 'logs' ? 'bg-slate-100 font-medium' : 'text-slate-600'}`}
        >
          <Mic className="w-4 h-4" /> سجل الصوت
        </button>
      </div>

      {tab === 'calls' && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {calls.length === 0 ? (
            <p className="p-6 text-slate-500">لا توجد مكالمات مسجلة.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {calls.map((r) => (
                <li key={r.id} className="p-4 flex flex-wrap items-center gap-4">
                  <span className={`font-medium ${r.direction === 'INCOMING' ? 'text-green-700' : 'text-blue-700'}`}>
                    {r.direction === 'INCOMING' ? 'وارد' : 'صادر'}
                  </span>
                  <span className="text-slate-600">{r.status}</span>
                  {r.duration != null && <span className="text-slate-500">{r.duration} ث</span>}
                  {r.transcript && <span className="text-sm text-slate-700 line-clamp-1">{r.transcript}</span>}
                  <span className="text-xs text-slate-400 mr-auto">{new Date(r.createdAt).toLocaleString('ar-SA')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'logs' && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {logs.length === 0 ? (
            <p className="p-6 text-slate-500">لا توجد سجلات صوت (مساعد في التطبيق أو STT).</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {logs.map((l) => (
                <li key={l.id} className="p-4">
                  {l.transcript && <p className="text-slate-800">{l.transcript}</p>}
                  <div className="flex flex-wrap gap-2 mt-1 text-sm text-slate-500">
                    {l.detectedLanguage && <span>لغة: {l.detectedLanguage}</span>}
                    {l.intent && <span>النية: {l.intent}</span>}
                    {l.actionTaken && <span>إجراء: {l.actionTaken}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{new Date(l.createdAt).toLocaleString('ar-SA')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
