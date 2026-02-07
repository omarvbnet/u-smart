'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  PlusIcon,
  UserCircleIcon,
  UserGroupIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt?: string;
};

type Employee = {
  id: string;
  fullName: string;
  phone: string;
  jobTitle: string | null;
  department: string;
  grade: string;
  education: string | null;
  specialized: string;
  createdAt: string;
};

type Requester = {
  id: string;
  username: string;
  name: string | null;
  phone: string;
  company: string | null;
  status: string;
  ticketCount?: number;
  createdAt: string;
};

type Tab = 'admin' | 'employees' | 'requesters';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'USER', label: 'User' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'ENGINEER', label: 'Engineer' },
];

const GRADE_OPTIONS = [
  { value: 'TECHNICIAN_C', label: 'Technician C' },
  { value: 'TECHNICIAN_B', label: 'Technician B' },
  { value: 'TECHNICIAN_A', label: 'Technician A' },
  { value: 'ENGINEER', label: 'Engineer' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'TEAM_LEADER', label: 'Team Leader' },
  { value: 'SECTION_HEAD', label: 'Section Head' },
  { value: 'MANAGER', label: 'Manager' },
];

const SPECIALIZED_OPTIONS = [
  { value: 'ELECTRICAL_TECHNICIAN', label: 'Electrical Technician' },
  { value: 'TELECOM_TECHNICIAN', label: 'Telecom Technician' },
  { value: 'FIBER_TECHNICIAN', label: 'Fiber Technician' },
  { value: 'ENGINEER', label: 'Engineer' },
];

const SERVICE_SLUG_OPTIONS = [
  { value: 'enterprise-networking', label: 'Enterprise Networking' },
  { value: 'quality-control-supervision', label: 'Quality Control' },
];

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>('admin');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [services, setServices] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ username?: string; password?: string } | null>(null);

  // Admin user form
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('USER');

  // Employee form
  const [empFullName, setEmpFullName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empGrade, setEmpGrade] = useState('');
  const [empEducation, setEmpEducation] = useState('');
  const [empSpecialized, setEmpSpecialized] = useState('');

  // Requester form
  const [reqUsername, setReqUsername] = useState('');
  const [reqPassword, setReqPassword] = useState('');
  const [reqName, setReqName] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqCompany, setReqCompany] = useState('');
  const [reqServiceSlug, setReqServiceSlug] = useState('enterprise-networking');

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, empRes, reqRes, svcRes] = await Promise.all([
        fetch('/api/admin/users?all=true'),
        fetch('/api/admin/employees'),
        fetch('/api/admin/requesters'),
        fetch('/api/services'),
      ]);
      const usersData = await usersRes.json();
      const empData = await empRes.json();
      const reqData = await reqRes.json();
      const svcData = await svcRes.json();

      if (usersData.success && usersData.users) setAdminUsers(usersData.users);
      if (usersData.isAdmin === false) setIsAdmin(false);
      if (empData.success && empData.employees) setEmployees(empData.employees);
      if (reqData.success && reqData.requesters) setRequesters(reqData.requesters);
      if (svcData.success && svcData.services) setServices(svcData.services);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForms = () => {
    setShowForm(false);
    setFormError('');
    setCreatedCredentials(null);
    setAdminEmail('');
    setAdminPassword('');
    setAdminName('');
    setAdminRole('USER');
    setEmpFullName('');
    setEmpPhone('');
    setEmpJobTitle('');
    setEmpDepartment('');
    setEmpGrade('');
    setEmpEducation('');
    setEmpSpecialized('');
    setReqUsername('');
    setReqPassword('');
    setReqName('');
    setReqPhone('');
    setReqCompany('');
    setReqServiceSlug('enterprise-networking');
  };

  const openAddForm = (t: Tab) => {
    setTab(t);
    setShowForm(true);
    setFormError('');
    setCreatedCredentials(null);
  };

  const handleCreateAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!adminEmail.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
          name: adminName.trim() || null,
          role: adminRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminUsers((prev) => [data.user, ...prev]);
        resetForms();
      } else {
        setFormError(data.message || 'Failed to create user');
      }
    } catch {
      setFormError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!empFullName.trim()) {
      setFormError('Full name is required');
      return;
    }
    if (!empPhone.trim()) {
      setFormError('Phone is required');
      return;
    }
    if (!empDepartment) {
      setFormError('Department is required');
      return;
    }
    if (!empGrade) {
      setFormError('Grade is required');
      return;
    }
    if (!empSpecialized) {
      setFormError('Specialized is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: empFullName.trim(),
          phone: empPhone.trim(),
          jobTitle: empJobTitle.trim() || null,
          department: empDepartment,
          grade: empGrade,
          education: empEducation.trim() || null,
          specialized: empSpecialized,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmployees((prev) => [data.employee, ...prev]);
        resetForms();
      } else {
        setFormError(data.message || 'Failed to create employee');
      }
    } catch {
      setFormError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRequester = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!reqPhone.trim()) {
      setFormError('Phone is required');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {
        phone: reqPhone.trim(),
        name: reqName.trim() || undefined,
        company: reqCompany.trim() || undefined,
        serviceSlug: reqServiceSlug,
      };
      if (reqUsername.trim()) body.username = reqUsername.trim();
      if (reqPassword.trim()) body.password = reqPassword.trim();
      const res = await fetch('/api/admin/requesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setRequesters((prev) => [
          { ...data.requester, ticketCount: 0 },
          ...prev,
        ]);
        setCreatedCredentials(data.credentials || null);
        setReqUsername('');
        setReqPassword('');
        setReqName('');
        setReqPhone('');
        setReqCompany('');
      } else {
        setFormError(data.message || 'Failed to create requester');
      }
    } catch {
      setFormError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const tabs = [
    { id: 'admin' as Tab, label: 'Admin users', icon: UserCircleIcon },
    { id: 'employees' as Tab, label: 'Employees', icon: UserGroupIcon },
    { id: 'requesters' as Tab, label: 'Ticket requesters', icon: IdentificationIcon },
  ];

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p className="font-medium">Admin privileges required</p>
        <p className="text-sm mt-1">Only users with ADMIN role can manage users. Use the Employees and Ticket Requesters pages for read-only access.</p>
        <Link href="/admin/employees" className="mt-4 inline-block text-sm text-amber-700 underline">Go to Employees</Link>
        <Link href="/admin/requesters" className="ml-4 inline-block text-sm text-amber-700 underline">Go to Ticket Requesters</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
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
            onClick={() => openAddForm(tab)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <PlusIcon className="w-5 h-5" />
            Add new
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium ${
              tab === id
                ? 'bg-blue-50 text-blue-700 border border-b-0 border-gray-200 -mb-px'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="mb-8 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              Add new {tab === 'admin' ? 'admin user' : tab === 'employees' ? 'employee' : 'ticket requester'}
            </h2>
          </div>
          <form
            onSubmit={
              tab === 'admin'
                ? handleCreateAdminUser
                : tab === 'employees'
                  ? handleCreateEmployee
                  : handleCreateRequester
            }
            className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {formError && (
              <p className="md:col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{formError}</p>
            )}
            {createdCredentials && tab === 'requesters' && (
              <div className="md:col-span-2 rounded bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
                <p className="font-medium">Requester created. Save these credentials:</p>
                <p className="mt-1 font-mono">Username: {createdCredentials.username}</p>
                <p className="font-mono">Password: {createdCredentials.password}</p>
              </div>
            )}

            {tab === 'admin' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password * (min 6 chars)</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Display name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    value={adminRole}
                    onChange={(e) => setAdminRole(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {tab === 'employees' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
                  <input
                    type="text"
                    value={empFullName}
                    onChange={(e) => setEmpFullName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Phone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
                  <input
                    type="text"
                    value={empJobTitle}
                    onChange={(e) => setEmpJobTitle(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                  <select
                    value={empDepartment}
                    onChange={(e) => setEmpDepartment(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Select department</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade *</label>
                  <select
                    value={empGrade}
                    onChange={(e) => setEmpGrade(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Select grade</option>
                    {GRADE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialized *</label>
                  <select
                    value={empSpecialized}
                    onChange={(e) => setEmpSpecialized(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Select specialized</option>
                    {SPECIALIZED_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Education</label>
                  <input
                    type="text"
                    value={empEducation}
                    onChange={(e) => setEmpEducation(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="e.g. B.Sc."
                  />
                </div>
              </>
            )}

            {tab === 'requesters' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional, auto-generated if empty)</label>
                  <input
                    type="text"
                    value={reqUsername}
                    onChange={(e) => setReqUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Leave empty to auto-generate"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional, auto-generated if empty)</label>
                  <input
                    type="password"
                    value={reqPassword}
                    onChange={(e) => setReqPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Leave empty to auto-generate"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    value={reqPhone}
                    onChange={(e) => setReqPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Phone"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={reqCompany}
                    onChange={(e) => setReqCompany(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dashboard type</label>
                  <select
                    value={reqServiceSlug}
                    onChange={(e) => setReqServiceSlug(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {SERVICE_SLUG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="md:col-span-2 flex gap-2">
              <button
                type="button"
                onClick={resetForms}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'admin' && (
        loading && adminUsers.length === 0 ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : adminUsers.length === 0 ? (
          <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
            No admin users yet. Click &quot;Add new&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {adminUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.createdAt ? formatDate(u.createdAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'employees' && (
        loading && employees.length === 0 ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
            No employees yet. Click &quot;Add new&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialized</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.fullName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.department}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.grade}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.specialized}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href="/admin/employees"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'requesters' && (
        loading && requesters.length === 0 ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : requesters.length === 0 ? (
          <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
            No ticket requesters yet. Click &quot;Add new&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requesters.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.company ?? '—'}</td>
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
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href="/admin/requesters"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
