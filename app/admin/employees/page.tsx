'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

const GRADE_OPTIONS = [
  { value: 'TECHNICIAN_C', label: 'Technician C' },
  { value: 'TECHNICIAN_B', label: 'Technician B' },
  { value: 'TECHNICIAN_A', label: 'Technician A' },
  { value: 'ENGINEER', label: 'Engineer' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'TEAM_LEADER', label: 'Team Leader' },
  { value: 'SECTION_HEAD', label: 'Section Head' },
  { value: 'MANAGER', label: 'Manager' },
] as const;

const JOB_TITLE_OPTIONS = [
  { value: 'QUALITY_ASSURANCE', label: 'Quality Assurance' },
  { value: 'QC_ENGINEER', label: 'QC Engineer' },
  { value: 'ELECTRICAL_ENGINEER', label: 'Electrical Engineer' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'TECHNICIAN_A', label: 'Technician A' },
  { value: 'TECHNICIAN_B', label: 'Technician B' },
  { value: 'TECHNICIAN_C', label: 'Technician C' },
  { value: 'SECTION_HEAD', label: 'Section Head' },
  { value: 'MANAGER', label: 'Manager' },
] as const;

const SPECIALIZED_OPTIONS = [
  { value: 'ELECTRICAL_TECHNICIAN', label: 'Electrical Technician' },
  { value: 'TELECOM_TECHNICIAN', label: 'Telecom Technician' },
  { value: 'FIBER_TECHNICIAN', label: 'Fiber Technician' },
  { value: 'ENGINEER', label: 'Engineer' },
] as const;

type Service = { id: string; title: string; slug: string };
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

function gradeLabel(value: string) {
  return GRADE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
function jobTitleLabel(value: string | null) {
  if (!value) return '—';
  return JOB_TITLE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
function specializedLabel(value: string) {
  return SPECIALIZED_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [grade, setGrade] = useState('');
  const [education, setEducation] = useState('');
  const [specialized, setSpecialized] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, svcRes] = await Promise.all([
        fetch('/api/admin/employees'),
        fetch('/api/services'),
      ]);
      const empData = await empRes.json();
      const svcData = await svcRes.json();
      if (empData.success && empData.employees) setEmployees(empData.employees);
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

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setJobTitle('');
    setDepartment('');
    setGrade('');
    setEducation('');
    setSpecialized('');
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (emp: Employee) => {
    setFullName(emp.fullName);
    setPhone(emp.phone);
    setJobTitle(emp.jobTitle ?? '');
    setDepartment(emp.department);
    setGrade(emp.grade);
    setEducation(emp.education ?? '');
    setSpecialized(emp.specialized);
    setEditingId(emp.id);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone is required');
      return;
    }
    if (!department.trim()) {
      setError('Department is required');
      return;
    }
    if (!grade) {
      setError('Please select a grade');
      return;
    }
    if (!specialized) {
      setError('Please select specialized');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/admin/employees/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: phone.trim(),
            jobTitle: jobTitle.trim() || null,
            department: department.trim(),
            grade,
            education: education.trim() || null,
            specialized,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setEmployees((prev) => prev.map((emp) => (emp.id === editingId ? data.employee : emp)));
          resetForm();
        } else {
          setError(data.message || 'Update failed');
        }
      } else {
        const res = await fetch('/api/admin/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: phone.trim(),
            jobTitle: jobTitle.trim() || null,
            department: department.trim(),
            grade,
            education: education.trim() || null,
            specialized,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setEmployees((prev) => [data.employee, ...prev]);
          resetForm();
        } else {
          setError(data.message || 'Create failed');
        }
      }
    } catch (e) {
      setError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setEmployees((prev) => prev.filter((e) => e.id !== id));
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
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
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
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <PlusIcon className="w-5 h-5" />
            Add new employee
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-8 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit employee' : 'Add new employee'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {error && (
              <p className="md:col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Phone number(s)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
              <select
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">Select job title</option>
                {JOB_TITLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="">Select department (service)</option>
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
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
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
                value={specialized}
                onChange={(e) => setSpecialized(e.target.value)}
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
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g. B.Sc. Electrical Engineering"
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Saving…' : editingId ? 'Update' : 'Add employee'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && employees.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No employees yet. Click &quot;Add new employee&quot; to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialized</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Education</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.fullName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{jobTitleLabel(emp.jobTitle)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.department}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{gradeLabel(emp.grade)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{specializedLabel(emp.specialized)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.education ?? '—'}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(emp)}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <PencilIcon className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp.id)}
                      disabled={deletingId === emp.id}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
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
