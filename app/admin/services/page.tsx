'use client';

import { useState, useEffect } from 'react';
import { servicesApi } from '@/lib/api/services';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { SERVICE_ICON_NAMES } from '@/lib/service-icons';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
type TranslationsMap = Partial<Record<(typeof LOCALES)[number], { title?: string; description?: string; content?: string }>>;

type Service = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  icon: string;
  featured: boolean;
  priceRange: string | null;
  duration: string | null;
  features: string[];
  translations?: TranslationsMap | null;
};

const emptyTranslations = (): TranslationsMap => ({
  ar: { title: '', description: '' },
  en: { title: '', description: '' },
  ku: { title: '', description: '' },
  tr: { title: '', description: '' },
});

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  category: 'General',
  icon: 'Box',
  featured: false,
  priceRange: '',
  duration: '',
  features: [] as string[],
  translations: emptyTranslations(),
};

export default function ServicesAdminPage() {
  const [list, setList] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await servicesApi.list();
      if (res.success && res.services) setList(res.services);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to load services' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ ...emptyForm, translations: emptyTranslations() });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (s: Service) => {
    const t = (s.translations as TranslationsMap | null) || {};
    setForm({
      title: s.title,
      slug: s.slug,
      description: s.description,
      category: s.category,
      icon: s.icon,
      featured: s.featured,
      priceRange: s.priceRange ?? '',
      duration: s.duration ?? '',
      features: s.features ?? [],
      translations: {
        ar: { title: t.ar?.title ?? '', description: t.ar?.description ?? '' },
        en: { title: t.en?.title ?? '', description: t.en?.description ?? '' },
        ku: { title: t.ku?.title ?? '', description: t.ku?.description ?? '' },
        tr: { title: t.tr?.title ?? '', description: t.tr?.description ?? '' },
      },
    });
    setEditingId(s.id);
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
        if (t && (t.title?.trim() || t.description?.trim())) {
          translationsClean[loc] = { title: t.title?.trim() || undefined, description: t.description?.trim() || undefined };
        }
      });
      const payload = {
        ...form,
        priceRange: form.priceRange || null,
        duration: form.duration || null,
        features: form.features,
        translations: Object.keys(translationsClean).length > 0 ? translationsClean : undefined,
      };
      if (editingId) {
        const res = await servicesApi.update(editingId, payload);
        if (res.success) {
          setList((prev) => prev.map((s) => (s.id === editingId ? res.service : s)));
          setMessage({ type: 'ok', text: 'Service updated' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Update failed' });
      } else {
        const res = await servicesApi.create(payload);
        if (res.success && res.service) {
          setList((prev) => [res.service, ...prev]);
          setMessage({ type: 'ok', text: 'Service created' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Create failed' });
      }
    } catch (e) {
      setMessage({ type: 'err', text: 'Request failed' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    const res = await servicesApi.delete(id);
    if (res.success) {
      setList((prev) => prev.filter((s) => s.id !== id));
      setMessage({ type: 'ok', text: 'Service deleted' });
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
        <h1 className="text-3xl font-bold text-gray-900">Services</h1>
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
            Add Service
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
          <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Service' : 'New Service'}</h2>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                <select
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {SERVICE_ICON_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price range</label>
                <input
                  type="text"
                  value={form.priceRange}
                  onChange={(e) => setForm((f) => ({ ...f, priceRange: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g. $5,000 - $50,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <input
                  type="text"
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g. 2-6 weeks"
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Featured (shown on home)</span>
            </label>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Translations (for service cards by language)</h3>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Featured</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {list.map((s) => (
              <tr key={s.id}>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-sm text-gray-500 truncate max-w-xs">{s.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{s.category}</td>
                <td className="px-6 py-4">{s.featured ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="text-blue-600 hover:text-blue-800 mr-4"
                  >
                    <PencilIcon className="w-4 h-4 inline" />
                  </button>
                  <button type="button" onClick={() => remove(s.id)} className="text-red-600 hover:text-red-800">
                    <TrashIcon className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">No services yet. Click &quot;Add Service&quot; to create one.</div>
        )}
      </div>
    </div>
  );
}
