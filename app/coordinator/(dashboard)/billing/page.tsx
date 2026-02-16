'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';

type Plan = { id: string; tier: string; name: string; amountCents: number; interval: string; stripePriceId: boolean };
type Invoice = { id: string; amountCents: number; periodFrom: string; periodTo: string; pdfUrl: string | null; createdAt: string };
type BillingData = {
  company: { name: string; currentPlan: { tier: string; name: string; amountCents: number; interval: string } | null };
  subscription: { id: string; status: string; currentPeriodEnd: string | null; plan: { tier: string; name: string } | null } | null;
  invoices: Invoice[];
  plans: Plan[];
};

export default function CoordinatorBillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') setMessage({ type: 'success', text: 'تم تفعيل الاشتراك بنجاح.' });
    if (params.get('canceled') === '1') setMessage({ type: 'error', text: 'تم إلغاء الدفع.' });
  }, []);

  const load = () => {
    setLoading(true);
    fetch('/api/coordinator/billing', { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => {
        if (d.success) setData(d);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startCheckout = async (planTier: string) => {
    setCheckoutLoading(planTier);
    try {
      const res = await fetch('/api/coordinator/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planTier }),
      });
      const d = await res.json();
      if (d.success && d.url) {
        window.location.href = d.url;
        return;
      }
      setMessage({ type: 'error', text: d.message || 'فشل إنشاء جلسة الدفع' });
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentTier = data.subscription?.plan?.tier || data.company.currentPlan?.tier;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">الفواتير والاشتراك</h1>

      {message && (
        <div
          className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">الاشتراك الحالي</h2>
        {data.subscription ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-700">
              {data.subscription.plan?.name || data.company.currentPlan?.name || '—'}
            </span>
            <span className="text-sm text-slate-500">
              الحالة: {data.subscription.status === 'ACTIVE' ? 'نشط' : data.subscription.status}
            </span>
            {data.subscription.currentPeriodEnd && (
              <span className="text-sm text-slate-500">
                ينتهي في: {new Date(data.subscription.currentPeriodEnd).toLocaleDateString('ar-SA')}
              </span>
            )}
          </div>
        ) : data.company.currentPlan ? (
          <p className="text-slate-700">{data.company.currentPlan.name} (خطة افتراضية)</p>
        ) : (
          <p className="text-slate-500">لا يوجد اشتراك نشط. اختر خطة أدناه.</p>
        )}
      </section>

      {data.plans.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">الخطط</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((plan) => (
              <div
                key={plan.id}
                className={`p-4 rounded-lg border ${
                  currentTier === plan.tier ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200'
                }`}
              >
                <p className="font-medium text-slate-800">{plan.name}</p>
                <p className="text-slate-600">
                  {(plan.amountCents / 100).toFixed(2)} / {plan.interval === 'year' ? 'سنة' : 'شهر'}
                </p>
                {currentTier !== plan.tier && plan.stripePriceId && (
                  <button
                    type="button"
                    className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    onClick={() => startCheckout(plan.tier)}
                    disabled={!!checkoutLoading}
                  >
                    {checkoutLoading === plan.tier ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    {currentTier === plan.tier ? 'الخطة الحالية' : 'اشتراك'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">الفواتير الأخيرة</h2>
        {data.invoices.length === 0 ? (
          <p className="text-slate-500">لا توجد فواتير.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {data.invoices.map((inv) => (
              <li key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-700">
                  {(inv.amountCents / 100).toFixed(2)} — {new Date(inv.periodFrom).toLocaleDateString('ar-SA')} →{' '}
                  {new Date(inv.periodTo).toLocaleDateString('ar-SA')}
                </span>
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm flex items-center gap-1"
                  >
                    <CreditCard className="w-4 h-4" />
                    PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
