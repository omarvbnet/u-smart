'use client';

import { useState, useEffect } from 'react';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const PRODUCT_TYPES = ['KNX', 'Buspro', 'Zigbee'] as const;

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
  specifications: unknown;
  userManualUrl: string | null;
  imageUrls: string[];
  productType: string;
  featured: boolean;
};

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  specifications: '',
  userManualUrl: '',
  imageUrls: '' as string,
  productType: 'KNX' as typeof PRODUCT_TYPES[number],
  featured: false,
};

export default function AdminProductsPage() {
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/products${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.products) setList(data.products);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'err', text: 'Failed to load products' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [typeFilter]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    const specs =
      p.specifications != null
        ? typeof p.specifications === 'string'
          ? p.specifications
          : JSON.stringify(p.specifications, null, 2)
        : '';
    setForm({
      title: p.title,
      slug: p.slug,
      description: p.description,
      specifications: specs,
      userManualUrl: p.userManualUrl ?? '',
      imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls.join('\n') : '',
      productType: (['KNX', 'Buspro', 'Zigbee'].includes(p.productType) ? p.productType : 'KNX') as (typeof PRODUCT_TYPES)[number],
      featured: p.featured,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const parseSpecs = (s: string): unknown => {
    if (!s.trim()) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return s;
    }
  };

  const parseImageUrls = (s: string): string[] => {
    if (!s.trim()) return [];
    return s
      .split(/\n|,/)
      .map((u) => u.trim())
      .filter(Boolean);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description,
        specifications: parseSpecs(form.specifications),
        userManualUrl: form.userManualUrl || null,
        imageUrls: parseImageUrls(form.imageUrls),
        productType: form.productType,
        featured: form.featured,
      };
      if (editingId) {
        const res = await fetch(`/api/admin/products/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setList((prev) => prev.map((x) => (x.id === editingId ? data.product : x)));
          setMessage({ type: 'ok', text: 'Product updated' });
          closeForm();
        } else setMessage({ type: 'err', text: data.message || 'Update failed' });
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success && data.product) {
          setList((prev) => [data.product, ...prev]);
          setMessage({ type: 'ok', text: 'Product created' });
          closeForm();
        } else setMessage({ type: 'err', text: data.message || 'Create failed' });
      }
    } catch (e) {
      setMessage({ type: 'err', text: 'Request failed' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      setList((prev) => prev.filter((x) => x.id !== id));
      setMessage({ type: 'ok', text: 'Product deleted' });
    } else setMessage({ type: 'err', text: data.message || 'Delete failed' });
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Products (KNX, Buspro, Zigbee)</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
            Add Product
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
          <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Product' : 'New Product'}</h2>
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
                  placeholder="auto-generated from title"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product type</label>
              <select
                value={form.productType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, productType: e.target.value as (typeof PRODUCT_TYPES)[number] }))
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specifications (JSON or key-value)
              </label>
              <textarea
                value={form.specifications}
                onChange={(e) => setForm((f) => ({ ...f, specifications: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                rows={4}
                placeholder='{"Power": "12V", "Protocol": "KNX"}'
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User manual URL</label>
              <input
                type="url"
                value={form.userManualUrl}
                onChange={(e) => setForm((f) => ({ ...f, userManualUrl: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URLs (one per line or comma-separated)
              </label>
              <textarea
                value={form.imageUrls}
                onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                rows={3}
                placeholder="https://..."
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Featured (shown first)</span>
            </label>

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <CheckIcon className="w-4 h-4 inline mr-2" />
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
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
                <td className="px-6 py-4 text-sm text-gray-600">{p.productType}</td>
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
          <div className="px-6 py-12 text-center text-gray-500">
            No products yet. Click &quot;Add Product&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
