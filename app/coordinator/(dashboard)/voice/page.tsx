'use client';

import { useEffect, useState } from 'react';
import { Mic, Phone, Loader2 } from 'lucide-react';

type VoiceLog = { id: string; transcript: string | null; detectedLanguage: string | null; intent: string | null; actionTaken: string | null; createdAt: string };
type CallRecord = { id: string; direction: string; duration: number | null; transcript: string | null; taskLinked: string | null; status: string; createdAt: string };

export default function CoordinatorVoicePage() {
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'logs' | 'calls'>('calls');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/coordinator/voice-logs?limit=30', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coordinator/voice-call-records?limit=30', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([logRes, callRes]) => {
        if (logRes.success && logRes.logs) setLogs(logRes.logs);
        if (callRes.success && callRes.records) setCalls(callRes.records);
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
