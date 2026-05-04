'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { X, Building2, User, Upload, Loader2 } from 'lucide-react';
import { normalizeEmailInput } from '@/lib/email-input';

const COMPANY_HUB_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN']);

function resolvePostLoginTarget(locale: string, user: { role?: string; serviceSlug?: string; companyId?: string | null } | null): string {
  if (!user) return `/${locale}/dashboard`;
  const role = (user.role ?? '').toUpperCase();
  // coordinator-platform users → company hub
  if (COMPANY_HUB_ROLES.has(role) || user.companyId) {
    return `/${locale}/dashboard/company-hub`;
  }
  // quality-control requesters → QC dashboard
  if (user.serviceSlug === 'quality-control-supervision') {
    return `/${locale}/dashboard/quality-control`;
  }
  return `/${locale}/dashboard`;
}

export default function RequesterLoginPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('Index');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);
  const [regStep, setRegStep] = useState<'role' | 'form'>('role');
  const [regRole, setRegRole] = useState<'COMPANY' | 'PERSONAL' | null>(null);
  const [regForm, setRegForm] = useState({ legalName: '', phone: '', email: '', province: '', username: '', password: '' });
  const [regEvidenceUrl, setRegEvidenceUrl] = useState('');
  const [regEvidenceUploading, setRegEvidenceUploading] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState('');
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';

  useEffect(() => {
    fetch('/api/auth/requester-me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          const target = resolvePostLoginTarget(locale, data.user);
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
        credentials: 'include',
        body: JSON.stringify({ usernameOrEmail: username.trim(), username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.success) {
        const meRes = await fetch('/api/auth/requester-me', { credentials: 'include' }).then((r) =>
          r.json(),
        );
        const target = meRes.success ? resolvePostLoginTarget(locale, meRes.user) : `/${locale}/dashboard`;
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
                placeholder={t('ticketForm.usernamePlaceholder')}
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

          <div className="mt-6 pt-6 border-t border-white/10">
            <button
              type="button"
              onClick={() => { setShowRegistration(true); setRegStep('role'); setRegRole(null); setRegForm({ legalName: '', phone: '', email: '', province: '', username: '', password: '' }); setRegEvidenceUrl(''); setRegSuccess(false); setRegError(''); }}
              className="w-full py-2.5 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-xl border border-cyan-500/30 transition-colors"
            >
              {t('ticketForm.requestRegistration') || 'Request for registration'}
            </button>
          </div>
        </div>
      </div>

      {showRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !regSubmitting && setShowRegistration(false)}>
          <div className="bg-[#0f1419] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">
                {t('ticketForm.requestRegistration') || 'Request for registration'}
              </h2>
              <button type="button" onClick={() => !regSubmitting && setShowRegistration(false)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {regSuccess ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl text-emerald-400">✓</span>
                </div>
                <p className="text-emerald-400 font-medium mb-2">{t('ticketForm.regRequestSubmitted') || 'Request submitted'}</p>
                <p className="text-sm text-gray-400 mb-4">{t('ticketForm.regRequestSubmittedHint') || 'You will be notified once approved.'}</p>
                <button type="button" onClick={() => setShowRegistration(false)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white text-sm font-medium">
                  {t('visitorRequestForm.close') || 'Close'}
                </button>
              </div>
            ) : regStep === 'role' ? (
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-400">{t('ticketForm.chooseRole') || 'Choose your role:'}</p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => { setRegRole('COMPANY'); setRegStep('form'); }}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-white/10 hover:border-cyan-500/50 bg-white/5 hover:bg-cyan-500/10 transition-all"
                  >
                    <Building2 className="w-10 h-10 text-cyan-400" />
                    <span className="font-medium text-white">{t('ticketForm.roleCompany') || 'Company'}</span>
                    <span className="text-xs text-gray-400 text-center">{t('ticketForm.roleCompanyHint') || 'Submit & manage tickets'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRegRole('PERSONAL'); setRegEvidenceUrl(''); setRegStep('form'); }}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-white/10 hover:border-cyan-500/50 bg-white/5 hover:bg-cyan-500/10 transition-all"
                  >
                    <User className="w-10 h-10 text-cyan-400" />
                    <span className="font-medium text-white">{t('ticketForm.rolePersonal') || 'Personal'}</span>
                    <span className="text-xs text-gray-400 text-center">{t('ticketForm.rolePersonalHint') || 'Individual use'}</span>
                  </button>
                </div>
                <button type="button" onClick={() => setRegStep('role')} className="text-sm text-gray-500 hover:text-white">
                  ← {t('ticketForm.back') || 'Back'}
                </button>
              </div>
            ) : (
              <form
                className="p-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRegError('');
                  if (!regForm.province?.trim()) {
                    setRegError(t('ticketForm.selectProvince') || 'Please select a province');
                    return;
                  }
                  if (!regForm.username.trim() || regForm.username.trim().length < 4) {
                    setRegError(t('ticketForm.usernameMin') || 'Username must be at least 4 characters');
                    return;
                  }
                  if (!regForm.password || regForm.password.length < 6) {
                    setRegError(t('ticketForm.passwordMin') || 'Password must be at least 6 characters');
                    return;
                  }
                  if (regRole === 'COMPANY' && !regEvidenceUrl) {
                    setRegError(t('ticketForm.evidenceRequired') || 'Identification evidence is required');
                    return;
                  }
                  setRegSubmitting(true);
                  try {
                    const res = await fetch('/api/registration-requests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        legalName: regForm.legalName.trim(),
                        phone: regForm.phone.trim(),
                        email: normalizeEmailInput(regForm.email).toLowerCase(),
                        province: regForm.province.trim(),
                        username: regForm.username.trim(),
                        password: regForm.password,
                        evidenceUrl: regEvidenceUrl,
                        role: regRole,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setRegSuccess(true);
                    } else {
                      setRegError(data.message || 'Failed to submit');
                    }
                  } catch {
                    setRegError(t('ticketForm.regRequestFailed') || 'Failed to submit request');
                  } finally {
                    setRegSubmitting(false);
                  }
                }}
              >
                <button type="button" onClick={() => setRegStep('role')} className="text-sm text-gray-500 hover:text-white mb-2">
                  ← {t('ticketForm.back') || 'Back'} ({regRole === 'COMPANY' ? t('ticketForm.roleCompany') || 'Company' : t('ticketForm.rolePersonal') || 'Personal'})
                </button>

                {regError && (
                  <div className="px-4 py-3 rounded-lg bg-red-500/20 text-red-400 text-sm border border-red-500/30">
                    {regError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.legalName') || 'Legal name'}</label>
                  <input
                    type="text"
                    value={regForm.legalName}
                    onChange={(e) => setRegForm((f) => ({ ...f, legalName: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    placeholder={t('ticketForm.legalNamePlaceholder') || 'Full legal name'}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('visitorRequestForm.phoneLabel') || 'Phone'}</label>
                  <input
                    type="tel"
                    value={regForm.phone}
                    onChange={(e) => setRegForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    placeholder="+964..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.email') || 'Email'}</label>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={regForm.email}
                    onChange={(e) => setRegForm((f) => ({ ...f, email: e.target.value }))}
                    onBlur={(e) => setRegForm((f) => ({ ...f, email: normalizeEmailInput(e.target.value) }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.username') || 'Username'}</label>
                  <input
                    type="text"
                    value={regForm.username}
                    onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    placeholder="req_username"
                    autoComplete="username"
                    minLength={4}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.password') || 'Password'}</label>
                  <input
                    type="password"
                    value={regForm.password}
                    onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.province') || 'Province'}</label>
                  <select
                    value={regForm.province}
                    onChange={(e) => setRegForm((f) => ({ ...f, province: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                    required
                  >
                    <option value="">{t('ticketForm.selectProvince')}</option>
                    {['Al-Anbar', 'Babil', 'Baghdad', 'Basra', 'Dhi Qar', 'Al-Qadisiyyah', 'Diyala', 'Duhok', 'Erbil', 'Halabja', 'Karbala', 'Kirkuk', 'Maysan', 'Muthanna', 'Najaf', 'Ninawa', 'Salah Al-Din', 'Sulaymaniyah', 'Wasit'].map((p) => (
                      <option key={p} value={p} className="bg-[#0f1419] text-white">{t(`ticketForm.provinces.${p}` as never) || p}</option>
                    ))}
                  </select>
                </div>
                {regRole === 'COMPANY' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.evidenceForIdentification') || 'Evidence for identification'}</label>
                    <p className="text-xs text-gray-500 mb-2">{t('ticketForm.evidenceHint') || 'ID card, passport, or company certificate (PDF, JPEG, PNG)'}</p>
                    {regEvidenceUrl ? (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <span className="text-sm text-emerald-400">✓ {t('ticketForm.fileUploaded') || 'File uploaded'}</span>
                        <a href={regEvidenceUrl.startsWith('http') ? regEvidenceUrl : regEvidenceUrl.startsWith('/') ? `${typeof window !== 'undefined' ? window.location.origin : ''}${regEvidenceUrl}` : regEvidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:underline">View</a>
                        <button type="button" onClick={() => setRegEvidenceUrl('')} className="text-xs text-red-400 hover:underline ml-auto">{t('ticketForm.remove') || 'Remove'}</button>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-white/20 hover:border-cyan-500/50 cursor-pointer transition-colors ${regEvidenceUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={regEvidenceUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setRegEvidenceUploading(true);
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              const res = await fetch('/api/upload/registration-evidence', { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.success && data.url) setRegEvidenceUrl(data.url);
                            } finally {
                              setRegEvidenceUploading(false);
                              e.target.value = '';
                            }
                          }}
                        />
                        {regEvidenceUploading ? <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /> : <Upload className="w-8 h-8 text-gray-400" />}
                        <span className="text-sm text-gray-400">{regEvidenceUploading ? t('ticketForm.uploading') || 'Uploading...' : t('ticketForm.uploadEvidence') || 'Upload PDF or image'}</span>
                      </label>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                >
                  {regSubmitting ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('ticketForm.submitting') || 'Submitting...'}</span> : (t('ticketForm.submitRequest') || 'Submit request')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
