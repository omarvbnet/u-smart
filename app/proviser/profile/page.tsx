'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { useProviserUser } from '@/components/proviser/use-proviser-user';

export default function ProviserProfilePage() {
  const { user, loading: authLoading, logout, refresh } = useProviserUser({ redirectToLogin: true });
  const [passwordMsg, setPasswordMsg] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [changing, setChanging] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const sendOtp = async () => {
    setOtpSending(true);
    setPasswordMsg('');
    try {
      const res = await fetch('/api/auth/requester-send-change-password-otp', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      setPasswordMsg(data.success ? 'Code sent to your phone.' : data.message || 'Failed');
    } catch {
      setPasswordMsg('Failed to send code');
    } finally {
      setOtpSending(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChanging(true);
    setPasswordMsg('');
    try {
      const res = await fetch('/api/auth/requester-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: otpCode.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMsg('Password updated.');
        setOtpCode('');
        setNewPassword('');
        await refresh();
      } else {
        setPasswordMsg(data.message || 'Update failed');
      }
    } catch {
      setPasswordMsg('Update failed');
    } finally {
      setChanging(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} onLogout={logout}>
      <h1 className="text-xl font-semibold mb-6">Profile</h1>
      <dl className="space-y-3 text-sm mb-8">
        <div className="flex justify-between border-b border-white/10 pb-2">
          <dt className="text-gray-500">Name</dt>
          <dd>{user.name || '—'}</dd>
        </div>
        <div className="flex justify-between border-b border-white/10 pb-2">
          <dt className="text-gray-500">Username</dt>
          <dd>{user.username}</dd>
        </div>
        <div className="flex justify-between border-b border-white/10 pb-2">
          <dt className="text-gray-500">Phone</dt>
          <dd>{user.phone || '—'}</dd>
        </div>
        <div className="flex justify-between border-b border-white/10 pb-2">
          <dt className="text-gray-500">Role</dt>
          <dd>{user.role || '—'}</dd>
        </div>
        <div className="flex justify-between border-b border-white/10 pb-2">
          <dt className="text-gray-500">Company</dt>
          <dd>{user.company || '—'}</dd>
        </div>
      </dl>

      <section className="rounded-xl border border-white/10 p-4 bg-[#0f1419]">
        <h2 className="font-medium mb-3">Change password</h2>
        {passwordMsg && <p className="text-sm text-amber-300 mb-3">{passwordMsg}</p>}
        <button
          type="button"
          onClick={sendOtp}
          disabled={otpSending}
          className="text-sm text-amber-400 hover:underline mb-4 disabled:opacity-50"
        >
          {otpSending ? 'Sending…' : 'Send OTP to phone'}
        </button>
        <form onSubmit={changePassword} className="space-y-3">
          <input
            placeholder="OTP code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <button
            type="submit"
            disabled={changing}
            className="w-full py-2 rounded-lg bg-amber-500 text-black text-sm font-medium disabled:opacity-50"
          >
            Update password
          </button>
        </form>
      </section>
    </ProviserShell>
  );
}
