'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Smartphone, KeyRound } from 'lucide-react';
import { proviserHomePath } from '@/lib/proviser-web';

type LoginMode = 'phone' | 'password';

export default function ProviserLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<LoginMode>('phone');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/requester-me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.user) {
          router.replace(proviserHomePath(data.user.role));
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const goHome = async () => {
    const me = await fetch('/api/auth/requester-me', { credentials: 'include' }).then((r) => r.json());
    if (me.success && me.user) {
      router.replace(proviserHomePath(me.user.role));
      router.refresh();
    }
  };

  const sendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/requester-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), channel: 'whatsapp' }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
      } else {
        setError(data.message || 'Could not send code');
      }
    } catch {
      setError('Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/requester-otp/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        await goHome();
        return;
      }
      if (data.code === 'NO_ACCOUNT') {
        router.push(`/proviser/register?phone=${encodeURIComponent(phone.trim())}&code=${encodeURIComponent(code.trim())}`);
        return;
      }
      setError(data.message || 'Invalid code');
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const loginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/requester-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          usernameOrEmail: username.trim(),
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await goHome();
      } else {
        setError(data.message || 'Login failed');
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-amber-400 tracking-wide">Proviser</h1>
          <p className="text-gray-400 text-sm mt-2">QC &amp; supervision — web</p>
        </div>

        <div className="bg-[#0f1419] border border-white/10 rounded-2xl p-8 shadow-xl">
          <div className="flex rounded-lg bg-black/30 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('phone')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition ${
                mode === 'phone' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              Phone OTP
            </button>
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition ${
                mode === 'password' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Password
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/20 text-red-400 text-sm border border-red-500/30">
              {error}
            </div>
          )}

          {mode === 'phone' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Phone (with country code)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
                  placeholder="+964..."
                  disabled={otpSent}
                />
              </div>
              {otpSent && (
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white tracking-widest"
                    placeholder="6-digit code"
                  />
                </div>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={otpSent ? verifyOtp : sendOtp}
                className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {otpSent ? 'Sign in' : 'Send code via WhatsApp'}
              </button>
              {otpSent && (
                <button
                  type="button"
                  className="w-full text-sm text-gray-400 hover:text-white"
                  onClick={() => {
                    setOtpSent(false);
                    setCode('');
                  }}
                >
                  Change phone number
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={loginPassword} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Username or email</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          <Link href="https://www.usmart-iot.com" className="hover:text-gray-400">
            U-SMART main site
          </Link>
        </p>
      </div>
    </div>
  );
}
