'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Loader2,
  RefreshCw,
  Mail,
  Phone,
  FileText,
  ChevronDown,
  ExternalLink,
  Clock,
  CheckCircle,
} from 'lucide-react';

type Application = {
  id: string;
  name: string;
  email: string;
  phone: string;
  coverLetter: string | null;
  resumeUrl: string;
  status: string;
  careerId: string;
  createdAt: string;
  career: { id: string; title: string; slug: string };
};

type Career = { id: string; title: string; slug: string };

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', color: 'amber' },
  { value: 'REVIEWED', label: 'Reviewed', color: 'blue' },
  { value: 'INTERVIEW', label: 'Interview', color: 'purple' },
  { value: 'ACCEPTED', label: 'Accepted', color: 'emerald' },
  { value: 'REJECTED', label: 'Rejected', color: 'red' },
];

export default function AdminApplicationsPage() {
  const [list, setList] = useState<Application[]>([]);
  const [careers, setCareers] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);
  const [careerFilter, setCareerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (careerFilter) params.set('careerId', careerFilter);
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const [appRes, careersRes] = await Promise.all([
        fetch(`/api/admin/applications${qs ? `?${qs}` : ''}`),
        fetch('/api/admin/careers'),
      ]);
      const appData = await appRes.json();
      const careersData = await careersRes.json();
      if (appData.success && appData.applications) setList(appData.applications);
      if (careersData.success && careersData.careers) setCareers(careersData.careers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [careerFilter, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
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

  const pendingCount = list.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/25">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Job Applications</h1>
              <p className="text-sm text-gray-500">Manage career applications</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/careers"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all"
            >
              Manage Careers
              <ExternalLink className="w-4 h-4" />
            </Link>
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">Pending</p>
                <p className="text-3xl font-bold text-amber-900 mt-1">{pendingCount}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total (filtered)</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{list.length}</p>
              </div>
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-800">Accepted</p>
                <p className="text-3xl font-bold text-emerald-900 mt-1">
                  {list.filter((a) => a.status === 'ACCEPTED').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Job</label>
            <select
              value={careerFilter}
              onChange={(e) => setCareerFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All jobs</option>
              {careers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
            <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No applications found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="w-full px-6 py-4 flex items-center justify-between">
                  <Link
                    href={`/admin/applications/${app.id}`}
                    className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left hover:bg-gray-50 -m-4 p-4 rounded-lg transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{app.name}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {app.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {app.career?.title ?? '—'}
                      </span>
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          app.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : app.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : app.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 shrink-0"
                    aria-label="Toggle details"
                  >
                    <ChevronDown
                      className={`w-5 h-5 transition-transform ${
                        expandedId === app.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>

                {expandedId === app.id && (
                  <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Contact
                        </p>
                        <p className="flex items-center gap-2 text-gray-800">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <a href={`tel:${app.phone}`} className="hover:text-blue-600">
                            {app.phone}
                          </a>
                        </p>
                        <p className="flex items-center gap-2 text-gray-800 mt-1">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <a href={`mailto:${app.email}`} className="hover:text-blue-600">
                            {app.email}
                          </a>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Applied
                        </p>
                        <p className="text-gray-800">{formatDate(app.createdAt)}</p>
                        {app.resumeUrl && (
                          <a
                            href={app.resumeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <FileText className="w-4 h-4" />
                            View resume
                          </a>
                        )}
                      </div>
                    </div>
                    {app.coverLetter && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Cover letter
                        </p>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{app.coverLetter}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        Update status
                        {updatingId === app.id && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={updatingId === app.id}
                            onClick={() => updateStatus(app.id, opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                              app.status === opt.value
                                ? opt.value === 'ACCEPTED'
                                  ? 'bg-emerald-600 text-white'
                                  : opt.value === 'REJECTED'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
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
