'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon, FunnelIcon, XMarkIcon, BoltIcon } from '@heroicons/react/24/outline';
import { CLEAN_ENERGY_IP_LABELS, isCleanEnergyIpKey } from '@/lib/clean-energy-request';

type VisitorRequest = {
  id: string;
  phone: string;
  province: string;
  technique: string;
  name: string | null;
  company: string | null;
  email: string | null;
  serviceSlug: string;
  status?: string;
  createdAt: string;
  currentAmps?: number | null;
  kwh?: number | null;
};

type CleanEnergyMeta = {
  _cleanEnergy?: boolean;
  estimatedPrice?: number | null;
  ipRatings?: string[];
  designSnapshot?: { solarPanels615W?: number } | null;
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ON_SITE', label: 'On site' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function CleanEnergyRequestsAdminPage() {
  const [list, setList] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<{ id: string; message: string; read: boolean }[]>([]);
  const [showFilters, setShowFilters] = useState(true);

  const [filterDate, setFilterDate] = useState('');
  const [filterId, setFilterId] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const parseMeta = (company: string | null): CleanEnergyMeta => {
    if (!company) return {};
    try {
      const parsed = JSON.parse(company) as CleanEnergyMeta;
      return parsed && parsed._cleanEnergy ? parsed : {};
    } catch {
      return {};
    }
  };

  const loadPendingCount = async () => {
    try {
      const res = await fetch('/api/notifications/count?type=pending_clean_energy_tickets');
      const data = await res.json();
      if (data.success && typeof data.count === 'number') setPendingCount(data.count);
    } catch {
      /* ignore */
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?for=admin');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        const ce = data.notifications
          .filter((n: { message?: string }) => (n.message || '').toLowerCase().includes('clean energy'))
          .slice(0, 10);
        setNotifications(ce);
      }
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
      const res = await fetch('/api/visitor-requests?onlySlugs=clean-energy');
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) setList(data.requests);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  const filteredList = useMemo(() => {
    return list.filter((r) => {
      if (filterDate && !formatDate(r.createdAt).toLowerCase().includes(filterDate.toLowerCase())) return false;
      if (filterId && !r.id.toLowerCase().includes(filterId.toLowerCase())) return false;
      if (filterEmail && !(r.email || '').toLowerCase().includes(filterEmail.toLowerCase())) return false;
      if (filterPhone && !r.phone.replace(/\s/g, '').includes(filterPhone.replace(/\s/g, ''))) return false;
      if (filterStatus && (r.status || 'PENDING').toUpperCase() !== filterStatus) return false;
      return true;
    });
  }, [list, filterDate, filterId, filterEmail, filterPhone, filterStatus]);

  const clearFilters = () => {
    setFilterDate('');
    setFilterId('');
    setFilterEmail('');
    setFilterPhone('');
    setFilterStatus('');
  };

  const hasActiveFilters = filterDate || filterId || filterEmail || filterPhone || filterStatus;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/40">
      <div className="p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 shadow-lg shadow-amber-500/25">
              <BoltIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Clean Energy Inbox</h1>
              <p className="text-sm text-gray-500">View and manage clean energy requests</p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 shadow-sm disabled:opacity-60"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total requests</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{list.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-amber-800">Pending</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">{pendingCount}</p>
          </div>
        </div>

        {notifications.some((n) => !n.read) && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50/80 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">New clean energy notifications</h3>
            <ul className="space-y-1">
              {notifications.filter((n) => !n.read).map((n) => (
                <li key={n.id} className="text-sm text-amber-900 flex items-center justify-between gap-2">
                  <span>{n.message}</span>
                  <button type="button" onClick={() => markNotificationRead(n.id)} className="text-xs underline">
                    Mark read
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
          >
            <span className="flex items-center gap-2 font-semibold text-gray-800">
              <FunnelIcon className="w-5 h-5 text-amber-600" />
              Filters (Date / ID / Email / Phone / Status)
            </span>
            <span className="text-gray-400 text-sm">{showFilters ? 'Hide' : 'Show'}</span>
          </button>
          {showFilters && (
            <div className="border-t border-gray-100 p-5 bg-gray-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <input type="text" placeholder="Date text" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white" />
                <input type="text" placeholder="Request ID" value={filterId} onChange={(e) => setFilterId(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white" />
                <input type="text" placeholder="Email" value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white" />
                <input type="text" placeholder="Phone" value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white">
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 rounded-lg">
                  <XMarkIcon className="w-4 h-4" />
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading && list.length === 0 ? (
            <div className="py-16 text-center text-gray-500">Loading...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-16 text-center text-gray-500">No clean energy requests match the filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Request ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Current (A)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Battery (kWh)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">IP</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Panels</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Budget ($)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredList.map((r) => {
                    const meta = parseMeta(r.company);
                    const ipText =
                      meta.ipRatings?.length
                        ? meta.ipRatings
                            .filter(isCleanEnergyIpKey)
                            .map((k) => CLEAN_ENERGY_IP_LABELS[k])
                            .join(', ') || meta.ipRatings.join(', ')
                        : '—';
                    const panels =
                      meta.designSnapshot && typeof meta.designSnapshot.solarPanels615W === 'number'
                        ? meta.designSnapshot.solarPanels615W
                        : '—';
                    const displayStatus = (r.status || 'PENDING').toUpperCase();
                    const isUpdating = updatingId === r.id;
                    return (
                      <tr key={r.id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">{r.id.slice(-10)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.email || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.phone}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.currentAmps != null ? r.currentAmps : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.kwh != null ? r.kwh : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-[140px]" title={ipText}>
                          {ipText}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{panels}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{meta.estimatedPrice != null ? `$${Number(meta.estimatedPrice).toLocaleString()}` : '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={displayStatus}
                            disabled={isUpdating || displayStatus === 'COMPLETED'}
                            onChange={(e) => updateStatus(r.id, e.target.value)}
                            className="min-w-[120px] px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="ON_SITE">On site</option>
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Link href={`/admin/visitor-requests/${r.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
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
      </div>
    </div>
  );
}
