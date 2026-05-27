'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Status = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

type Requester = {
  id: string;
  name: string | null;
  username: string;
  phone: string | null;
  role: string;
  email: string | null;
  preferredLocale: string | null;
  photoUrl: string | null;
};

type Report = {
  id: string;
  title: string;
  description: string;
  status: Status;
  adminNote: string | null;
  typeId: string | null;
  typeLabel: string | null;
  attachmentUrls: string[];
  appVersion: string | null;
  platform: string | null;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
  requester: Requester;
};

type IssueType = { id: string; slug: string; label: string };

const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

const STATUS_TONE: Record<Status, string> = {
  PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  IN_PROGRESS: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  REJECTED: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

const STATUSES: Status[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];

export default function AdminIssueReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [types, setTypes] = useState<IssueType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
  const [filterTypeId, setFilterTypeId] = useState<string>('ALL');
  const [pendingNote, setPendingNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterTypeId !== 'ALL') params.set('typeId', filterTypeId);
      const [rRes, tRes] = await Promise.all([
        fetch(`/api/admin/issue-reports?${params.toString()}`),
        fetch('/api/admin/issue-report-types'),
      ]);
      const rData = await rRes.json();
      const tData = await tRes.json();
      if (rData?.success) setReports(rData.reports as Report[]);
      if (tData?.success) setTypes(tData.types as IssueType[]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterTypeId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<Status, Report[]> = {
      PENDING: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      REJECTED: [],
    };
    for (const r of reports) {
      if (map[r.status]) map[r.status].push(r);
    }
    return map;
  }, [reports]);

  const update = async (id: string, body: { status?: Status; adminNote?: string | null }) => {
    try {
      const res = await fetch(`/api/admin/issue-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.success) {
        await load();
      } else {
        alert(data?.message ?? 'Failed to update report.');
      }
    } catch {
      alert('Network error.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Issue reports</h1>
        <p className="text-gray-400 text-sm mt-1">
          Submissions from the Proviser mobile app profile screen. Changing the status sends a
          push notification to the requester in their preferred language.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-400 mr-1">Status:</label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as Status | 'ALL')}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5"
        >
          <option value="ALL">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <label className="text-xs text-gray-400 ml-3 mr-1">Type:</label>
        <select
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5"
        >
          <option value="ALL">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-500">No reports.</p>
      ) : (
        <div className="space-y-6">
          {STATUSES.map((s) => {
            const items = grouped[s];
            if (!items.length) return null;
            return (
              <section key={s} className="space-y-3">
                <h2 className="text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full border text-xs ${STATUS_TONE[s]}`}>
                    {STATUS_LABEL[s]}
                  </span>
                  <span className="text-gray-500">{items.length}</span>
                </h2>
                <ul className="space-y-3">
                  {items.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-white font-medium">{r.title}</p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {r.typeLabel ?? 'Untyped'} · {new Date(r.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full border text-xs ${STATUS_TONE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>

                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{r.description}</p>

                      {r.attachmentUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {r.attachmentUrls.map((u, i) => (
                            <a
                              key={i}
                              href={u}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-2 py-1 rounded-md bg-black/40 border border-white/10 text-sky-300 hover:bg-black/60"
                            >
                              Attachment {i + 1}
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-400">
                        <p>
                          <span className="text-gray-500">From: </span>
                          {r.requester.name ?? r.requester.username} ({r.requester.role}) · {r.requester.phone ?? '—'}
                        </p>
                        <p>
                          <span className="text-gray-500">App: </span>
                          {r.appVersion ?? '—'} · {r.platform ?? '—'}
                        </p>
                      </div>

                      <textarea
                        rows={2}
                        placeholder="Optional internal note for the requester…"
                        value={pendingNote[r.id] ?? r.adminNote ?? ''}
                        onChange={(e) =>
                          setPendingNote((p) => ({ ...p, [r.id]: e.target.value }))
                        }
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
                      />

                      <div className="flex flex-wrap gap-2">
                        {STATUSES.filter((s) => s !== r.status).map((next) => (
                          <button
                            key={next}
                            onClick={() =>
                              update(r.id, {
                                status: next,
                                adminNote: pendingNote[r.id] ?? r.adminNote ?? null,
                              })
                            }
                            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white"
                          >
                            Mark {STATUS_LABEL[next]}
                          </button>
                        ))}
                        {(pendingNote[r.id] ?? '') !== (r.adminNote ?? '') && (
                          <button
                            onClick={() =>
                              update(r.id, { adminNote: pendingNote[r.id] ?? '' })
                            }
                            className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white"
                          >
                            Save note
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
