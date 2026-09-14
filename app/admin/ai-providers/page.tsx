'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Star } from 'lucide-react';

type Provider = {
  id: string;
  slug: string;
  name: string;
  kind: 'OPENAI' | 'DEEPSEEK' | 'CLAUDE' | 'CUSTOM';
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  modelFast: string | null;
  modelReason: string | null;
  modelVision: string | null;
  modelTranscribe: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  notes: string | null;
};

type Presets = Record<
  string,
  { baseUrl: string; modelFast: string; modelReason: string; modelVision?: string; modelTranscribe?: string }
>;

const emptyForm = {
  name: '',
  slug: '',
  kind: 'OPENAI' as Provider['kind'],
  baseUrl: '',
  apiKey: '',
  modelFast: '',
  modelReason: '',
  modelVision: '',
  modelTranscribe: '',
  isDefault: false,
  enabled: true,
  priority: 100,
  notes: '',
};

export default function AdminAiProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Presets>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-providers');
      const data = await res.json();
      if (data.success) {
        setProviders(data.providers || []);
        setPresets(data.presets || {});
      } else {
        setMessage(data.message || 'Failed to load');
      }
    } catch {
      setMessage('Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (kind: Provider['kind']) => {
    const p = presets[kind];
    setForm((f) => ({
      ...f,
      kind,
      baseUrl: p?.baseUrl || f.baseUrl,
      modelFast: p?.modelFast || f.modelFast,
      modelReason: p?.modelReason || f.modelReason,
      modelVision: p?.modelVision || f.modelVision,
      modelTranscribe: p?.modelTranscribe || f.modelTranscribe,
      name: f.name || kind,
      slug: f.slug || kind.toLowerCase(),
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || form.name,
        kind: form.kind,
        baseUrl: form.baseUrl || null,
        apiKey: form.apiKey || undefined,
        modelFast: form.modelFast || null,
        modelReason: form.modelReason || null,
        modelVision: form.modelVision || null,
        modelTranscribe: form.modelTranscribe || null,
        isDefault: form.isDefault,
        enabled: form.enabled,
        priority: form.priority,
        notes: form.notes || null,
      };

      const res = await fetch(
        editingId ? `/api/admin/ai-providers/${editingId}` : '/api/admin/ai-providers',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) {
        setMessage(data.message || 'Save failed');
      } else {
        setMessage(editingId ? 'Provider updated.' : 'Provider added.');
        setForm(emptyForm);
        setEditingId(null);
        await load();
      }
    } catch {
      setMessage('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/admin/ai-providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true, enabled: true }),
    });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this AI provider?')) return;
    await fetch(`/api/admin/ai-providers/${id}`, { method: 'DELETE' });
    await load();
  };

  const startEdit = (p: Provider) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      slug: p.slug,
      kind: p.kind,
      baseUrl: p.baseUrl || '',
      apiKey: '',
      modelFast: p.modelFast || '',
      modelReason: p.modelReason || '',
      modelVision: p.modelVision || '',
      modelTranscribe: p.modelTranscribe || '',
      isDefault: p.isDefault,
      enabled: p.enabled,
      priority: p.priority,
      notes: p.notes || '',
    });
  };

  if (loading) return <p className="text-gray-400 p-8">Loading…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">U Agent — AI Providers</h1>
        <p className="text-gray-400 text-sm mt-1">
          Add OpenAI, DeepSeek, Claude (Anthropic), or any OpenAI-compatible custom gateway.
          Keys are encrypted at rest. The <strong>default</strong> provider is used by U Agent
          for chat/tools. For <strong>voice</strong>: set Transcribe model (e.g. OpenAI{' '}
          <code className="text-gray-300">whisper-1</code>) for server audio; the Flutter app
          also uses on-device speech + TTS. Env{' '}
          <code className="text-gray-300">OPENAI_API_KEY</code> remains a fallback when no DB
          provider is configured.
        </p>
      </div>

      {message && (
        <p className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-lg px-3 py-2">
          {message}
        </p>
      )}

      <section className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> {editingId ? 'Edit provider' : 'Add provider'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(['OPENAI', 'DEEPSEEK', 'CLAUDE', 'CUSTOM'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => applyPreset(k)}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5"
            >
              Preset: {k}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Slug (unique)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            disabled={!!editingId}
          />
          <select
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Provider['kind'] })}
          >
            <option value="OPENAI">OPENAI</option>
            <option value="DEEPSEEK">DEEPSEEK</option>
            <option value="CLAUDE">CLAUDE</option>
            <option value="CUSTOM">CUSTOM (OpenAI-compatible)</option>
          </select>
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Base URL"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white sm:col-span-2"
            placeholder={editingId ? 'API key (leave blank to keep)' : 'API key'}
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Fast model"
            value={form.modelFast}
            onChange={(e) => setForm({ ...form, modelFast: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Reason model"
            value={form.modelReason}
            onChange={(e) => setForm({ ...form, modelReason: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Vision model (e.g. gpt-4o)"
            value={form.modelVision}
            onChange={(e) => setForm({ ...form, modelVision: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            placeholder="Transcribe / sound model (e.g. whisper-1)"
            value={form.modelTranscribe}
            onChange={(e) => setForm({ ...form, modelTranscribe: e.target.value })}
          />
          <input
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            type="number"
            placeholder="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Default for U Agent
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.name}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-white font-semibold">Configured providers</h2>
        {!providers.length ? (
          <p className="text-gray-500 text-sm">No providers yet. Add one above or rely on OPENAI_API_KEY.</p>
        ) : (
          providers.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-white/10 bg-black/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
            >
              <div>
                <p className="text-white font-medium flex items-center gap-2">
                  {p.name}
                  {p.isDefault && (
                    <span className="text-amber-300 text-xs inline-flex items-center gap-1">
                      <Star className="w-3 h-3" /> default
                    </span>
                  )}
                  {!p.enabled && <span className="text-xs text-red-300">disabled</span>}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {p.kind} · {p.slug} · key {p.apiKeyMasked || '—'} ·{' '}
                  {p.baseUrl || 'default base URL'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  fast={p.modelFast || '—'} · reason={p.modelReason || '—'}
                </p>
              </div>
              <div className="flex gap-2">
                {!p.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault(p.id)}
                    className="text-xs rounded-lg border border-amber-500/40 text-amber-200 px-3 py-1.5"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="text-xs rounded-lg border border-white/15 text-gray-200 px-3 py-1.5"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-xs rounded-lg border border-red-500/40 text-red-300 px-3 py-1.5 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
