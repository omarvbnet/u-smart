'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, Check, X } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { PageHeader, Card, CardBody, EmptyState } from '@/components/proviser/proviser-ui';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timeline?: Array<{ at: string; label: string; status: string; tool?: string }>;
};

type ApprovalRow = {
  id: string;
  toolId: string;
  action: string;
  reason: string | null;
  riskLevel: string;
  status: string;
  createdAt: string;
};

type PolicyState = {
  enabled: boolean;
  autonomyLevel: number;
  allowedTools: string[] | null;
  maxTransactionIqd: number;
  dailySpendLimitIqd: number;
  dailyAiRequestLimit: number;
  whatsappIngressEnabled: boolean;
};

type ToolInfo = {
  id: string;
  name: string;
  riskLevel: string;
  requiresApproval: boolean;
};

export default function ProviserUAgentPage() {
  return (
    <ProviserPageGuard>
      {() => <UAgentContent />}
    </ProviserPageGuard>
  );
}

function UAgentContent() {
  const [status, setStatus] = useState('ONLINE');
  const [greeting, setGreeting] = useState('شلون أگدر أساعدك اليوم؟');
  const [aiConfigured, setAiConfigured] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [canManageApprovals, setCanManageApprovals] = useState(false);
  const [canManagePolicy, setCanManagePolicy] = useState(false);
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [policySaving, setPolicySaving] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/agent/status', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      setStatus(String(data.status || 'ONLINE'));
      if (typeof data.greeting === 'string') setGreeting(data.greeting);
      setAiConfigured(data.aiConfigured !== false);
    }
  }, []);

  const loadApprovals = useCallback(async () => {
    const res = await fetch('/api/agent/approvals', { credentials: 'include' });
    const data = await res.json();
    if (data.success && Array.isArray(data.approvals)) {
      setApprovals(data.approvals as ApprovalRow[]);
      setCanManageApprovals(data.canManage === true);
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    const res = await fetch('/api/agent/policy', { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.policy) {
      setPolicy(data.policy as PolicyState);
      setCanManagePolicy(data.canManage === true);
      if (Array.isArray(data.tools)) setTools(data.tools as ToolInfo[]);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadApprovals();
    loadPolicy();
  }, [loadStatus, loadApprovals, loadPolicy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    setStatus('THINKING');
    setInput('');
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await fetch('/api/agent/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          conversationId: conversationId || undefined,
          idempotencyKey: `web-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'U Agent failed');
        setStatus('FAILED');
      } else {
        if (typeof data.conversationId === 'string') setConversationId(data.conversationId);
        setStatus(String(data.status || 'ONLINE'));
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: String(data.reply || data.message || ''),
            timeline: Array.isArray(data.timeline) ? data.timeline : undefined,
          },
        ]);
        await loadApprovals();
      }
    } catch {
      setError('Network error');
      setStatus('FAILED');
    } finally {
      setBusy(false);
      await loadStatus();
    }
  }

  async function resolveApproval(id: string, decision: 'approve' | 'reject') {
    const path =
      decision === 'approve'
        ? `/api/agent/approvals/${id}/approve`
        : `/api/agent/approvals/${id}/reject`;
    const res = await fetch(path, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!data.success) setError(data.message || 'Approval failed');
    await loadApprovals();
  }

  async function savePolicy(patch: Partial<PolicyState>) {
    if (!canManagePolicy || !policy) return;
    setPolicySaving(true);
    setError('');
    try {
      const res = await fetch('/api/agent/policy', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to save policy');
      } else if (data.policy) {
        setPolicy(data.policy as PolicyState);
      }
    } catch {
      setError('Network error saving policy');
    } finally {
      setPolicySaving(false);
    }
  }

  function toggleTool(toolId: string) {
    if (!policy) return;
    const current = policy.allowedTools;
    // null = all tools allowed; first toggle creates an allowlist of everything except this one,
    // or starts from all tool ids.
    const allIds = tools.map((t) => t.id);
    const base = current == null ? allIds : [...current];
    const next = base.includes(toolId) ? base.filter((id) => id !== toolId) : [...base, toolId];
    void savePolicy({ allowedTools: next });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="U Agent"
        subtitle="AI operating layer for Proviser — talk naturally, tools execute with permissions."
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
          <Sparkles className="h-4 w-4 text-violet-400" />
          Status: <strong>{status}</strong>
        </span>
        {!aiConfigured && (
          <span className="text-amber-300">OPENAI_API_KEY not set — limited fallback replies.</span>
        )}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardBody className="flex h-[min(70vh,640px)] flex-col gap-3">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <EmptyState message={`${greeting} — Ask about tickets, sites, KPIs, warehouse, or follow-ups. Sensitive actions need approval.`} />
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'ml-8 bg-violet-600/30 text-white'
                        : 'mr-8 bg-white/5 text-zinc-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.timeline?.length ? (
                      <ul className="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs text-zinc-400">
                        {m.timeline.map((t, i) => (
                          <li key={`${m.id}-${i}`}>
                            {new Date(t.at).toLocaleTimeString()} — {t.label}
                            {t.tool ? ` (${t.tool})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
              {busy ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 pt-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب طلبك… / Type a request…"
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-violet-500"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-200">Approval Center</h2>
              {!approvals.length ? (
                <p className="text-sm text-zinc-500">No pending approvals.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <p className="font-medium text-zinc-100">{a.action}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {a.toolId} · {a.riskLevel}
                    </p>
                    {a.reason ? <p className="mt-2 text-zinc-300">{a.reason}</p> : null}
                    {canManageApprovals ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => resolveApproval(a.id, 'approve')}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600/80 py-2 text-xs"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveApproval(a.id, 'reject')}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600/70 py-2 text-xs"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-300">Waiting for owner/manager.</p>
                    )}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {policy ? (
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-200">Owner policy</h2>
                {!canManagePolicy ? (
                  <p className="text-xs text-zinc-500">
                    Autonomy {policy.autonomyLevel} · WhatsApp ingress{' '}
                    {policy.whatsappIngressEnabled ? 'on' : 'off'} · spend limit{' '}
                    {policy.maxTransactionIqd} IQD
                  </p>
                ) : (
                  <>
                    <label className="flex items-center justify-between text-sm text-zinc-300">
                      <span>Enabled</span>
                      <input
                        type="checkbox"
                        checked={policy.enabled}
                        disabled={policySaving}
                        onChange={(e) => savePolicy({ enabled: e.target.checked })}
                      />
                    </label>
                    <label className="block text-sm text-zinc-300">
                      Autonomy (0–2)
                      <select
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                        value={policy.autonomyLevel}
                        disabled={policySaving}
                        onChange={(e) => savePolicy({ autonomyLevel: Number(e.target.value) })}
                      >
                        <option value={0}>0 — Assistant only</option>
                        <option value={1}>1 — Suggestions (default)</option>
                        <option value={2}>2 — Low-risk autonomous</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between text-sm text-zinc-300">
                      <span>WhatsApp ingress</span>
                      <input
                        type="checkbox"
                        checked={policy.whatsappIngressEnabled}
                        disabled={policySaving}
                        onChange={(e) => savePolicy({ whatsappIngressEnabled: e.target.checked })}
                      />
                    </label>
                    <p className="text-xs text-zinc-500">
                      Spend defaults stay 0 IQD. Max transaction: {policy.maxTransactionIqd} IQD.
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-zinc-400">Tool allowlist</p>
                      <button
                        type="button"
                        className="mb-2 text-xs text-violet-300 underline"
                        disabled={policySaving}
                        onClick={() => savePolicy({ allowedTools: null })}
                      >
                        Allow all tools
                      </button>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {tools.map((t) => {
                          const allowed =
                            policy.allowedTools == null || policy.allowedTools.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className="flex items-center justify-between gap-2 text-xs text-zinc-300"
                            >
                              <span>
                                {t.name}{' '}
                                <span className="text-zinc-500">({t.riskLevel})</span>
                              </span>
                              <input
                                type="checkbox"
                                checked={allowed}
                                disabled={policySaving}
                                onChange={() => toggleTool(t.id)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
