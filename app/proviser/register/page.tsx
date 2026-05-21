'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Loader2, User } from 'lucide-react';
import { proviserHomePath } from '@/lib/proviser-web';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get('phone') ?? '';
  const code = params.get('code') ?? '';
  const [role, setRole] = useState<'COMPANY' | 'PERSONAL'>('COMPANY');
  const [name, setName] = useState('');
  const [province, setProvince] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !code) {
      setError('Missing phone or verification code. Start from login.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/requester-otp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone,
          code,
          name: name.trim(),
          role,
          province: province.trim(),
          company: role === 'COMPANY' ? company.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const me = await fetch('/api/auth/requester-me', { credentials: 'include' }).then((r) => r.json());
        router.replace(proviserHomePath(me.user?.role));
        router.refresh();
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#0f1419] border border-white/10 rounded-2xl p-8">
        <h1 className="text-xl font-bold text-white mb-2">Complete registration</h1>
        <p className="text-sm text-gray-400 mb-6">Phone: {phone || '—'}</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setRole('COMPANY')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border ${
              role === 'COMPANY' ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-white/10 text-gray-400'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Company
          </button>
          <button
            type="button"
            onClick={() => setRole('PERSONAL')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border ${
              role === 'PERSONAL' ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-white/10 text-gray-400'
            }`}
          >
            <User className="w-4 h-4" />
            Personal
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
          />
          <input
            required
            placeholder="Province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
          />
          {role === 'COMPANY' && (
            <input
              required
              placeholder="Company name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
            />
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-50 flex justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>
        </form>

        <Link href="/proviser/login" className="block text-center text-sm text-gray-500 mt-4 hover:text-gray-300">
          Back to login
        </Link>
      </div>
    </div>
  );
}

export default function ProviserRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
