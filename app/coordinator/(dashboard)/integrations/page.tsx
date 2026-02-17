'use client';

import { useEffect, useState } from 'react';
import { Plug, Plus, RefreshCw, Trash2, Play, Settings2, History } from 'lucide-react';

type System = {
  id: string;
  name: string;
  type: string;
  companyId: string;
  createdAt: string;
  configEnc: string | null;
  actionLogCount: number;
};

type ActionLog = {
  id: string;
  action: string;
  status: string;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  API: 'API',
  PLAYWRIGHT: 'Playwright',
  OAUTH2: 'OAuth2',
};

export default function CoordinatorIntegrationsPage() {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('API');
  const [apiUrl, setApiUrl] = useState('');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiHeaders, setApiHeaders] = useState('');
  const [apiBody, setApiBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editMethod, setEditMethod] = useState('GET');
  const [editHeaders, setEditHeaders] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [logsOpenId, setLogsOpenId] = useState<string | null>(null);
  const [logsList, setLogsList] = useState<ActionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/external-systems', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.systems) setSystems(data.systems);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const parseHeadersJson = (s: string): Record<string, string> | undefined => {
    const t = s.trim();
    if (!t) return undefined;
    try {
      const o = JSON.parse(t) as unknown;
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[k] = v;
        return Object.keys(out).length ? out : undefined;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  };

  const buildApiConfigEnc = (
    url: string,
    method: string,
    headersStr?: string,
    bodyStr?: string
  ) => {
    const u = url.trim();
    if (!u) return null;
    const config: { url: string; method: string; headers?: Record<string, string>; body?: string } = {
      url: u,
      method: method || 'GET',
    };
    const headers = parseHeadersJson(headersStr ?? '');
    if (headers) config.headers = headers;
    const body = bodyStr?.trim();
    if (body) config.body = body;
    return JSON.stringify(config);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const configEnc = type === 'API' ? buildApiConfigEnc(apiUrl, apiMethod, apiHeaders, apiBody) : null;
      const res = await fetch('/api/coordinator/external-systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), type, configEnc }),
      });
      const data = await res.json();
      if (data.success) {
        setSystems((prev) => [data.system, ...prev]);
        setName('');
        setApiUrl('');
        setApiMethod('GET');
        setApiHeaders('');
        setApiBody('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const saveConfig = async (id: string) => {
    const configEnc = buildApiConfigEnc(editUrl, editMethod, editHeaders, editBody);
    if (!configEnc) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/coordinator/external-systems/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ configEnc }),
      });
      if (res.ok) {
        setConfiguringId(null);
        load();
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const openConfig = (_s: System) => {
    setConfiguringId(_s.id);
    setEditUrl('');
    setEditMethod('GET');
    setEditHeaders('');
    setEditBody('');
  };

  const toggleLogs = async (id: string) => {
    if (logsOpenId === id) {
      setLogsOpenId(null);
      return;
    }
    setLogsOpenId(id);
    setLogsList([]);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/coordinator/external-systems/${id}/action-logs`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.logs) setLogsList(data.logs);
      else setLogsList([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const runAction = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/coordinator/external-systems/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'run' }),
      });
      const data = await res.json();
      if (data.success) {
        alert('تم تنفيذ الإجراء');
        load();
        if (logsOpenId === id) {
          const logRes = await fetch(`/api/coordinator/external-systems/${id}/action-logs`, {
            credentials: 'include',
          });
          const logData = await logRes.json();
          if (logData.success && logData.logs) setLogsList(logData.logs);
        }
      } else if (res.status === 501) {
        alert('هذا التكامل غير مُهيأ بعد.');
      } else {
        alert(data.message || data.error || 'فشل التنفيذ');
      }
    } finally {
      setRunningId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا التكامل؟')) return;
    const res = await fetch(`/api/coordinator/external-systems/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setSystems((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Plug className="w-7 h-7" />
          التكاملات
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
            نظام جديد
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-sm mb-6">
        أنظمة خارجية (API / Playwright / OAuth2). تسجيل الإجراءات وإعادة المحاولة عند الفشل.
      </p>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم النظام"
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {type === 'API' && (
            <>
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="رابط API (اختياري، يمكن ضبطه لاحقاً)"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={apiMethod}
                onChange={(e) => setApiMethod(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <textarea
                value={apiHeaders}
                onChange={(e) => setApiHeaders(e.target.value)}
                placeholder='هيدرات (JSON) مثل: {"Authorization":"Bearer ..."}'
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <textarea
                value={apiBody}
                onChange={(e) => setApiBody(e.target.value)}
                placeholder="نص الطلب (اختياري، لـ POST/PUT/PATCH)"
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </>
          )}
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

      {loading && systems.length === 0 ? (
        <div className="py-12 text-center text-slate-500">جاري التحميل...</div>
      ) : systems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 rounded-xl border border-slate-200 bg-white">
          لا توجد أنظمة. أضف نظاماً خارجياً للربط (API / Playwright / OAuth2).
        </div>
      ) : (
        <div className="space-y-3">
          {systems.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2"
            >
              {configuringId === s.id ? (
                <div className="w-full space-y-2">
                  <p className="text-sm font-medium text-slate-700">ضبط API</p>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={editMethod}
                    onChange={(e) => setEditMethod(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <textarea
                    value={editHeaders}
                    onChange={(e) => setEditHeaders(e.target.value)}
                    placeholder='هيدرات (JSON) مثل: {"Authorization":"Bearer ..."}'
                    rows={2}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="نص الطلب (اختياري)"
                    rows={2}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveConfig(s.id)}
                      disabled={savingConfig || !editUrl.trim()}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingConfig ? 'جاري...' : 'حفظ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfiguringId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-medium text-slate-800">{s.name}</h3>
                    <p className="text-sm text-slate-500">
                      {TYPE_LABELS[s.type] ?? s.type} · {s.actionLogCount} سجل إجراء
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLogs(s.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50"
                    >
                      <History className="w-4 h-4" />
                      سجل
                    </button>
                    {s.type === 'API' && (
                      <button
                        type="button"
                        onClick={() => openConfig(s)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                      >
                        <Settings2 className="w-4 h-4" />
                        ضبط
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => runAction(s.id)}
                      disabled={runningId === s.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50"
                    >
                      <Play className="w-4 h-4" />
                      {runningId === s.id ? 'جاري...' : 'تشغيل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
              {logsOpenId === s.id && (
                <div className="w-full mt-3 pt-3 border-t border-slate-200">
                  {loadingLogs ? (
                    <p className="text-sm text-slate-500">جاري التحميل...</p>
                  ) : logsList.length === 0 ? (
                    <p className="text-sm text-slate-500">لا توجد سجلات بعد.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                      {logsList.map((log) => (
                        <li
                          key={log.id}
                          className="text-sm flex flex-wrap items-center gap-2 py-1.5 px-2 rounded bg-slate-50"
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              log.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.status === 'success' ? 'نجاح' : 'فشل'}
                          </span>
                          <span className="text-slate-500">
                            {new Date(log.createdAt).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          {log.retryCount > 0 && (
                            <span className="text-slate-400 text-xs">محاولة {log.retryCount + 1}</span>
                          )}
                          {log.errorMessage && (
                            <span className="w-full text-red-600 text-xs truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
