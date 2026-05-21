'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, MessageSquare, Send } from 'lucide-react';
import { useProviserUser } from '@/components/proviser/use-proviser-user';
import { isEngineerRole } from '@/lib/proviser-web';

type TicketDetail = {
  id: string;
  siteName: string | null;
  technique: string;
  status: string;
  province?: string | null;
  createdAt: string;
  completedAt: string | null;
  statusTimeline?: { status: string; createdAt: string }[];
  inspectionResult?: string | null;
  assignedEngineerName?: string | null;
};

type Comment = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export default function ProviserTicketDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { user, loading: authLoading } = useProviserUser({ redirectToLogin: true });
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const backHref = user && isEngineerRole(user.role) ? '/proviser/engineer' : '/proviser/company';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/tickets/${id}`, { credentials: 'include' }),
        fetch(`/api/tickets/${id}/comments`, { credentials: 'include' }),
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();
      if (tData.success && tData.ticket) {
        setTicket(tData.ticket);
      } else {
        setError(tData.message || 'Ticket not found');
      }
      if (cData.success && Array.isArray(cData.comments)) {
        setComments(cData.comments);
      }
    } catch {
      setError('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCommentBody('');
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const assignToMe = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) load();
      else setError(data.message || 'Assign failed');
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (status: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) load();
      else setError(data.message || 'Status update failed');
    } finally {
      setActionLoading(false);
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
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to tickets
        </Link>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          </div>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : ticket ? (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-semibold">{ticket.siteName || 'Ticket'}</h1>
              <p className="text-sm text-gray-500 mt-1 font-mono">{ticket.id}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300">{ticket.status}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-gray-300">{ticket.technique}</span>
              </div>
            </header>

            <dl className="text-sm space-y-2 mb-6 rounded-xl border border-white/10 p-4 bg-[#0f1419]">
              <div className="flex justify-between">
                <dt className="text-gray-500">Province</dt>
                <dd>{ticket.province || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Assigned</dt>
                <dd>{ticket.assignedEngineerName || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Inspection</dt>
                <dd>{ticket.inspectionResult || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
              </div>
            </dl>

            {isEngineerRole(user.role) && (
              <div className="flex flex-wrap gap-2 mb-6">
                {ticket.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={assignToMe}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-medium disabled:opacity-50"
                  >
                    Assign to me
                  </button>
                )}
                {ticket.status === 'ON_SITE' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => updateStatus('IN_PROGRESS')}
                    className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm disabled:opacity-50"
                  >
                    Start work
                  </button>
                )}
                {ticket.status === 'IN_PROGRESS' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => updateStatus('COMPLETED')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
                  >
                    Mark completed
                  </button>
                )}
              </div>
            )}

            {ticket.statusTimeline && ticket.statusTimeline.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-medium text-gray-400 mb-2">Timeline</h2>
                <ul className="space-y-1 text-sm">
                  {ticket.statusTimeline.map((s, i) => (
                    <li key={i} className="text-gray-300">
                      {s.status} — {new Date(s.createdAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-400 mb-3">
                <MessageSquare className="w-4 h-4" />
                Comments
              </h2>
              <ul className="space-y-2 mb-4">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-lg bg-[#0f1419] border border-white/10 px-3 py-2 text-sm">
                    <p className="font-medium text-amber-200/80">{c.authorName}</p>
                    <p className="text-gray-300 mt-1">{c.body}</p>
                    <p className="text-xs text-gray-600 mt-1">{new Date(c.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={postComment} className="flex gap-2">
                <input
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-2 rounded-lg bg-amber-500 text-black disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
