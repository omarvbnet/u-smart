'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, PencilIcon, TrashIcon, PlusIcon, UserPlusIcon } from '@heroicons/react/24/outline';

type Employee = { id: string; fullName: string; phone: string; jobTitle?: string | null; department?: string };
type TeamMember = { id: string; employeeId: string; role: string; employee: { id: string; fullName: string; phone: string; jobTitle?: string | null } };
type Team = {
  id: string;
  name: string;
  leaderId: string;
  leader: { id: string; fullName: string; phone: string; jobTitle?: string | null; department?: string };
  members: TeamMember[];
  ticketCount?: number;
};

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLeaderId, setCreateLeaderId] = useState('');
  const [createMembers, setCreateMembers] = useState<{ employeeId: string; role: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
        const [teamsRes, empRes] = await Promise.all([
          fetch('/api/admin/teams'),
          fetch('/api/admin/employees'),
        ]);
        const teamsData = await teamsRes.json();
        const empData = await empRes.json();
        if (teamsData.success && teamsData.teams) setTeams(teamsData.teams);
        if (empData.success && empData.employees) setEmployees(empData.employees);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addMemberRow = () => {
    const firstId = employees[0]?.id ?? '';
    setCreateMembers((prev) => [...prev, { employeeId: firstId, role: 'TECHNICAL' }]);
  };

  const removeMemberRow = (index: number) => {
    setCreateMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!createName.trim()) {
      setError('Team name is required');
      return;
    }
    if (!createLeaderId) {
      setError('Please select a team leader');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          leaderId: createLeaderId,
          members: createMembers.filter((m) => m.employeeId && m.employeeId !== createLeaderId),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setCreateName('');
        setCreateLeaderId('');
        setCreateMembers([]);
        load();
      } else {
        setError(data.message || 'Failed to create team');
      }
    } catch (e) {
      setError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this team? Members will be unassigned.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setTeams((prev) => prev.filter((t) => t.id !== id));
      } else {
        alert(data.message || 'Could not delete');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <PlusIcon className="w-5 h-5" />
            New team
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create team</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g. Technical Team A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team leader</label>
                <select
                  value={createLeaderId}
                  onChange={(e) => setCreateLeaderId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Select leader (employee)</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} — {e.jobTitle || e.department || e.phone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Members</label>
                  <button
                    type="button"
                    onClick={addMemberRow}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <UserPlusIcon className="w-4 h-4" />
                    Add member
                  </button>
                </div>
                    {createMembers.length === 0 ? (
                  <p className="text-sm text-gray-500">No members added. Leader is set above. Add employees first.</p>
                ) : (
                  <ul className="space-y-2">
                    {createMembers.map((m, i) => (
                      <li key={i} className="flex gap-2 items-center">
                        <select
                          value={m.employeeId}
                          onChange={(e) =>
                            setCreateMembers((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, employeeId: e.target.value } : x))
                            )
                          }
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                        >
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id} disabled={emp.id === createLeaderId}>
                              {emp.fullName} — {emp.jobTitle || emp.department || emp.phone}
                            </option>
                          ))}
                        </select>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            setCreateMembers((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x))
                            )
                          }
                          className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm"
                        >
                          <option value="TECHNICAL">Technical</option>
                          <option value="ENGINEER">Engineer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeMemberRow(i)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading && teams.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : teams.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No teams yet. Create a team to assign to tickets (required before In Progress).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leader</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {t.leader?.fullName || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {t.members?.length ?? 0} ({t.members?.map((m) => m.employee?.fullName).filter(Boolean).join(', ') || '—'})
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.ticketCount ?? 0}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Link
                      href={`/admin/teams/${t.id}`}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <PencilIcon className="w-4 h-4" />
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={(t.ticketCount ?? 0) > 0 || deletingId === t.id}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={(t.ticketCount ?? 0) > 0 ? 'Unassign tickets first' : 'Delete team'}
                    >
                      <TrashIcon className="w-4 h-4" />
                      Delete
                    </button>
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
