'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon } from '@heroicons/react/24/outline';

type VisitorRequest = {
  id: string;
  buildingType: string;
  phone: string;
  province: string;
  technique: string;
  name: string | null;
  company: string | null;
  email: string | null;
  serviceSlug: string;
  siteName?: string | null;
  siteCoordinator?: string | null;
  slaHours?: number | null;
  status?: string;
  createdAt: string;
};

export default function VisitorRequestsAdminPage() {
  const [list, setList] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; read: boolean }[]>([]);

  const loadPendingCount = async () => {
    try {
      const res = await fetch('/api/notifications/count?type=pending_visitor_tickets');
      const data = await res.json();
      if (data.success && typeof data.count === 'number') setPendingCount(data.count);
    } catch {
      /* ignore */
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        loadPendingCount();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/visitor-requests?onlySlugs=smart-home-automation,custom-software,programming');
      const data = await res.json();
      if (data.success && data.requests) setList(data.requests);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?for=admin');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) setNotifications(data.notifications.slice(0, 10));
    } catch {
      /* ignore */
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    loadPendingCount();
    loadNotifications();
  }, []);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const VISITOR_STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'ON_SITE', label: 'On site' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'COMPLETED', label: 'Completed' },
  ] as const;

  const parseTicketData = (r: VisitorRequest) => {
    let siteName = r.siteName ?? null;
    let siteCoordinator = r.siteCoordinator ?? null;
    let slaHours = r.slaHours ?? null;
    let displayCompany = r.company ?? null;
    let displayStatus = (r.status ?? '').toUpperCase() || 'PENDING';
    if (typeof r.company === 'string') {
      try {
        const parsed = JSON.parse(r.company);
        if (parsed._ticket && typeof parsed.status === 'string') {
          siteName = parsed.siteName ?? siteName;
          siteCoordinator = parsed.siteCoordinator ?? siteCoordinator;
          slaHours = parsed.slaHours ?? slaHours;
          displayCompany = parsed.company ?? displayCompany;
          displayStatus = parsed.status.toUpperCase();
        }
      } catch {
        /* not ticket JSON */
      }
    }
    if (!displayStatus || !VISITOR_STATUS_OPTIONS.some((o) => o.value === displayStatus)) {
      displayStatus = 'PENDING';
    }
    return { siteName, siteCoordinator, slaHours, displayCompany, displayStatus };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Visitor Requests (Smart Home & Programming)</h1>
          {pendingCount > 0 && (
            <span className="px-2.5 py-0.5 text-sm font-medium rounded-full bg-amber-100 text-amber-800">
              {pendingCount} pending
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {notifications.some((n) => !n.read) && (
        <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">New ticket notifications</h3>
          <ul className="space-y-1">
            {notifications.filter((n) => !n.read).map((n) => (
              <li key={n.id} className="text-sm text-amber-900 flex items-center justify-between gap-2">
                <span>{n.message}</span>
                <button
                  type="button"
                  onClick={() => markNotificationRead(n.id)}
                  className="text-xs text-amber-700 hover:text-amber-900 underline"
                >
                  Mark read
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No visitor requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coordinator</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLA (h)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Province</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technique</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => {
                const { siteName, siteCoordinator, slaHours, displayCompany, displayStatus } = parseTicketData(r);
                const isUpdating = updatingId === r.id;
                return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.serviceSlug}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{siteName ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{siteCoordinator ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{slaHours != null ? slaHours : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.buildingType && r.buildingType !== 'n/a' ? r.buildingType : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.province}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.technique}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{displayCompany ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <select
                      value={displayStatus}
                      disabled={isUpdating || displayStatus === 'COMPLETED'}
                      onChange={(e) => updateStatus(r.id, e.target.value)}
                      className="min-w-[120px] px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      title={displayStatus === 'COMPLETED' ? 'Completed requests cannot be changed' : 'Change status'}
                    >
                      {VISITOR_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {isUpdating && (
                      <span className="ml-1 text-xs text-gray-500">Saving…</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/admin/visitor-requests/${r.id}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <EyeIcon className="w-4 h-4" />
                      View
                    </Link>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
