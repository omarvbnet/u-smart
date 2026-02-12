'use client';

import { useState, useEffect } from 'react';
import {
  GraduationCap,
  Loader2,
  RefreshCw,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  Building2,
  FileText,
  DollarSign,
  ChevronDown,
} from 'lucide-react';

type TrainingRequest = {
  id: string;
  serviceSlug: string;
  serviceTitle: string;
  serviceDesc: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  company: string | null;
  message: string | null;
  budget: string | null;
  status: string;
  createdAt: string;
};

export default function AdminTrainingRequestsPage() {
  const [list, setList] = useState<TrainingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/training-requests${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setList(data.requests);
        setPendingCount(data.pendingCount ?? 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/training-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        if (status !== 'PENDING') setPendingCount((c) => Math.max(0, c - 1));
        setExpandedId(null);
      } else if (res.status === 401) {
        window.alert('Session expired. Please log in again.');
      } else {
        window.alert(data.message || 'Failed to update status');
      }
    } catch (e) {
      console.error(e);
      window.alert('Failed to update status. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const approvedCount = list.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = list.filter((r) => r.status === 'REJECTED').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/25">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Training Requests</h1>
              <p className="text-sm text-gray-500">Manage training enrollment requests</p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm disabled:opacity-60 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/30 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">Pending (Budget)</p>
                <p className="text-3xl font-bold text-amber-900 mt-1">{pendingCount}</p>
                <p className="text-xs text-amber-700 mt-0.5">Awaiting review</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-100">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{list.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">In current view</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100">
                <FileText className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-200/30 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-800">Approved</p>
                <p className="text-3xl font-bold text-emerald-900 mt-1">{approvedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-100">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-6 shadow-sm">
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-rose-800">Rejected</p>
                <p className="text-3xl font-bold text-rose-900 mt-1">{rejectedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-100">
                <XCircle className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading && list.length === 0 ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center shadow-sm">
            <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No training requests found</p>
            <p className="text-sm text-gray-400 mt-1">
              {statusFilter ? 'Try changing the filter.' : 'Requests will appear here when submitted.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className="p-6 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{r.serviceTitle}</h3>
                        <span className="text-xs font-mono text-gray-500">#{r.id.slice(-8)}</span>
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                            r.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{r.requesterName}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {r.requesterEmail}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {r.requesterPhone}
                        </span>
                        {r.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {r.company}
                          </span>
                        )}
                      </div>
                      {r.budget && (
                        <p className="mt-2 text-sm text-amber-700 flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          Budget: {r.budget}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="px-6 pb-6 pt-0 border-t border-gray-100">
                    {r.serviceDesc && (
                      <p className="text-sm text-gray-600 mb-4 mt-4">{r.serviceDesc}</p>
                    )}
                    {r.message && (
                      <p className="text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded-xl">{r.message}</p>
                    )}
                    {r.status === 'PENDING' && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => updateStatus(r.id, 'APPROVED')}
                          disabled={updatingId === r.id}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-60"
                        >
                          {updatingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(r.id, 'REJECTED')}
                          disabled={updatingId === r.id}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-medium disabled:opacity-60"
                        >
                          {updatingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
