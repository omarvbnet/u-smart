'use client';

import { useState, useEffect } from 'react';
import { projectsApi } from '@/lib/api/projects';
import { servicesApi } from '@/lib/api/services';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
type TranslationsMap = Partial<Record<(typeof LOCALES)[number], { title?: string; description?: string; content?: string }>>;

type Service = { id: string; title: string; slug: string };

type Project = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  featured: boolean;
  status: string;
  year: number;
  client: string | null;
  imageUrl: string | null;
  liveUrl: string | null;
  githubUrl: string | null;
  tags: string[];
  technologies: string[];
  translations?: TranslationsMap | null;
};

const emptyTranslations = (): TranslationsMap => ({
  ar: { title: '', description: '', content: '' },
  en: { title: '', description: '', content: '' },
  ku: { title: '', description: '', content: '' },
  tr: { title: '', description: '', content: '' },
});

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  category: '',
  featured: false,
  status: 'COMPLETED',
  year: new Date().getFullYear(),
  client: '',
  imageUrl: '',
  liveUrl: '',
  githubUrl: '',
  tags: [] as string[],
  technologies: [] as string[],
  translations: emptyTranslations(),
};

export default function ProjectsAdminPage() {
  const [list, setList] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [projectsRes, servicesRes] = await Promise.all([
        projectsApi.list(),
        servicesApi.list(),
      ]);
      if (projectsRes.success && projectsRes.projects) setList(projectsRes.projects);
      if (servicesRes.success && servicesRes.services) {
        setServices(servicesRes.services.map((s: Service) => ({ id: s.id, title: s.title, slug: s.slug })));
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    const defaultCategory = services.length > 0 ? services[0].slug : '';
    setForm({ ...emptyForm, category: defaultCategory, translations: emptyTranslations() });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (p: Project) => {
    const t = (p.translations as TranslationsMap | null) || {};
    setForm({
      title: p.title,
      slug: p.slug,
      description: p.description,
      category: p.category,
      featured: p.featured,
      status: p.status,
      year: p.year,
      client: p.client ?? '',
      imageUrl: p.imageUrl ?? '',
      liveUrl: p.liveUrl ?? '',
      githubUrl: p.githubUrl ?? '',
      tags: p.tags ?? [],
      technologies: p.technologies ?? [],
      translations: {
        ar: { title: t.ar?.title ?? '', description: t.ar?.description ?? '', content: t.ar?.content ?? '' },
        en: { title: t.en?.title ?? '', description: t.en?.description ?? '', content: t.en?.content ?? '' },
        ku: { title: t.ku?.title ?? '', description: t.ku?.description ?? '', content: t.ku?.content ?? '' },
        tr: { title: t.tr?.title ?? '', description: t.tr?.description ?? '', content: t.tr?.content ?? '' },
      },
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const translationsClean: TranslationsMap = {};
      LOCALES.forEach((loc) => {
        const t = form.translations?.[loc];
        if (t && (t.title?.trim() || t.description?.trim() || t.content?.trim())) {
          translationsClean[loc] = {
            title: t.title?.trim() || undefined,
            description: t.description?.trim() || undefined,
            content: t.content?.trim() || undefined,
          };
        }
      });
      const payload = {
        ...form,
        client: form.client || null,
        imageUrl: form.imageUrl || null,
        liveUrl: form.liveUrl || null,
        githubUrl: form.githubUrl || null,
        tags: form.tags,
        technologies: form.technologies,
        translations: Object.keys(translationsClean).length > 0 ? translationsClean : undefined,
      };
      if (editingId) {
        const res = await projectsApi.update(editingId, payload);
        if (res.success) {
          setList((prev) => prev.map((p) => (p.id === editingId ? res.project : p)));
          setMessage({ type: 'ok', text: 'Project updated' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Update failed' });
      } else {
        const res = await projectsApi.create(payload);
        if (res.success && res.project) {
          setList((prev) => [res.project, ...prev]);
          setMessage({ type: 'ok', text: 'Project created' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Create failed' });
      }
    } catch (e) {
      setMessage({ type: 'err', text: 'Request failed' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    const res = await projectsApi.delete(id);
    if (res.success) {
      setList((prev) => prev.filter((p) => p.id !== id));
      setMessage({ type: 'ok', text: 'Project deleted' });
    } else setMessage({ type: 'err', text: res.message || 'Delete failed' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <ArrowPathIcon className="w-4 h-4 inline mr-2" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4 inline mr-2" />
            Add Project
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg ${
            message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Project' : 'New Project'}</h2>
          <form onSubmit={submit} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category (Service)</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">Select service...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.title}
                    </option>
                  ))}
                  {form.category && !services.some((s) => s.slug === form.category) && (
                    <option value={form.category}>
                      Current: {form.category}
                    </option>
                  )}
                </select>
                {services.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Add services first in the Services section.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                />
                <span className="text-sm font-medium text-gray-700">Featured</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="PLANNING">Planning</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Translations (ar, en, ku, tr)</h3>
              <p className="text-xs text-gray-500 mb-4">Leave blank to use the default title/description above.</p>
              <div className="space-y-6">
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
                        className="w-full px-3 py-2 border rounded-lg text-sm"
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
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        rows={2}
                      />
                      <textarea
                        placeholder={`Content (${loc}, optional)`}
                        value={form.translations?.[loc]?.content ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            translations: {
                              ...f.translations,
                              [loc]: { ...f.translations?.[loc], content: e.target.value },
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <CheckIcon className="w-4 h-4 inline mr-2" />
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={closeForm} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                <XMarkIcon className="w-4 h-4 inline mr-2" />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Featured</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {list.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{p.title}</div>
                  <div className="text-sm text-gray-500 truncate max-w-xs">{p.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{p.category}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs rounded-full bg-gray-100">{p.status}</span>
                </td>
                <td className="px-6 py-4">{p.featured ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="text-blue-600 hover:text-blue-800 mr-4"
                  >
                    <PencilIcon className="w-4 h-4 inline" />
                  </button>
                  <button type="button" onClick={() => remove(p.id)} className="text-red-600 hover:text-red-800">
                    <TrashIcon className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">No projects yet. Click &quot;Add Project&quot; to create one.</div>
        )}
      </div>
    </div>
  );
}
