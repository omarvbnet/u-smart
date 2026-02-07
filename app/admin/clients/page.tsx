'use client';

import { useState, useEffect } from 'react';
import { clientsApi } from '@/lib/api/clients';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

type Client = {
  id: string;
  name: string;
  logo: string;
  website: string | null;
  industry: string | null;
  testimonial: string | null;
  featured: boolean;
};

const emptyForm = {
  name: '',
  logo: '',
  website: '',
  industry: '',
  testimonial: '',
  featured: false,
};

export default function ClientsAdminPage() {
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientsApi.list();
      if (res.success && res.clients) setList(res.clients);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to load clients' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setForm({
      name: c.name,
      logo: c.logo,
      website: c.website ?? '',
      industry: c.industry ?? '',
      testimonial: c.testimonial ?? '',
      featured: c.featured,
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
    try {
      const payload = {
        ...form,
        logo: form.logo || '',
        website: form.website || null,
        industry: form.industry || null,
        testimonial: form.testimonial || null,
      };
      if (editingId) {
        const res = await clientsApi.update(editingId, payload);
        if (res.success) {
          setList((prev) => prev.map((c) => (c.id === editingId ? res.client : c)));
          setMessage({ type: 'ok', text: 'Client updated' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Update failed' });
      } else {
        const res = await clientsApi.create(payload);
        if (res.success && res.client) {
          setList((prev) => [res.client, ...prev]);
          setMessage({ type: 'ok', text: 'Client created' });
          closeForm();
        } else setMessage({ type: 'err', text: res.message || 'Create failed' });
      }
    } catch (e) {
      setMessage({ type: 'err', text: 'Request failed' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this client?')) return;
    const res = await clientsApi.delete(id);
    if (res.success) {
      setList((prev) => prev.filter((c) => c.id !== id));
      setMessage({ type: 'ok', text: 'Client deleted' });
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
        <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
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
            Add Client
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
          <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Client' : 'New Client'}</h2>
          <form onSubmit={submit} className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                type="text"
                value={form.logo}
                onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="https://... or leave empty"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Testimonial</label>
              <textarea
                value={form.testimonial}
                onChange={(e) => setForm((f) => ({ ...f, testimonial: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Featured (shown on home)</span>
            </label>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Featured</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {list.map((c) => (
              <tr key={c.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {c.logo && (
                      <img
                        src={c.logo}
                        alt=""
                        className="w-10 h-10 rounded object-contain bg-gray-100"
                      />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">{c.name}</div>
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600"
                        >
                          {c.website}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{c.industry ?? '—'}</td>
                <td className="px-6 py-4">{c.featured ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="text-blue-600 hover:text-blue-800 mr-4"
                  >
                    <PencilIcon className="w-4 h-4 inline" />
                  </button>
                  <button type="button" onClick={() => remove(c.id)} className="text-red-600 hover:text-red-800">
                    <TrashIcon className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">No clients yet. Click &quot;Add Client&quot; to create one.</div>
        )}
      </div>
    </div>
  );
}
