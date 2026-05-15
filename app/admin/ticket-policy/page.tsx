'use client';

import { useCallback, useEffect, useState } from 'react';

type Policy = {
  cancellationReasons: string[];
  resubmitReasons: string[];
};

export default function AdminTicketPolicyPage() {
  const [policy, setPolicy] = useState<Policy>({ cancellationReasons: [], resubmitReasons: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelInput, setCancelInput] = useState('');
  const [resubmitInput, setResubmitInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ticket-policy');
      const data = await res.json();
      if (data.success && data.policy) {
        setPolicy({
          cancellationReasons: data.policy.cancellationReasons ?? [],
          resubmitReasons: data.policy.resubmitReasons ?? [],
        });
      }
    } catch {
      setMessage('Failed to load policy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ticket-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      const data = await res.json();
      if (data.success) {
        setPolicy(data.policy);
        setMessage('Saved. All company, personal, and workspace tickets use these lists.');
      } else {
        setMessage(data.message ?? 'Save failed.');
      }
    } catch {
      setMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-gray-400 p-8">Loading…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Ticket cancellation &amp; resubmit</h1>
        <p className="text-gray-400 text-sm mt-1">
          Platform-wide reason lists for all Provisor tickets: company accounts, personal accounts,
          and private workspaces. Requesters and field staff must pick from these lists; only admins
          can edit them here.
        </p>
      </div>

      {message && (
        <p className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-lg px-3 py-2">
          {message}
        </p>
      )}

      <ReasonListEditor
        title="Cancellation reasons"
        hint="Shown when a requester asks to cancel a pending ticket."
        items={policy.cancellationReasons}
        input={cancelInput}
        onInput={setCancelInput}
        onAdd={() => {
          const v = cancelInput.trim();
          if (!v) return;
          setPolicy((p) => ({ ...p, cancellationReasons: [...p.cancellationReasons, v] }));
          setCancelInput('');
        }}
        onRemove={(r) =>
          setPolicy((p) => ({
            ...p,
            cancellationReasons: p.cancellationReasons.filter((x) => x !== r),
          }))
        }
      />

      <ReasonListEditor
        title="Resubmit reasons"
        hint="Shown when field staff send a ticket back for requester edits."
        items={policy.resubmitReasons}
        input={resubmitInput}
        onInput={setResubmitInput}
        onAdd={() => {
          const v = resubmitInput.trim();
          if (!v) return;
          setPolicy((p) => ({ ...p, resubmitReasons: [...p.resubmitReasons, v] }));
          setResubmitInput('');
        }}
        onRemove={(r) =>
          setPolicy((p) => ({
            ...p,
            resubmitReasons: p.resubmitReasons.filter((x) => x !== r),
          }))
        }
      />

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save policy'}
      </button>
    </div>
  );
}

function ReasonListEditor({
  title,
  hint,
  items,
  input,
  onInput,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  items: string[];
  input: string;
  onInput: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-gray-400 text-xs">{hint}</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())}
          placeholder="Add reason…"
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
        >
          Add
        </button>
      </div>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="text-gray-500 text-sm">No reasons yet.</li>
        ) : (
          items.map((r) => (
            <li
              key={r}
              className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm text-white"
            >
              <span>{r}</span>
              <button
                type="button"
                onClick={() => onRemove(r)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
