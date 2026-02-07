'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';

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

export default function AdminTeamEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [team, setTeam] = useState<Team | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [members, setMembers] = useState<{ employeeId: string; role: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [teamRes, empRes] = await Promise.all([
          fetch(`/api/admin/teams/${id}`),
          fetch('/api/admin/employees'),
        ]);
        const teamData = await teamRes.json();
        const empData = await empRes.json();
        if (teamData.success && teamData.team) {
          setTeam(teamData.team);
          setName(teamData.team.name);
          setLeaderId(teamData.team.leaderId);
          setMembers(
            (teamData.team.members || []).map((m: TeamMember) => ({
              employeeId: m.employeeId,
              role: m.role || 'TECHNICAL',
            }))
          );
        }
        if (empData.success && empData.employees) setEmployees(empData.employees);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const addMember = () => {
    const firstId = employees.find((e) => e.id !== leaderId)?.id ?? employees[0]?.id ?? '';
    setMembers((prev) => [...prev, { employeeId: firstId, role: 'TECHNICAL' }]);
  };

  const removeMember = (index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }
    if (!leaderId) {
      setError('Please select a team leader');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          leaderId,
          members: members.filter((m) => m.employeeId && m.employeeId !== leaderId),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTeam(data.team);
        setError('');
      } else {
        setError(data.message || 'Failed to update');
      }
    } catch (e) {
      setError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !team) {
    return <div className="py-12 text-center text-gray-500">Loading...</div>;
  }
  if (!team) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Team not found.</p>
        <Link href="/admin/teams" className="text-blue-600 hover:text-blue-800 font-medium">
          ← Back to teams
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/teams"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit team: {team.name}</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden max-w-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Team details</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team leader</label>
            <select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} — {emp.jobTitle || emp.department || emp.phone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Members</label>
              <button
                type="button"
                onClick={addMember}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <UserPlusIcon className="w-4 h-4" />
                Add member
              </button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">No extra members. Leader is set above.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <select
                      value={m.employeeId}
                      onChange={(e) =>
                        setMembers((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, employeeId: e.target.value } : x))
                        )
                      }
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id} disabled={emp.id === leaderId}>
                          {emp.fullName} — {emp.jobTitle || emp.department || emp.phone}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        setMembers((prev) =>
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
                      onClick={() => removeMember(i)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Assigned tickets: {team.ticketCount ?? 0}. Unassign from tickets before deleting this team.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Link
              href="/admin/teams"
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
