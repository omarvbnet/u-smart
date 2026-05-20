/** Resolve checklist item major/minor from `severity` and/or legacy `weight`. */

export function resolveChecklistItemSeverity(raw: Record<string, unknown>): 'minor' | 'major' {
  const sev = typeof raw.severity === 'string' ? raw.severity.trim().toLowerCase() : '';
  if (sev === 'major') return 'major';
  const wt = typeof raw.weight === 'string' ? raw.weight.trim().toLowerCase() : '';
  return wt === 'major' ? 'major' : 'minor';
}

export function normalizeChecklistItemForApi(raw: Record<string, unknown>): {
  id: string;
  label: string;
  weight: 'minor' | 'major';
  severity: 'minor' | 'major';
} | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const label = typeof raw.label === 'string' ? raw.label : null;
  if (!id || !label) return null;
  const severity = resolveChecklistItemSeverity(raw);
  return { id, label, weight: severity, severity };
}

export function normalizeChecklistTemplateItems(raw: unknown): Array<{
  id: string;
  label: string;
  weight: string;
  severity: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label: string; weight: string; severity: string }> = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const normalized = normalizeChecklistItemForApi(it as Record<string, unknown>);
    if (!normalized) continue;
    out.push(normalized);
  }
  return out;
}
