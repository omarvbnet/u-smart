'use client';

import { useState } from 'react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { PageHeader, Card, CardBody } from '@/components/proviser/proviser-ui';
import type { ProviserUser } from '@/lib/proviser-web';

export default function ProviserProfilePage() {
  return (
    <ProviserPageGuard>
      {({ user }) => <ProfileContent user={user} />}
    </ProviserPageGuard>
  );
}

function ProfileContent({ user }: { user: ProviserUser }) {
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
        body: JSON.stringify({ otpCode, newPassword }),
      });
      const data = await res.json();
      setPasswordMsg(data.success ? 'Password updated.' : data.message || 'Failed');
      if (data.success) {
        setOtpCode('');
        setNewPassword('');
      }
    } catch {
      setPasswordMsg('Update failed');
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile" subtitle="Account details and security." />
      <Card className="mb-6 max-w-lg">
        <CardBody>
          <dl className="space-y-3 text-sm">
            {[
              ['Name', user.name || '—'],
              ['Username', user.username],
              ['Phone', user.phone || '—'],
              ['Role', user.role || '—'],
              ['Company', user.company || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-white/[0.06] pb-2">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card className="max-w-lg">
        <CardBody>
          <h2 className="font-semibold text-white mb-3">Change password</h2>
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
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white text-sm"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white text-sm"
            />
            <button
              type="submit"
              disabled={changing}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold disabled:opacity-50"
            >
              Update password
            </button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
