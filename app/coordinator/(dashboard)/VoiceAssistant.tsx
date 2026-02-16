'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, X, Save, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export default function VoiceAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;
    setSupported(!!SpeechRecognitionAPI);
  }, []);

  const startListening = () => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    const rec = new API() as SpeechRecognitionInstance;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ar-SA';
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript((prev) => prev + text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setMessage({ type: 'error', text: 'تعذر بدء التعرف على الصوت' });
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const saveToVoiceLog = async () => {
    const text = transcript.trim();
    if (!text) {
      setMessage({ type: 'error', text: 'لا يوجد نص لحفظه' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/coordinator/voice-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transcript: text,
          detectedLanguage: 'ar-SA',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'تم الحفظ في سجل الصوت' });
        setTranscript('');
      } else {
        setMessage({ type: 'error', text: data.message || 'فشل الحفظ' });
      }
    } catch {
      setMessage({ type: 'error', text: 'خطأ في الاتصال' });
    } finally {
      setSaving(false);
    }
  };

  const createTaskFromTranscript = () => {
    const text = transcript.trim();
    if (text) {
      try {
        sessionStorage.setItem('voiceTranscript', text);
      } catch {}
      router.push('/coordinator/tasks?create=1');
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 left-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label="المساعد الصوتي"
      >
        <Mic className="w-6 h-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/30 sm:items-center sm:p-0">
          <div
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col max-h-[80vh]"
            role="dialog"
            aria-label="المساعد الصوتي"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">المساعد الصوتي</h3>
              <button
                type="button"
                onClick={() => { setOpen(false); stopListening(); }}
                className="p-2 rounded-lg hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {supported === false && (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
                  التعرف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome أو Edge.
                </p>
              )}
              {supported && (
                <>
                  <div className="flex gap-2 mb-4">
                    {!listening ? (
                      <button
                        type="button"
                        onClick={startListening}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm"
                      >
                        <Mic className="w-4 h-4" /> بدء الاستماع
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopListening}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm"
                      >
                        إيقاف
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full min-h-[120px] p-3 border border-slate-200 rounded-lg text-slate-800 text-sm resize-y"
                    placeholder="سيظهر النص هنا عند التحدث أو يمكنك تعديله..."
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                  />
                  {message && (
                    <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                      {message.text}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2 p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={saveToVoiceLog}
                disabled={saving || !transcript.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ في سجل الصوت
              </button>
              {transcript.trim() && (
                <button
                  type="button"
                  onClick={createTaskFromTranscript}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 text-sm hover:bg-slate-200"
                >
                  إنشاء مهمة من هذا النص
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
