'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  FunnelIcon,
  ScaleIcon,
  XMarkIcon,
  CheckBadgeIcon,
  ArrowPathRoundedSquareIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

type ConflictRow = {
  id: string;
  ticketId: string;
  siteName: string | null;
  siteCoordinator: string | null;
  inspectionResult: string;
  status: string;
  isMaintenanceConflict?: boolean;
  serviceSlug?: string | null;
  reportedAt?: string | null;
  updatedAt?: string | null;
  resolution?: string | null;
  resolutionComment?: string | null;
  inspectionComments?: string | null;
  ncrReason?: string | null;
  conflictReportComment?: string | null;
  assignedEngineerId?: string | null;
  assignedEngineerName?: string | null;
  reportedBy?: string | null;
};

type Counts = {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  reInspection: number;
  maintenance: number;
  qc: number;
};

type ResolutionAction =
  | 'keep_same'
  | 're_inspection'
  | 'accepted'
  | 'accepted_with_comments'
  | 'not_accepted'
  | 'ncr'
  | 're_maintain'
  | 'no_need';

const RESOLUTION_LABEL: Record<ResolutionAction, string> = {
  keep_same: 'Keep original result',
  re_inspection: 'Re-inspect',
  accepted: 'Override to: Accepted',
  accepted_with_comments: 'Override to: Accepted with comments',
  not_accepted: 'Override to: Not accepted',
  ncr: 'Override to: NCR',
  re_maintain: 'Re-maintain (back to pending)',
  no_need: 'No further maintenance needed',
};

const QC_RESOLUTIONS: ResolutionAction[] = [
  're_inspection',
  'keep_same',
  'accepted',
  'accepted_with_comments',
  'not_accepted',
  'ncr',
];

const MAINTENANCE_RESOLUTIONS: ResolutionAction[] = [
  're_maintain',
  'keep_same',
  'no_need',
];

export default function AdminConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [serviceSlug, setServiceSlug] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [resolveTarget, setResolveTarget] = useState<ConflictRow | null>(null);
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== 'all') params.set('status', status);
      if (kind && kind !== 'all') params.set('kind', kind);
      if (q.trim()) params.set('q', q.trim());
      if (serviceSlug.trim()) params.set('serviceSlug', serviceSlug.trim());
      const res = await fetch(`/api/admin/conflicts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setConflicts(data.conflicts ?? []);
        setCounts(data.counts ?? null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [status, kind, q, serviceSlug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!okMsg) return;
    const t = setTimeout(() => setOkMsg(''), 4000);
    return () => clearTimeout(t);
  }, [okMsg]);

  const badge = (s: string) => {
    const u = String(s ?? '').toLowerCase();
    if (u === 'pending') return 'bg-amber-500/20 text-amber-200 border border-amber-500/40';
    if (u === 'resolved') return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30';
    if (u === 're_inspection') return 'bg-sky-500/15 text-sky-100 border border-sky-500/35';
    return 'bg-slate-700/50 text-slate-200 border border-white/10';
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Manage conflicts</h1>
          <p className="text-sm text-slate-400 mt-1">
            QC and maintenance dispute cases flagged on tickets ({counts?.total ?? '—'} total). Resolve directly: keep
            the original result, override it, or send the ticket back for re-inspection. Both the requester and the
            ticket handler are automatically notified by email and push.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {okMsg && (
        <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-sm text-emerald-100 flex items-center gap-2">
          <CheckBadgeIcon className="w-4 h-4 text-emerald-300" />
          {okMsg}
        </div>
      )}

      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: counts.total },
            { label: 'Open (actionable)', value: counts.open },
            { label: 'Pending', value: counts.pending },
            { label: 'Resolved', value: counts.resolved },
            { label: 'Re-inspection', value: counts.reInspection },
            { label: 'Maintenance / QC', value: `${counts.maintenance} / ${counts.qc}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950 px-4 py-3 shadow-lg shadow-black/20"
            >
              <div className="text-xs text-slate-500 font-medium">{label}</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <FunnelIcon className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white"
          >
            <option value="all">Status: All</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="re_inspection">Re-inspection</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white"
          >
            <option value="all">Kind: All</option>
            <option value="qc">QC inspections</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <input
            value={serviceSlug}
            onChange={(e) => setServiceSlug(e.target.value)}
            placeholder="Service slug filter (optional)"
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 min-w-[200px]"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search site name, coordinator, ticket id…"
            className="flex-1 min-w-[220px] rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/80">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : conflicts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No conflicts match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/90 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Ticket</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c) => {
                  const isOpen = String(c.status).toLowerCase() === 'pending';
                  return (
                    <tr key={c.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-white font-medium">
                        {c.siteName ?? '—'}
                        {c.siteCoordinator ? (
                          <div className="text-xs font-normal text-slate-400 mt-0.5">{c.siteCoordinator}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {c.isMaintenanceConflict ? (
                          <span className="text-orange-300">Maintenance</span>
                        ) : (
                          <span className="text-cyan-200">QC</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 capitalize">
                        {String(c.inspectionResult).replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold capitalize ${badge(
                            c.status
                          )}`}
                        >
                          {String(c.status).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{c.serviceSlug ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/en/ticket/${c.ticketId}`}
                          className="text-cyan-400 hover:underline font-mono text-xs"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {c.ticketId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setResolveTarget(c)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            isOpen
                              ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border-cyan-500/30'
                              : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
                          }`}
                        >
                          <ScaleIcon className="w-4 h-4" />
                          {isOpen ? 'Resolve' : 'Re-resolve'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resolveTarget && (
        <ResolveConflictModal
          conflict={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onResolved={(msg) => {
            setOkMsg(msg);
            setResolveTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ResolveConflictModal({
  conflict,
  onClose,
  onResolved,
}: {
  conflict: ConflictRow;
  onClose: () => void;
  onResolved: (msg: string) => void;
}) {
  const isMaintenance = conflict.isMaintenanceConflict === true;
  const options = isMaintenance ? MAINTENANCE_RESOLUTIONS : QC_RESOLUTIONS;
  const [resolution, setResolution] = useState<ResolutionAction>(options[0]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/conflicts/${conflict.ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        const summary =
          resolution === 're_inspection'
            ? 'Re-inspection ordered. Ticket moved to IN_PROGRESS and notifications sent.'
            : resolution === 're_maintain'
              ? 'Re-maintain triggered. Ticket moved to PENDING and notifications sent.'
              : resolution === 'keep_same' || resolution === 'no_need'
                ? 'Conflict resolved (original result kept). Notifications sent.'
                : `Result overridden to "${resolution.replace(/_/g, ' ')}". Notifications sent.`;
        onResolved(summary);
      } else {
        setErr(data.message ?? 'Failed to resolve conflict.');
      }
    } catch (e) {
      console.error(e);
      setErr('Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-950 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScaleIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Resolve conflict</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300 space-y-1">
            <div>
              <span className="text-slate-500">Site:</span>{' '}
              <span className="text-white font-medium">{conflict.siteName ?? '—'}</span>
            </div>
            {conflict.siteCoordinator && (
              <div>
                <span className="text-slate-500">Coordinator:</span>{' '}
                <span className="text-slate-200">{conflict.siteCoordinator}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">Reported result:</span>{' '}
              <span className="text-amber-200 capitalize">
                {String(conflict.inspectionResult).replace(/_/g, ' ')}
              </span>
            </div>
            {conflict.assignedEngineerName && (
              <div>
                <span className="text-slate-500">Handler:</span>{' '}
                <span className="text-slate-200">{conflict.assignedEngineerName}</span>
              </div>
            )}
            {conflict.conflictReportComment && (
              <div className="text-xs text-slate-400 mt-1 italic">
                Reporter said: “{conflict.conflictReportComment}”
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Choose resolution
            </label>
            <div className="space-y-2">
              {options.map((opt) => (
                <ResolutionOption
                  key={opt}
                  active={resolution === opt}
                  onClick={() => setResolution(opt)}
                  label={RESOLUTION_LABEL[opt]}
                  hint={hintFor(opt)}
                  icon={iconFor(opt)}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Comment to share with both sides (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Why this decision? It will be included in the email and notification."
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100 flex items-start gap-2">
            <CheckBadgeIcon className="w-4 h-4 text-cyan-300 mt-0.5 shrink-0" />
            <span>
              The ticket requester and the assigned engineer/technician will both receive an in-app notification, push,
              and an email with the final result and your comment.
            </span>
          </div>

          {err && (
            <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-200">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-300 hover:bg-white/10 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-950 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
            >
              {submitting && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              Apply resolution
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResolutionOption({
  active,
  onClick,
  label,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
        active
          ? 'border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
      }`}
    >
      <div
        className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          active ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-slate-300'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${active ? 'text-cyan-100' : 'text-white'}`}>{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{hint}</div>
      </div>
    </button>
  );
}

function hintFor(r: ResolutionAction): string {
  switch (r) {
    case 're_inspection':
      return 'Clears the previous inspection (kept in history) and sets the ticket back to IN_PROGRESS.';
    case 'keep_same':
      return 'Marks the conflict as resolved without changing the inspection result.';
    case 'accepted':
      return 'Overrides the inspection result to “accepted” and closes the conflict.';
    case 'accepted_with_comments':
      return 'Overrides the result to “accepted with comments” and closes the conflict.';
    case 'not_accepted':
      return 'Overrides the result to “not accepted” and closes the conflict.';
    case 'ncr':
      return 'Overrides the result to “NCR” and closes the conflict.';
    case 're_maintain':
      return 'Sends the maintenance ticket back to PENDING for re-execution.';
    case 'no_need':
      return 'Closes the conflict — no further maintenance action required.';
  }
}

function iconFor(r: ResolutionAction): React.ReactNode {
  switch (r) {
    case 're_inspection':
    case 're_maintain':
      return <ArrowPathRoundedSquareIcon className="w-4 h-4" />;
    case 'keep_same':
    case 'no_need':
      return <CheckBadgeIcon className="w-4 h-4" />;
    default:
      return <PencilSquareIcon className="w-4 h-4" />;
  }
}
