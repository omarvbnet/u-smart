'use client';

import { useMemo } from 'react';
import { useStudio } from '../lib/store';
import { createTranslator } from '../lib/i18n';
import { getCatalogEntry, type CableSpec } from '../lib/catalog';
import { CABLES } from '../lib/catalog/cables';
import { resolveNodes } from '../lib/model';
import { validateDesign, type Issue } from '../lib/engine/validation';
import { computeQuality, computeCompliance } from '../lib/engine/quality';

/** Translator bound to the current locale. */
export function useT() {
  const locale = useStudio((s) => s.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

/** Full validation + quality + compliance derived from the live design. */
export function useAnalysis() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);

  return useMemo(() => {
    const resolved = resolveNodes(nodes, getCatalogEntry);
    const { issues } = validateDesign(resolved, edges, CABLES as CableSpec[]);
    const quality = computeQuality(issues, resolved.length);
    const compliance = computeCompliance(issues);
    const byNode = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const arr = byNode.get(i.nodeId) ?? [];
      arr.push(i);
      byNode.set(i.nodeId, arr);
    }
    return { issues, quality, compliance, byNode };
  }, [nodes, edges]);
}
