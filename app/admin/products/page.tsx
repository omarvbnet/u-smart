'use client';

import { useState, useEffect } from 'react';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
  PhotoIcon,
  XMarkIcon as XIcon,
} from '@heroicons/react/24/outline';
import { uploadWithProgress } from '@/lib/upload-with-progress';

const PRODUCT_TYPES = ['KNX', 'Buspro', 'Zigbee'] as const;
const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
type TranslationsMap = Partial<Record<(typeof LOCALES)[number], { title?: string; description?: string; specifications?: string }>>;

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
  translations?: TranslationsMap | null;
};

const emptyTranslations = (): TranslationsMap => ({
  ar: { title: '', description: '', specifications: '' },
  en: { title: '', description: '', specifications: '' },
  ku: { title: '', description: '', specifications: '' },
  tr: { title: '', description: '', specifications: '' },
});

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  specifications: '',
  userManualUrl: '',
  imageUrls: [] as string[],
  productType: 'KNX' as typeof PRODUCT_TYPES[number],
  featured: false,
  translations: emptyTranslations(),
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
    setForm({ ...emptyForm, translations: emptyTranslations() });
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
    const t = (p.translations as TranslationsMap | null) ?? {};
    setForm({
      title: p.title,
      slug: p.slug,
      description: p.description,
      specifications: specs,
      userManualUrl: p.userManualUrl ?? '',
      imageUrls: Array.isArray(p.imageUrls) ? [...p.imageUrls] : [],
      productType: (['KNX', 'Buspro', 'Zigbee'].includes(p.productType) ? p.productType : 'KNX') as (typeof PRODUCT_TYPES)[number],
      featured: p.featured,
      translations: {
        ar: { title: t.ar?.title ?? '', description: t.ar?.description ?? '', specifications: t.ar?.specifications != null ? (typeof t.ar.specifications === 'string' ? t.ar.specifications : JSON.stringify(t.ar.specifications, null, 2)) : '' },
        en: { title: t.en?.title ?? '', description: t.en?.description ?? '', specifications: t.en?.specifications != null ? (typeof t.en.specifications === 'string' ? t.en.specifications : JSON.stringify(t.en.specifications, null, 2)) : '' },
        ku: { title: t.ku?.title ?? '', description: t.ku?.description ?? '', specifications: t.ku?.specifications != null ? (typeof t.ku.specifications === 'string' ? t.ku.specifications : JSON.stringify(t.ku.specifications, null, 2)) : '' },
        tr: { title: t.tr?.title ?? '', description: t.tr?.description ?? '', specifications: t.tr?.specifications != null ? (typeof t.tr.specifications === 'string' ? t.tr.specifications : JSON.stringify(t.tr.specifications, null, 2)) : '' },
      },
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

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const data = await uploadWithProgress('/api/upload/product-image', file, { credentials: 'include' });
      if (data.url) {
        setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, data.url!] }));
      }
    } catch (err) {
      window.alert((err as Error)?.message || 'Upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== index) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const translationsClean: Record<string, { title?: string; description?: string; specifications?: unknown }> = {};
      LOCALES.forEach((loc) => {
        const t = form.translations?.[loc];
        if (t && (t.title?.trim() || t.description?.trim() || t.specifications?.trim())) {
          const specsVal = t.specifications?.trim();
          translationsClean[loc] = {
            title: t.title?.trim() || undefined,
            description: t.description?.trim() || undefined,
            specifications: specsVal ? parseSpecs(specsVal) : undefined,
          };
        }
      });

      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description,
        specifications: parseSpecs(form.specifications),
        userManualUrl: form.userManualUrl || null,
        imageUrls: form.imageUrls,
        productType: form.productType,
        featured: form.featured,
        translations: Object.keys(translationsClean).length > 0 ? translationsClean : undefined,
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Images</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.imageUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 cursor-pointer">
                  <PhotoIcon className="w-8 h-8 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">
                    {uploadingImage ? '…' : 'Upload'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">JPEG, PNG or WebP. Max 5MB per image.</p>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Featured (shown first)</span>
            </label>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Translations (title, description, specifications per language)</h3>
              <p className="text-xs text-gray-500 mb-4">Leave blank to use the default values above.</p>
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
                        placeholder={`Specifications JSON (${loc})`}
                        value={form.translations?.[loc]?.specifications ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            translations: {
                              ...f.translations,
                              [loc]: { ...f.translations?.[loc], specifications: e.target.value },
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
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
