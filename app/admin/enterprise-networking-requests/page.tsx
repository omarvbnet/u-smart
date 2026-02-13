'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  EyeIcon,
  FunnelIcon,
  XMarkIcon,
  WifiIcon,
  ClockIcon,
  CheckCircleIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';

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

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ON_SITE', label: 'On site' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
];

const SLA_OPTIONS = [
  { value: '', label: 'All SLA' },
  { value: '24', label: '24h' },
  { value: '48', label: '48h' },
  { value: '72', label: '72h' },
];

export default function EnterpriseNetworkingRequestsAdminPage() {
  const [list, setList] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; read: boolean }[]>([]);
  const [showFilters, setShowFilters] = useState(true);

  // Column filters
  const [filterDate, setFilterDate] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterCoordinator, setFilterCoordinator] = useState('');
  const [filterSla, setFilterSla] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterTechnique, setFilterTechnique] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');

  const loadPendingCount = async () => {
    try {
      const res = await fetch('/api/notifications/count?type=pending_tickets');
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
        credentials: 'include',
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
      const res = await fetch('/api/visitor-requests?onlySlugs=enterprise-networking');
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

  const parseTicketData = (r: VisitorRequest) => {
    let siteName = r.siteName ?? null;
    let siteCoordinator = r.siteCoordinator ?? null;
    let slaHours = r.slaHours ?? null;
    let displayCompany = r.company ?? null;
    let displayStatus = (r.status ?? '').toUpperCase() || 'PENDING';
    if (typeof r.company === 'string') {
      try {
        const parsed = JSON.parse(r.company);
        if (parsed._ticket) {
          siteName = parsed.siteName ?? siteName;
          siteCoordinator = parsed.siteCoordinator ?? siteCoordinator;
          slaHours = parsed.slaHours ?? slaHours;
          displayCompany = parsed.company ?? displayCompany;
          if (typeof parsed.status === 'string') displayStatus = parsed.status.toUpperCase();
        }
      } catch {
        /* not ticket JSON */
      }
    }
    if (!STATUS_OPTIONS.some((o) => o.value && o.value === displayStatus)) displayStatus = 'PENDING';
    return { siteName, siteCoordinator, slaHours, displayCompany, displayStatus };
  };

  const filteredList = useMemo(() => {
    return list.filter((r) => {
      const { siteName, siteCoordinator, slaHours, displayCompany, displayStatus } = parseTicketData(r);
      const dateStr = formatDate(r.createdAt);
      if (filterDate && !dateStr.toLowerCase().includes(filterDate.toLowerCase())) return false;
      if (filterSite && !(siteName ?? '').toLowerCase().includes(filterSite.toLowerCase())) return false;
      if (filterCoordinator && !(siteCoordinator ?? '').toLowerCase().includes(filterCoordinator.toLowerCase())) return false;
      if (filterSla && String(slaHours ?? '') !== filterSla) return false;
      if (filterProvince && !(r.province ?? '').toLowerCase().includes(filterProvince.toLowerCase())) return false;
      if (filterTechnique && !(r.technique ?? '').toLowerCase().includes(filterTechnique.toLowerCase())) return false;
      if (filterName && !(r.name ?? '').toLowerCase().includes(filterName.toLowerCase())) return false;
      if (filterCompany && !(displayCompany ?? '').toLowerCase().includes(filterCompany.toLowerCase())) return false;
      if (filterStatus && displayStatus !== filterStatus) return false;
      if (filterPhone && !(r.phone ?? '').replace(/\s/g, '').includes(filterPhone.replace(/\s/g, ''))) return false;
      const building = r.buildingType && r.buildingType !== 'n/a' ? r.buildingType : '';
      if (filterBuilding && !building.toLowerCase().includes(filterBuilding.toLowerCase())) return false;
      return true;
    });
  }, [
    list,
    filterDate,
    filterSite,
    filterCoordinator,
    filterSla,
    filterProvince,
    filterTechnique,
    filterName,
    filterCompany,
    filterStatus,
    filterPhone,
    filterBuilding,
  ]);

  const clearFilters = () => {
    setFilterDate('');
    setFilterSite('');
    setFilterCoordinator('');
    setFilterSla('');
    setFilterProvince('');
    setFilterTechnique('');
    setFilterName('');
    setFilterCompany('');
    setFilterStatus('');
    setFilterPhone('');
    setFilterBuilding('');
  };

  const hasActiveFilters =
    filterDate ||
    filterSite ||
    filterCoordinator ||
    filterSla ||
    filterProvince ||
    filterTechnique ||
    filterName ||
    filterCompany ||
    filterStatus ||
    filterPhone ||
    filterBuilding;

  const completedCount = list.filter((r) => {
    const { displayStatus } = parseTicketData(r);
    return displayStatus === 'COMPLETED';
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30">
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/25">
              <WifiIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Enterprise Networking Requests</h1>
              <p className="text-sm text-gray-500">Filter and manage fiber & network tickets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-cyan-200 shadow-sm disabled:opacity-60 transition-all font-medium"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{list.length}</p>
              </div>
              <ListBulletIcon className="w-8 h-8 text-slate-300" />
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">Pending</p>
                <p className="text-2xl font-bold text-amber-900 mt-0.5">{pendingCount}</p>
              </div>
              <ClockIcon className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-800">Completed</p>
                <p className="text-2xl font-bold text-emerald-900 mt-0.5">{completedCount}</p>
              </div>
              <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Notifications */}
        {notifications.some((n) => !n.read) && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50/80 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">New ticket notifications</h3>
            <ul className="space-y-1">
              {notifications.filter((n) => !n.read).map((n) => (
                <li key={n.id} className="text-sm text-amber-900 flex items-center justify-between gap-2">
                  <span>{n.message}</span>
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                  >
                    Mark read
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filters card */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2 font-semibold text-gray-800">
              <FunnelIcon className="w-5 h-5 text-cyan-600" />
              Column filters
              {hasActiveFilters && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cyan-100 text-cyan-800">
                  Active
                </span>
              )}
            </span>
            <span className="text-gray-400 text-sm">{showFilters ? 'Hide' : 'Show'}</span>
          </button>
          {showFilters && (
            <div className="border-t border-gray-100 p-5 bg-gray-50/50">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input
                    type="text"
                    placeholder="e.g. 2025"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
                  <input
                    type="text"
                    placeholder="Filter site"
                    value={filterSite}
                    onChange={(e) => setFilterSite(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Coordinator</label>
                  <input
                    type="text"
                    placeholder="Filter coordinator"
                    value={filterCoordinator}
                    onChange={(e) => setFilterCoordinator(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">SLA (h)</label>
                  <select
                    value={filterSla}
                    onChange={(e) => setFilterSla(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  >
                    {SLA_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
                  <input
                    type="text"
                    placeholder="Filter province"
                    value={filterProvince}
                    onChange={(e) => setFilterProvince(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Technique</label>
                  <input
                    type="text"
                    placeholder="e.g. fiber, maintenance"
                    value={filterTechnique}
                    onChange={(e) => setFilterTechnique(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                  <input
                    type="text"
                    placeholder="Filter name"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Filter company"
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="Filter phone"
                    value={filterPhone}
                    onChange={(e) => setFilterPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Building</label>
                  <input
                    type="text"
                    placeholder="e.g. villa, hotel"
                    value={filterBuilding}
                    onChange={(e) => setFilterBuilding(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading && list.length === 0 ? (
            <div className="py-16 text-center text-gray-500">Loading...</div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center">
              <WifiIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No enterprise networking requests yet.</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredList.length}</span> of {list.length} requests
                {hasActiveFilters && ' (filtered)'}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Site</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Coordinator</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SLA (h)</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Building</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Province</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Technique</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredList.map((r) => {
                      const { siteName, siteCoordinator, slaHours, displayCompany, displayStatus } = parseTicketData(r);
                      const isUpdating = updatingId === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-cyan-50/30 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{r.serviceSlug}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{siteName ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{siteCoordinator ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{slaHours != null ? slaHours : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{r.buildingType && r.buildingType !== 'n/a' ? r.buildingType : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{r.phone}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{r.province}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className="text-xs font-medium text-gray-700">{r.technique || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{r.name ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{displayCompany ?? '—'}</td>
                          <td className="px-4 py-3 text-sm">
                            <select
                              value={displayStatus}
                              disabled={isUpdating || displayStatus === 'COMPLETED'}
                              onChange={(e) => updateStatus(r.id, e.target.value)}
                              className="min-w-[110px] px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="PENDING">Pending</option>
                              <option value="ON_SITE">On site</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="COMPLETED">Completed</option>
                            </select>
                            {isUpdating && <span className="ml-1 text-xs text-gray-400">Saving…</span>}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Link
                              href={`/admin/visitor-requests/${r.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 font-medium transition-colors"
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
              {filteredList.length === 0 && hasActiveFilters && (
                <div className="py-8 text-center text-gray-500 text-sm">
                  No requests match the current filters. Try clearing some filters.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
