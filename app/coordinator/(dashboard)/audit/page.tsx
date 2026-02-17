'use client';

import { useEffect, useState } from 'react';
import { Shield, Loader2, Filter } from 'lucide-react';

type Log = {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  payload: unknown;
  ip: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
};

export default function CoordinatorAuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (resourceFilter) params.set('resource', resourceFilter);
    params.set('limit', '100');
    fetch(`/api/coordinator/audit-logs?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.logs) setLogs(d.logs); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [actionFilter, resourceFilter]);

  const actionLabels: Record<string, string> = {
    login: 'تسجيل الدخول',
    task_create: 'إنشاء مهمة',
    task_update: 'تحديث مهمة',
    task_delete: 'حذف مهمة',
    task_escalate: 'تصعيد مهمة',
    task_ai_process: 'معالجة مهمة بالذكاء الاصطناعي',
    job_duty_create: 'إنشاء واجب وظيفة',
    job_duty_update: 'تحديث واجب وظيفة',
    job_duty_delete: 'حذف واجب وظيفة',
    cron_run_now: 'تشغيل إنشاء المهام الآن',
    kpi_create: 'إنشاء KPI',
    kpi_update: 'تحديث KPI',
    kpi_delete: 'حذف KPI',
    report_create: 'إنشاء تقرير',
    system_create: 'إنشاء تكامل',
    system_update: 'تحديث تكامل',
    system_delete: 'حذف تكامل',
    system_action: 'تشغيل تكامل',
    social_account_create: 'إضافة حساب تواصل',
    social_account_update: 'تحديث حساب تواصل',
    social_account_delete: 'حذف حساب تواصل',
    outreach_message_create: 'إنشاء رسالة تواصل',
    job_result_create: 'إضافة نتيجة وظيفة',
    profile_update: 'تحديث الملف الشخصي',
    generated_application_create: 'إنشاء طلب مولّد',
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">سجل التدقيق</h1>

      <div className="flex flex-wrap gap-3 items-center">
        <span className="flex items-center gap-2 text-slate-600">
          <Filter className="w-4 h-4" /> تصفية:
        </span>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">كل الإجراءات</option>
          {Object.entries(actionLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">كل الموارد</option>
          <option value="auth">auth</option>
          <option value="task">task</option>
          <option value="job_duty">job_duty</option>
          <option value="kpi">kpi</option>
          <option value="report">report</option>
          <option value="external_system">external_system</option>
          <option value="social_account">social_account</option>
          <option value="outreach_message">outreach_message</option>
          <option value="job_result">job_result</option>
          <option value="profile">profile</option>
          <option value="generated_application">generated_application</option>
        </select>
        <button type="button" onClick={load} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm">
          تحديث
        </button>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <p className="p-6 text-slate-500">لا توجد سجلات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-medium text-slate-700">الوقت</th>
                  <th className="p-3 font-medium text-slate-700">الإجراء</th>
                  <th className="p-3 font-medium text-slate-700">المورد</th>
                  <th className="p-3 font-medium text-slate-700">المستخدم</th>
                  <th className="p-3 font-medium text-slate-700">IP</th>
                  <th className="p-3 font-medium text-slate-700">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-600">{new Date(l.createdAt).toLocaleString('ar-SA')}</td>
                    <td className="p-3">{actionLabels[l.action] || l.action}</td>
                    <td className="p-3">{l.resource || '—'}{l.resourceId ? ` #${l.resourceId.slice(-6)}` : ''}</td>
                    <td className="p-3">{l.userName || l.userEmail || l.userId || '—'}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{l.ip || '—'}</td>
                    <td className="p-3 max-w-[200px] truncate" title={typeof l.payload === 'object' ? JSON.stringify(l.payload) : String(l.payload)}>
                      {l.payload != null ? (typeof l.payload === 'object' ? JSON.stringify(l.payload).slice(0, 60) + (JSON.stringify(l.payload).length > 60 ? '…' : '') : String(l.payload)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
