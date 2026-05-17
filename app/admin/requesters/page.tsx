'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, DocumentTextIcon, NoSymbolIcon, PlayIcon, PauseCircleIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

type Requester = {
  id: string;
  username: string;
  name: string | null;
  phone: string;
  phonePushToken: string | null;
  phonePlatform: string | null;
  company: string | null;
  companyCertificationUrl: string | null;
  status: string;
  role: string;
  createdAt: string;
  ticketCount: number;
};

export default function AdminRequestersPage() {
  const [list, setList] = useState<Requester[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<string>('COMPANY');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addCredentials, setAddCredentials] = useState<{ username: string; password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/requesters');
      const data = await res.json();
      if (data.success && data.requesters) setList(data.requesters);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setRole = async (id: string, role: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/requesters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, role: data.requester?.role ?? role } : r)));
      } else {
        alert(data.message || 'Failed to update role');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/requesters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const createRequester = async () => {
    setAddError('');
    if (!addUsername.trim() || !addPassword.trim() || !addPhone.trim()) {
      setAddError('Username, password, and phone are required');
      return;
    }
    if (addPassword.trim().length < 6) {
      setAddError('Password must be at least 6 characters');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/requesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addUsername.trim(),
          password: addPassword.trim(),
          name: addName.trim() || null,
          phone: addPhone.trim(),
          email: addEmail.trim() || null,
          role: addRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.requester;
        setList((prev) => [{ id: r.id, username: r.username, name: r.name, phone: r.phone, phonePushToken: r.phonePushToken ?? null, phonePlatform: r.phonePlatform ?? null, company: r.company ?? null, companyCertificationUrl: null, status: r.status ?? 'ACTIVE', role: r.role ?? 'COMPANY', createdAt: r.createdAt, ticketCount: 0 }, ...prev]);
        setAddCredentials(data.credentials);
        setShowAddForm(false);
        setAddName('');
        setAddUsername('');
        setAddPassword('');
        setAddPhone('');
        setAddEmail('');
        setAddRole('COMPANY');
      } else {
        setAddError(data.message || 'Failed to create requester');
      }
    } catch {
      setAddError('Network error');
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ticket requesters (users)</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowAddForm(true); setAddCredentials(null); setAddError(''); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
          >
            <PlusIcon className="w-5 h-5" />
            Add requester
          </button>
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
      </div>

      {addCredentials && (
        <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800 mb-2">Credentials (share with user):</p>
          <p className="text-sm text-emerald-900 font-mono">Username: {addCredentials.username}</p>
          <p className="text-sm text-emerald-900 font-mono">Password: {addCredentials.password}</p>
          <button type="button" onClick={() => setAddCredentials(null)} className="mt-2 text-xs text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 p-6 rounded-lg border border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add requester (Engineer & Technician admin-only)</h2>
          {addError && <p className="text-sm text-red-600 mb-2">{addError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="COMPANY">Company</option>
                <option value="PERSONAL">Personal</option>
                <option value="ENGINEER">Engineer</option>
                <option value="TECHNICIAN">Technician</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input type="text" value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="e.g. eng_abc123" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Min 6 chars" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input type="text" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="+964..." className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Legal name" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="email@example.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={createRequester} disabled={adding} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50">
              {adding ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowAddForm(false); setAddError(''); }} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700">
              <XMarkIcon className="w-4 h-4 inline mr-1" /> Cancel
            </button>
          </div>
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No requesters yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Push token</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certification</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <select
                      value={r.role}
                      disabled={updatingId === r.id}
                      onChange={(e) => setRole(r.id, e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium bg-white min-w-[120px]"
                    >
                      <option value="COMPANY">Company</option>
                      <option value="PERSONAL">Individual</option>
                      <option value="ENGINEER">Engineer</option>
                      <option value="TECHNICIAN">Technician</option>
                      <option value="WORKER">Worker</option>
                      <option value="MANAGER">Manager (workspace)</option>
                      <option value="COORDINATOR">Coordinator (workspace)</option>
                      <option value="WAREHOUSE_KEEPER">Warehouse keeper</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[260px] truncate" title={r.phonePushToken ?? ''}>
                    {r.phonePushToken ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.phonePlatform?.toUpperCase() ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.company ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {r.companyCertificationUrl ? (
                      <a
                        href={r.companyCertificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.ticketCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    {r.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'ACTIVE')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                        Activate
                      </button>
                    )}
                    {r.status !== 'SUSPENDED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'SUSPENDED')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PauseCircleIcon className="w-3.5 h-3.5" />
                        Suspend
                      </button>
                    )}
                    {r.status !== 'BLOCKED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'BLOCKED')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium disabled:opacity-50"
                      >
                        <NoSymbolIcon className="w-3.5 h-3.5" />
                        Block
                      </button>
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
