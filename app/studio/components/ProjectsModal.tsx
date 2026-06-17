'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { listCloudProjects, loadCloudProject, createCloudProject, saveCloudProject } from '../lib/cloud-api';
import type { StudioProjectSummary } from '../lib/cloud-types';
import { Cloud, Loader2, Save, X, FolderOpen } from 'lucide-react';

export function ProjectsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const serialize = useStudio((s) => s.serialize);
  const loadDesign = useStudio((s) => s.loadDesign);
  const cloudProjectId = useStudio((s) => s.cloudProjectId);
  const setCloudProjectId = useStudio((s) => s.setCloudProjectId);

  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCloudProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, []);

  const saveCurrent = async () => {
    setSaving(true);
    setError(null);
    try {
      const design = serialize();
      if (cloudProjectId) {
        const p = await saveCloudProject(cloudProjectId, design);
        setCloudProjectId(p.id);
      } else {
        const p = await createCloudProject(design);
        setCloudProjectId(p.id);
        setProjects((prev) => [p, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openProject = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const design = await loadCloudProject(id);
      const { id: pid, shareToken: _st, ...file } = design;
      loadDesign(file);
      setCloudProjectId(pid);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--studio-border)] px-4 py-3">
          <Cloud className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-[var(--studio-text)]">{t('cloudProjects')}</h2>
          <button onClick={onClose} className="ms-auto rounded-lg p-1.5 text-[var(--studio-muted)] hover:bg-[var(--studio-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--studio-border)] p-3">
          <button
            onClick={() => void saveCurrent()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-xs font-bold text-white hover:bg-cyan-400 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {cloudProjectId ? t('saveToCloud') : t('createOnCloud')}
          </button>
          {error && <p className="mt-2 text-center text-[11px] text-red-400">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--studio-muted)]">{t('noCloudProjects')}</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => void openProject(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition hover:bg-[var(--studio-hover)] ${
                      p.id === cloudProjectId ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-[var(--studio-border)]'
                    }`}
                  >
                    <FolderOpen className="h-4 w-4 flex-shrink-0 text-cyan-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--studio-text)]">{p.name}</div>
                      <div className="text-[10px] text-[var(--studio-muted)]">
                        {p.client || '—'} · {p.revision} · {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
