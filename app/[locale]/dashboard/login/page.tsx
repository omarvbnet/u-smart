'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function RequesterLoginPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('Index');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';

  useEffect(() => {
    fetch('/api/auth/requester-me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          const target = data.user.serviceSlug === 'quality-control-supervision'
            ? `/${locale}/dashboard/quality-control`
            : `/${locale}/dashboard`;
          router.replace(target);
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/requester-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        const meRes = await fetch('/api/auth/requester-me').then((r) => r.json());
        const target = meRes.success && meRes.user?.serviceSlug === 'quality-control-supervision'
          ? `/${locale}/dashboard/quality-control`
          : `/${locale}/dashboard`;
        router.replace(target);
        router.refresh();
      } else {
        setError(data.message || t('ticketForm.loginFailed'));
      }
    } catch {
      setError(t('ticketForm.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="bg-[#0f1419] border border-white/10 rounded-2xl p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">
            {t('ticketForm.dashboardLoginTitle')}
          </h1>
          <p className="text-gray-400 text-sm text-center mb-8">
            {t('ticketForm.dashboardLoginSubtitle')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-500/20 text-red-400 text-sm border border-red-500/30">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                {t('ticketForm.username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none"
                placeholder="req_xxxx"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                {t('ticketForm.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
            >
              {loading ? '...' : t('ticketForm.loginButton')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link href="/" className="text-cyan-400 hover:text-cyan-300">
              {t('ticketForm.backToHome')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
