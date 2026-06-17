'use client';

import type { DesignFile } from './store';
import type { StudioProjectSummary } from './cloud-types';

export async function listCloudProjects(): Promise<StudioProjectSummary[]> {
  const res = await fetch('/api/studio/projects', { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { projects: StudioProjectSummary[] };
  return data.projects ?? [];
}

export async function createCloudProject(design: DesignFile): Promise<StudioProjectSummary> {
  const res = await fetch('/api/studio/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ design }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { project: StudioProjectSummary };
  return data.project;
}

export async function saveCloudProject(id: string, design: DesignFile): Promise<StudioProjectSummary> {
  const res = await fetch(`/api/studio/projects/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ design }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { project: StudioProjectSummary };
  return data.project;
}

export async function loadCloudProject(id: string): Promise<DesignFile & { id: string; shareToken: string | null }> {
  const res = await fetch(`/api/studio/projects/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { design: DesignFile & { id: string; shareToken: string | null } };
  return data.design;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
