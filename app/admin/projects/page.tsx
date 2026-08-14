'use client';

import { useState, useEffect, useCallback } from 'react';
import { projectsApi } from '@/lib/api/projects';
import { servicesApi } from '@/lib/api/services';
import { uploadWithProgress } from '@/lib/upload-with-progress';
import {
  parseAppLinks,
  PROJECT_LINK_PRESETS,
  type ProjectAppLink,
  type ProjectLinkType,
} from '@/lib/project-links';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
  PhotoIcon,
  LinkIcon,
  StarIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';

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
  gallery: string[];
  liveUrl: string | null;
  githubUrl: string | null;
  appLinks?: unknown;
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
  gallery: [] as string[],
  appLinks: [] as ProjectAppLink[],
  tags: [] as string[],
  technologies: [] as string[],
  translations: emptyTranslations(),
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  PLANNING: 'bg-amber-100 text-amber-800',
  ON_HOLD: 'bg-gray-100 text-gray-700',
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export default function ProjectsAdminPage() {
  const [list, setList] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [search, setSearch] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [techInput, setTechInput] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [projectsRes, servicesRes] = await Promise.all([projectsApi.list(), servicesApi.list()]);
      if (projectsRes.success && projectsRes.projects) setList(projectsRes.projects);
      if (servicesRes.success && servicesRes.services) {
        setServices(servicesRes.services.map((s: Service) => ({ id: s.id, title: s.title, slug: s.slug })));
      }
    } catch {
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
    const links = parseAppLinks(p.appLinks);
    const mergedLinks =
      links.length > 0
        ? links
        : [
            ...(p.liveUrl ? [{ type: 'web' as const, label: 'Web App', url: p.liveUrl }] : []),
            ...(p.githubUrl ? [{ type: 'github' as const, label: 'GitHub', url: p.githubUrl }] : []),
          ];
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
      gallery: p.gallery ?? [],
      appLinks: mergedLinks,
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

  const uploadImage = useCallback(async (file: File, target: 'cover' | 'gallery') => {
    const setBusy = target === 'cover' ? setUploadingCover : setUploadingGallery;
    setBusy(true);
    try {
      const data = await uploadWithProgress('/api/upload/project-image', file, { credentials: 'include' });
      if (data.url) {
        if (target === 'cover') {
          setForm((f) => ({ ...f, imageUrl: data.url! }));
        } else {
          setForm((f) => ({ ...f, gallery: [...f.gallery, data.url!] }));
        }
      }
    } catch (err) {
      setMessage({ type: 'err', text: (err as Error)?.message || 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }, []);

  const addAppLink = (type: ProjectLinkType) => {
    const preset = PROJECT_LINK_PRESETS.find((p) => p.type === type);
    setForm((f) => ({
      ...f,
      appLinks: [...f.appLinks, { type, label: preset?.label ?? 'Link', url: '' }],
    }));
  };

  const updateAppLink = (index: number, patch: Partial<ProjectAppLink>) => {
    setForm((f) => ({
      ...f,
      appLinks: f.appLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));
  };

  const removeAppLink = (index: number) => {
    setForm((f) => ({ ...f, appLinks: f.appLinks.filter((_, i) => i !== index) }));
  };

  const addChip = (field: 'tags' | 'technologies', value: string) => {
    const v = value.trim();
    if (!v) return;
    setForm((f) => {
      if (f[field].includes(v)) return f;
      return { ...f, [field]: [...f[field], v] };
    });
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
        slug: form.slug || slugify(form.title),
        client: form.client || null,
        imageUrl: form.imageUrl || null,
        gallery: form.gallery,
        appLinks: form.appLinks.filter((l) => l.url.trim()),
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
    } catch {
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

  const filtered = list.filter(
    (p) =>
      !search.trim() ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-indigo-700 bg-clip-text text-transparent">
              Programming Projects
            </h1>
            <p className="text-gray-500 mt-1">Manage portfolio, app store links, and project images</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 shadow-sm transition-all"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 shadow-lg shadow-indigo-200 transition-all"
            >
              <PlusIcon className="w-5 h-5" />
              Add Project
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-xl border ${
              message.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none"
          />
        </div>

        {/* Project cards grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 p-16 text-center">
            <PhotoIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No projects yet</p>
            <button type="button" onClick={openAdd} className="text-indigo-600 font-medium hover:underline">
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => {
              const links = parseAppLinks(p.appLinks);
              const linkCount = links.length + (p.liveUrl ? 1 : 0) + (p.githubUrl ? 1 : 0);
              return (
                <article
                  key={p.id}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all overflow-hidden"
                >
                  <div className="relative aspect-[16/10] bg-gradient-to-br from-indigo-100 to-blue-50 overflow-hidden">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PhotoIcon className="w-12 h-12 text-indigo-200" />
                      </div>
                    )}
                    {p.featured && (
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400/90 text-amber-950 text-xs font-semibold">
                        <StarSolid className="w-3.5 h-3.5" />
                        Featured
                      </span>
                    )}
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="p-2 rounded-lg bg-white/90 text-indigo-600 hover:bg-white shadow"
                        aria-label="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="p-2 rounded-lg bg-white/90 text-red-600 hover:bg-white shadow"
                        aria-label="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-400">{p.category}</span>
                      {p.year && <span className="text-xs text-gray-400">· {p.year}</span>}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{p.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {(p.gallery?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <PhotoIcon className="w-3.5 h-3.5" />
                          {p.gallery.length} photos
                        </span>
                      )}
                      {linkCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <LinkIcon className="w-3.5 h-3.5" />
                          {linkCount} links
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 md:p-8">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white/95 backdrop-blur rounded-t-2xl">
              <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Project' : 'New Project'}</h2>
              <button type="button" onClick={closeForm} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submit} className="p-6 space-y-8 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {/* Cover image */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <PhotoIcon className="w-4 h-4 text-indigo-500" />
                  Cover Image
                </h3>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-200">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <PhotoIcon className="w-10 h-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl cursor-pointer hover:bg-indigo-100 transition-colors text-sm font-medium">
                      <PhotoIcon className="w-4 h-4" />
                      {uploadingCover ? 'Uploading…' : 'Upload cover'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingCover}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadImage(f, 'cover');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="Or paste image URL"
                      value={form.imageUrl}
                      onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                </div>
              </section>

              {/* Gallery */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <PhotoIcon className="w-4 h-4 text-indigo-500" />
                  Gallery ({form.gallery.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                  {form.gallery.map((url, i) => (
                    <div key={url + i} className="relative aspect-square rounded-lg overflow-hidden group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, gallery: f.gallery.filter((_, j) => j !== i) }))}
                        className="absolute top-1 right-1 p-1 rounded-md bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                    <PlusIcon className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-1">{uploadingGallery ? '…' : 'Add'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingGallery}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(f, 'gallery');
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </section>

              {/* App links */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <GlobeAltIcon className="w-4 h-4 text-indigo-500" />
                  App & Store Links
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {PROJECT_LINK_PRESETS.filter((p) => p.type !== 'custom').map((preset) => (
                    <button
                      key={preset.type}
                      type="button"
                      onClick={() => addAppLink(preset.type)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                    >
                      + {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => addAppLink('custom')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-indigo-300"
                  >
                    + Custom
                  </button>
                </div>
                <div className="space-y-3">
                  {form.appLinks.map((link, i) => {
                    const preset = PROJECT_LINK_PRESETS.find((p) => p.type === link.type);
                    return (
                      <div key={i} className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <select
                          value={link.type}
                          onChange={(e) => updateAppLink(i, { type: e.target.value as ProjectLinkType })}
                          className="sm:w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        >
                          {PROJECT_LINK_PRESETS.map((p) => (
                            <option key={p.type} value={p.type}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Label (optional)"
                          value={link.label ?? ''}
                          onChange={(e) => updateAppLink(i, { label: e.target.value })}
                          className="sm:w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <input
                          type="url"
                          placeholder={preset?.placeholder ?? 'https://…'}
                          value={link.url}
                          onChange={(e) => updateAppLink(i, { url: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required={form.appLinks.length > 0}
                        />
                        <button
                          type="button"
                          onClick={() => removeAppLink(i)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg self-start sm:self-auto"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  {form.appLinks.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Add App Store, Google Play, Web App, or GitHub links</p>
                  )}
                </div>
              </section>

              {/* Basic info */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-800">Project Details</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          title: e.target.value,
                          slug: f.slug || slugify(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                    rows={3}
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                      required
                    >
                      <option value="">Select…</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.slug}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
                    <input
                      type="text"
                      value={form.client}
                      onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <StarIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-700">Featured on homepage</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="PLANNING">Planning</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="ON_HOLD">On Hold</option>
                    </select>
                  </div>
                </div>
                {/* Tags & tech */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Technologies</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {form.technologies.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-lg text-xs">
                          {t}
                          <button type="button" onClick={() => setForm((f) => ({ ...f, technologies: f.technologies.filter((x) => x !== t) }))}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={techInput}
                        onChange={(e) => setTechInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addChip('technologies', techInput);
                            setTechInput('');
                          }
                        }}
                        placeholder="React, Node…"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addChip('technologies', techInput);
                          setTechInput('');
                        }}
                        className="px-3 py-2 bg-gray-100 rounded-xl text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {form.tags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-xs">
                          {t}
                          <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addChip('tags', tagInput);
                            setTagInput('');
                          }
                        }}
                        placeholder="mobile, fintech…"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addChip('tags', tagInput);
                          setTagInput('');
                        }}
                        className="px-3 py-2 bg-gray-100 rounded-xl text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Translations */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Translations (ar, en, ku, tr)</h3>
                <div className="space-y-4">
                  {LOCALES.map((loc) => (
                    <details key={loc} className="rounded-xl border border-gray-200 overflow-hidden">
                      <summary className="px-4 py-2 bg-gray-50 cursor-pointer text-xs font-semibold uppercase text-gray-600">
                        {loc}
                      </summary>
                      <div className="p-4 space-y-2">
                        <input
                          type="text"
                          placeholder={`Title (${loc})`}
                          value={form.translations?.[loc]?.title ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: { ...f.translations, [loc]: { ...f.translations?.[loc], title: e.target.value } },
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <textarea
                          placeholder={`Description (${loc})`}
                          value={form.translations?.[loc]?.description ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              translations: { ...f.translations, [loc]: { ...f.translations?.[loc], description: e.target.value } },
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          rows={2}
                        />
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              <div className="flex gap-3 pt-4 border-t border-gray-100 sticky bottom-0 bg-white pb-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 font-medium shadow-lg shadow-indigo-200"
                >
                  <CheckIcon className="w-4 h-4" />
                  {editingId ? 'Save Changes' : 'Create Project'}
                </button>
                <button type="button" onClick={closeForm} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
