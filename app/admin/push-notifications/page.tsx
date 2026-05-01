'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

type Requester = {
  id: string;
  username: string;
  name: string | null;
  role: string;
  phone: string;
};

export default function AdminPushNotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | 'single'>('all');
  const [requesterId, setRequesterId] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [loadingRequesters, setLoadingRequesters] = useState(false);

  const canSend = useMemo(() => {
    if (!title.trim() || !message.trim()) return false;
    if (target === 'single' && !requesterId.trim()) return false;
    return true;
  }, [title, message, target, requesterId]);

  const loadRequesters = async () => {
    setLoadingRequesters(true);
    try {
      const res = await fetch('/api/admin/requesters');
      const data = await res.json();
      if (data?.success && Array.isArray(data.requesters)) {
        setRequesters(
          data.requesters.map((r: any) => ({
            id: String(r.id),
            username: String(r.username),
            name: r.name ?? null,
            role: String(r.role ?? 'COMPANY'),
            phone: String(r.phone ?? ''),
          }))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequesters(false);
    }
  };

  useEffect(() => {
    loadRequesters();
  }, []);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/push-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          requesterId: target === 'single' ? requesterId.trim() : '',
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setStatus(`Sent${typeof data.sent === 'number' ? ` (${data.sent})` : ''}`);
        setTitle('');
        setMessage('');
      } else {
        setStatus(data?.message || 'Failed to send');
      }
    } catch {
      setStatus('Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Push notifications (Proviser app)</h1>
        <button
          type="button"
          onClick={loadRequesters}
          disabled={loadingRequesters}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-5 h-5 ${loadingRequesters ? 'animate-spin' : ''}`} />
          Refresh users
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g. U-SMART"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target *</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Proviser app users</option>
              <option value="single">Single requester</option>
            </select>
          </div>
        </div>

        {target === 'single' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Requester</label>
            <select
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select requester...</option>
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.username} — {r.name ?? '—'} — {r.role} — {r.phone}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">This uses the requester id in DB.</p>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="Notification body..."
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={!canSend || sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
            {sending ? 'Sending...' : 'Send push'}
          </button>
          {status && <span className="text-sm text-gray-700">{status}</span>}
        </div>
      </div>
    </div>
  );
}

