import type { DesignNode, DesignEdge } from './model';
import type { StudioLocale } from './i18n';

/**
 * A realistic starter villa circuit that intentionally contains a few design
 * violations so the validation & auto-fix engines have something to detect:
 *  - lighting circuit cable slightly undersized for its breaker
 *  - a missing SPD (system-level grounding warning)
 *  - a low-EER split AC (efficiency recommendation)
 */
export function buildSampleDesign(locale: StudioLocale): {
  nodes: DesignNode[];
  edges: DesignEdge[];
  name: string;
} {
  const names: Record<StudioLocale, string> = {
    ar: 'فيلا نموذجية — لوحة رئيسية',
    en: 'Sample Villa — Main Board',
    ku: 'ڤێلای نموونە — تابلۆی سەرەکی',
    tr: 'Örnek Villa — Ana Pano',
  };

  const nodes: DesignNode[] = [
    { id: 'utility', catalogId: 'src-utility-400', label: 'Utility', x: 80, y: 240, params: {} },
    { id: 'main', catalogId: 'mccb-100', label: 'Main MCCB', x: 320, y: 240, params: {} },

    // Lighting branch
    { id: 'mcb-light', catalogId: 'mcb-c10', label: 'Lighting MCB', x: 560, y: 80, params: {} },
    { id: 'cable-light', catalogId: 'cable-lv-cu-1.5', label: 'Lighting cable', x: 800, y: 80, params: { lengthM: 35 } },
    { id: 'load-light', catalogId: 'load-lighting', label: 'Lighting load', x: 1040, y: 80, params: {} },

    // Socket branch
    { id: 'mcb-socket', catalogId: 'mcb-c20', label: 'Socket MCB', x: 560, y: 240, params: {} },
    { id: 'cable-socket', catalogId: 'cable-lv-cu-2.5', label: 'Socket cable', x: 800, y: 240, params: { lengthM: 25 } },
    { id: 'load-socket', catalogId: 'load-socket', label: 'Socket load', x: 1040, y: 240, params: {} },

    // HVAC branch (low efficiency split)
    { id: 'mcb-ac', catalogId: 'mcb-c16', label: 'AC MCB', x: 560, y: 400, params: {} },
    { id: 'cable-ac', catalogId: 'cable-lv-cu-2.5', label: 'AC cable', x: 800, y: 400, params: { lengthM: 18 } },
    { id: 'hvac-ac', catalogId: 'hvac-split-3.5', label: 'Split AC', x: 1040, y: 400, params: {} },
  ];

  const edge = (source: string, target: string): DesignEdge => ({
    id: `e_${source}_${target}`,
    source,
    sourceHandle: 'source',
    target,
    targetHandle: 'target',
  });

  const edges: DesignEdge[] = [
    edge('utility', 'main'),
    edge('main', 'mcb-light'),
    edge('main', 'mcb-socket'),
    edge('main', 'mcb-ac'),
    edge('mcb-light', 'cable-light'),
    edge('cable-light', 'load-light'),
    edge('mcb-socket', 'cable-socket'),
    edge('cable-socket', 'load-socket'),
    edge('mcb-ac', 'cable-ac'),
    edge('cable-ac', 'hvac-ac'),
  ];

  return { nodes, edges, name: names[locale] ?? names.en };
}
