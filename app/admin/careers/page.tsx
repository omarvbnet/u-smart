'use client';

import { useState, useEffect } from 'react';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
type TranslationsMap = Partial<Record<(typeof LOCALES)[number], { title?: string; description?: string; department?: string; location?: string }>>;

type Career = {
  id: string;
  title: string;
  slug: string;
  description: string;
  department: string;
  location: string;
  jobType: string;
  experience: string;
  salaryRange: string | null;
  requirements: string[];
  benefits: string[];
  featured: boolean;
  remote: boolean;
  status: string;
  translations?: TranslationsMap | null;
};

const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'];
const JOB_STATUSES = ['OPEN', 'CLOSED', 'FILLED'];

type Service = { id: string; title: string; slug: string };

const emptyTranslations = (): TranslationsMap => ({
  ar: { title: '', description: '', department: '', location: '' },
  en: { title: '', description: '', department: '', location: '' },
  ku: { title: '', description: '', department: '', location: '' },
  tr: { title: '', description: '', department: '', location: '' },
});

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  department: '',
  location: '',
  jobType: 'FULL_TIME',
  experience: '',
  salaryRange: '',
  requirements: [] as string[],
  benefits: [] as string[],
  featured: false,
  remote: false,
  translations: emptyTranslations(),
};

export default function CareersAdminPage() {
  const [list, setList] = useState<Career[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [careersRes, servicesRes] = await Promise.all([
        fetch('/api/admin/careers'),
        fetch('/api/services'),
      ]);
      const careersData = await careersRes.json();
      const servicesData = await servicesRes.json();
      if (careersData.success && careersData.careers) setList(careersData.careers);
      if (servicesData.success && servicesData.services) setServices(servicesData.services);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to load careers' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    const defaultDept = services.length > 0 ? services[0].title : '';
    setForm({ ...emptyForm, department: defaultDept, translations: emptyTranslations() });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c: Career) => {
    const t = (c.translations as TranslationsMap | null) || {};
    setForm({
      title: c.title,
      slug: c.slug,
      description: c.description,
      department: c.department,
      location: c.location,
      jobType: c.jobType,
      experience: c.experience,
      salaryRange: c.salaryRange ?? '',
      requirements: c.requirements ?? [],
      benefits: c.benefits ?? [],
      featured: c.featured,
      remote: c.remote,
      translations: {
        ar: { title: t.ar?.title ?? '', description: t.ar?.description ?? '', department: t.ar?.department ?? '', location: t.ar?.location ?? '' },
        en: { title: t.en?.title ?? '', description: t.en?.description ?? '', department: t.en?.department ?? '', location: t.en?.location ?? '' },
        ku: { title: t.ku?.title ?? '', description: t.ku?.description ?? '', department: t.ku?.department ?? '', location: t.ku?.location ?? '' },
        tr: { title: t.tr?.title ?? '', description: t.tr?.description ?? '', department: t.tr?.department ?? '', location: t.tr?.location ?? '' },
      },
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const translationsClean: TranslationsMap = {};
      LOCALES.forEach((loc) => {
        const tr = form.translations?.[loc];
        if (tr && (tr.title?.trim() || tr.description?.trim() || tr.department?.trim() || tr.location?.trim())) {
          translationsClean[loc] = {
            title: tr.title?.trim() || undefined,
            description: tr.description?.trim() || undefined,
            department: tr.department?.trim() || undefined,
            location: tr.location?.trim() || undefined,
          };
        }
      });
      const payload = {
        ...form,
        slug: form.slug || undefined,
        salaryRange: form.salaryRange || null,
        translations: Object.keys(translationsClean).length > 0 ? translationsClean : undefined,
      };
      const url = editingId ? `/api/admin/careers/${editingId}` : '/api/admin/careers';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'ok', text: editingId ? 'Career updated' : 'Career created' });
        closeForm();
        load();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'err', text: data.message || 'Failed to save' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to save' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCareer = async (id: string) => {
    if (!confirm('Delete this career?')) return;
    try {
      const res = await fetch(`/api/admin/careers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        load();
      } else {
        setMessage({ type: 'err', text: data.message || 'Failed to delete' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getJobTypeLabel = (t: string) => t.replace(/_/g, ' ');

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
            <BriefcaseIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Careers</h1>
            <p className="text-sm text-gray-500">Manage job openings</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-60"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
          >
            <PlusIcon className="w-5 h-5" />
            Add Career
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="flex justify-center py-24">
          <ArrowPathIcon className="w-10 h-10 text-amber-500 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <BriefcaseIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No careers yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first job opening</p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
          >
            <PlusIcon className="w-5 h-5" />
            Add Career
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.title}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{c.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.department}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.location}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {getJobTypeLabel(c.jobType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          c.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCareer(c.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg ml-1"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{editingId ? 'Edit Career' : 'Add Career'}</h2>
              <button type="button" onClick={closeForm} className="p-2 text-gray-500 hover:text-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="auto-generated from title"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select department</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                    {form.department && !services.some((s) => s.title === form.department) && (
                      <option value={form.department}>{form.department}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                  <select
                    value={form.jobType}
                    onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {getJobTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary Range</label>
                  <input
                    type="text"
                    value={form.salaryRange}
                    onChange={(e) => setForm((f) => ({ ...f, salaryRange: e.target.value }))}
                    placeholder="e.g. Competitive"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience</label>
                <input
                  type="text"
                  value={form.experience}
                  onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))}
                  placeholder="e.g. 2+ years"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Featured</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.remote}
                    onChange={(e) => setForm((f) => ({ ...f, remote: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Remote</span>
                </label>
              </div>
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Translations (title & description by language)</h3>
                <p className="text-xs text-gray-500 mb-4">Leave blank to use the default title/description above.</p>
                <div className="space-y-4">
                  {LOCALES.map((loc) => (
                    <div key={loc} className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <span className="text-xs font-medium text-gray-600 uppercase">{loc}</span>
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          placeholder={`Title (${loc})`}
                          value={form.translations?.[loc]?.title ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: {
                                ...f.translations,
                                [loc]: { ...f.translations?.[loc], title: e.target.value },
                              },
                            }))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <textarea
                          placeholder={`Description (${loc})`}
                          value={form.translations?.[loc]?.description ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: {
                                ...f.translations,
                                [loc]: { ...f.translations?.[loc], description: e.target.value },
                              },
                            }))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                          rows={2}
                        />
                        <input
                          type="text"
                          placeholder={`Department (${loc})`}
                          value={form.translations?.[loc]?.department ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: {
                                ...f.translations,
                                [loc]: { ...f.translations?.[loc], department: e.target.value },
                              },
                            }))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          placeholder={`Location (${loc})`}
                          value={form.translations?.[loc]?.location ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: {
                                ...f.translations,
                                [loc]: { ...f.translations?.[loc], location: e.target.value },
                              },
                            }))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
