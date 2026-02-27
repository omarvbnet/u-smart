'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowPathIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  PlayIcon,
  PauseCircleIcon,
  NoSymbolIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const IRAQ_PROVINCES = [
  'Baghdad', 'Basra', 'Nineveh', 'Erbil', 'Sulaymaniyah', 'Duhok',
  'Kirkuk', 'Diyala', 'Anbar', 'Babylon', 'Karbala', 'Najaf',
  'Wasit', 'Maysan', 'Dhi Qar', 'Muthanna', 'Qadisiyyah', 'Saladin',
];

type Engineer = {
  id: string;
  username: string;
  name: string | null;
  phone: string;
  province: string | null;
  provinceFilterActive: boolean;
  status: string;
  createdAt: string;
  activeTickets: number;
  completedTickets: number;
  totalAssigned: number;
};

type Credentials = { username: string; password: string } | null;

export default function AdminEngineersPage() {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editProvince, setEditProvince] = useState('');
  const [saving, setSaving] = useState(false);

  // Credentials modal
  const [credentials, setCredentials] = useState<Credentials>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/engineers');
      const data = await res.json();
      if (data.success && data.engineers) setEngineers(data.engineers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createEngineer = async () => {
    setFormError('');
    if (!formUsername.trim() || !formPassword.trim() || !formPhone.trim()) {
      setFormError('Username, password, and phone are required');
      return;
    }
    if (formPassword.trim().length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/engineers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          password: formPassword.trim(),
          name: formName.trim() || null,
          phone: formPhone.trim(),
          province: formProvince || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEngineers((prev) => [data.engineer, ...prev]);
        setCredentials(data.credentials);
        setShowForm(false);
        setFormName('');
        setFormUsername('');
        setFormPassword('');
        setFormPhone('');
        setFormProvince('');
      } else {
        setFormError(data.message || 'Failed to create engineer');
      }
    } catch {
      setFormError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/engineers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const startEdit = (e: Engineer) => {
    setEditingId(e.id);
    setEditName(e.name ?? '');
    setEditPhone(e.phone);
    setEditPassword('');
    setEditProvince(e.province ?? '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editName.trim()) body.name = editName.trim();
      if (editPhone.trim()) body.phone = editPhone.trim();
      if (editPassword.trim().length >= 6) body.password = editPassword.trim();
      body.province = editProvince || null;

      const res = await fetch(`/api/admin/engineers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setEngineers((prev) =>
          prev.map((e) =>
            e.id === editingId
              ? { ...e, name: data.engineer.name, phone: data.engineer.phone, province: data.engineer.province, provinceFilterActive: data.engineer.provinceFilterActive }
              : e
          )
        );
        setEditingId(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleProvinceFilter = async (id: string, current: boolean) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/engineers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinceFilterActive: !current }),
      });
      const data = await res.json();
      if (data.success) {
        setEngineers((prev) =>
          prev.map((e) => (e.id === id ? { ...e, provinceFilterActive: !current } : e))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteEngineer = async (id: string, username: string) => {
    if (!confirm(`Delete engineer "${username}"? This cannot be undone.`)) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/engineers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setEngineers((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const copyCredentials = () => {
    if (!credentials) return;
    navigator.clipboard.writeText(`Username: ${credentials.username}\nPassword: ${credentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(); } catch { return s; }
  };

  const totals = {
    total: engineers.length,
    active: engineers.filter((e) => e.status === 'ACTIVE').length,
    suspended: engineers.filter((e) => e.status === 'SUSPENDED').length,
    blocked: engineers.filter((e) => e.status === 'BLOCKED').length,
    withActiveTickets: engineers.filter((e) => e.activeTickets > 0).length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provisor Engineers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage QC engineers for the Provisor mobile app</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50 text-sm"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-sm font-medium"
          >
            <PlusIcon className="w-4 h-4" />
            New Engineer
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={totals.total} color="bg-gray-100 text-gray-800" />
        <StatCard label="Active" value={totals.active} color="bg-emerald-50 text-emerald-700" />
        <StatCard label="Busy" value={totals.withActiveTickets} color="bg-blue-50 text-blue-700" />
        <StatCard label="Suspended" value={totals.suspended} color="bg-amber-50 text-amber-700" />
        <StatCard label="Blocked" value={totals.blocked} color="bg-red-50 text-red-700" />
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Create New Engineer</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Ahmed Al-Rashid"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input
                type="text"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="e.g. engineer_ahmed"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="text"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g. +964 xxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <select
                value={formProvince}
                onChange={(e) => setFormProvince(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Provinces (no filter)</option>
                {IRAQ_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">If set, engineer only sees tickets from this province</p>
            </div>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={createEngineer}
              disabled={creating}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            >
              {creating ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
              Create Engineer
            </button>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <PlayIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Engineer Created!</h3>
                <p className="text-sm text-gray-500">Save these credentials securely</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase">Username</span>
                <p className="text-sm font-mono font-semibold text-gray-900">{credentials.username}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase">Password</span>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-semibold text-gray-900">
                    {showPassword ? credentials.password : '••••••••'}
                  </p>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={copyCredentials}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 text-sm font-medium"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => { setCredentials(null); setShowPassword(false); }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && engineers.length === 0 ? (
        <div className="py-16 text-center text-gray-500">Loading engineers...</div>
      ) : engineers.length === 0 ? (
        <div className="py-16 text-center text-gray-500 rounded-xl border border-gray-200 bg-gray-50">
          <p className="text-lg font-medium">No engineers yet</p>
          <p className="text-sm mt-1">Create your first Provisor engineer to get started</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Engineer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Province</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Active</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Completed</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {engineers.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  {/* Engineer info */}
                  <td className="px-4 py-3">
                    {editingId === e.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(ev) => setEditName(ev.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="Name"
                      />
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{e.name ?? e.username}</p>
                        <p className="text-xs text-gray-500">@{e.username}</p>
                      </div>
                    )}
                  </td>
                  {/* Phone */}
                  <td className="px-4 py-3">
                    {editingId === e.id ? (
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(ev) => setEditPhone(ev.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="Phone"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">{e.phone}</span>
                    )}
                  </td>
                  {/* Province */}
                  <td className="px-4 py-3">
                    {editingId === e.id ? (
                      <select
                        value={editProvince}
                        onChange={(ev) => setEditProvince(ev.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">All</option>
                        {IRAQ_PROVINCES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-600">{e.province ?? 'All'}</span>
                        {e.province && (
                          <button
                            type="button"
                            onClick={() => toggleProvinceFilter(e.id, e.provinceFilterActive)}
                            disabled={updatingId === e.id}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                              e.provinceFilterActive
                                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={e.provinceFilterActive ? 'Province filter ON — click to show all provinces' : 'Province filter OFF — click to restrict to province'}
                          >
                            {e.provinceFilterActive ? 'ON' : 'OFF'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        e.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : e.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        e.status === 'ACTIVE' ? 'bg-emerald-500' : e.status === 'SUSPENDED' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      {e.status}
                    </span>
                  </td>
                  {/* Active tickets */}
                  <td className="px-4 py-3 text-center">
                    {e.activeTickets > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {e.activeTickets}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">0</span>
                    )}
                  </td>
                  {/* Completed tickets */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-600">{e.completedTickets}</span>
                  </td>
                  {/* Total tickets */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium text-gray-900">{e.totalAssigned}</span>
                  </td>
                  {/* Joined */}
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(e.createdAt)}</td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    {editingId === e.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editPassword}
                          onChange={(ev) => setEditPassword(ev.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500"
                          placeholder="New password"
                        />
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving}
                          className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium disabled:opacity-50"
                        >
                          {saving ? '...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => startEdit(e)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-medium"
                        >
                          <PencilSquareIcon className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {e.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => setStatus(e.id, 'ACTIVE')}
                            disabled={updatingId === e.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
                          >
                            <PlayIcon className="w-3.5 h-3.5" />
                            Activate
                          </button>
                        )}
                        {e.status !== 'SUSPENDED' && (
                          <button
                            type="button"
                            onClick={() => setStatus(e.id, 'SUSPENDED')}
                            disabled={updatingId === e.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium disabled:opacity-50"
                          >
                            <PauseCircleIcon className="w-3.5 h-3.5" />
                            Suspend
                          </button>
                        )}
                        {e.status !== 'BLOCKED' && (
                          <button
                            type="button"
                            onClick={() => setStatus(e.id, 'BLOCKED')}
                            disabled={updatingId === e.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium disabled:opacity-50"
                          >
                            <NoSymbolIcon className="w-3.5 h-3.5" />
                            Block
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteEngineer(e.id, e.username)}
                          disabled={updatingId === e.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium disabled:opacity-50"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75 mt-0.5">{label}</p>
    </div>
  );
}
