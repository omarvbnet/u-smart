/** Web symbology aligned with Flutter `QFieldMapSymbols` / `qfield_map_features.dart`. */

export type QFieldPointKind = 'pole' | 'fat' | 'handhole' | 'closure' | 'cabinet' | 'hole' | 'generic';

export type LayerCategory =
  | 'fiber_cable'
  | 'fdt_holes'
  | 'fat'
  | 'closure'
  | 'fdt'
  | 'handhole'
  | 'pole'
  | 'cabinet'
  | 'excavation'
  | 'region'
  | 'other';

export function normalizeLayerName(layer?: string | null): string {
  return (layer ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function isCableLayer(layerName?: string | null): boolean {
  const n = normalizeLayerName(layerName);
  if (n.includes('cable')) return true;
  if (n.includes('pullingfoc')) return true;
  if (n.includes('ftth')) return true;
  if (n.includes('fiber') && !n.includes('region')) return true;
  if (n === 'foc' || n.endsWith('_foc')) return true;
  return false;
}

export function cableTypeColor(layerName?: string | null): string {
  const n = normalizeLayerName(layerName);
  if (n.includes('cable12') || n.includes('12f')) return '#E53935';
  if (n.includes('cable24') || n.includes('24f')) return '#1E88E5';
  if (n.includes('cable36') || n.includes('36f')) return '#8E24AA';
  if (n.includes('cable48') || n.includes('48f')) return '#FF8F00';
  if (n.includes('pullingfoc')) return '#D32F2F';
  if (n === 'foc' || n.endsWith('_foc')) return '#C62828';
  return '#E53935';
}

export function classifyLayerCategory(layerName?: string | null): LayerCategory {
  const n = normalizeLayerName(layerName);
  if (isCableLayer(layerName)) return 'fiber_cable';
  if (n.includes('fdthole') || n === 'fdtholes' || (n.includes('hole') && !n.includes('handhole'))) {
    return 'fdt_holes';
  }
  if (n.includes('handhole') || n === 'hh') return 'handhole';
  if (n.includes('closure') || n.includes('odf') || n.includes('fdtclosure')) return 'closure';
  if (n.includes('passivecabinet') || (n.includes('passive') && n.includes('cabinet'))) return 'cabinet';
  if ((n.includes('fat') || n.includes('fdt')) && !n.includes('region')) return n.includes('fat') ? 'fat' : 'fdt';
  if (n.includes('pole') || n.includes('utilitypole')) return 'pole';
  if (n.includes('excavation') || n.includes('trench')) return 'excavation';
  if (n.includes('region') || n.includes('zone') || n.includes('parcel') || n.includes('network')) {
    return 'region';
  }
  return 'other';
}

export const LAYER_CATEGORY_LABELS: Record<LayerCategory, string> = {
  fiber_cable: 'Fiber cables',
  fdt_holes: 'FDT holes',
  fat: 'FAT',
  closure: 'Closures',
  fdt: 'FDT',
  handhole: 'Handholes',
  pole: 'Poles',
  cabinet: 'Passive cabinet',
  excavation: 'Excavation / trench',
  region: 'Regions / parcels',
  other: 'Other',
};

export function pointKindForLayer(layerName?: string | null): QFieldPointKind {
  const n = normalizeLayerName(layerName);
  if (n.includes('pole') || n.includes('utilitypole') || n.includes('supportstructure')) return 'pole';
  if (n.includes('handhole') || n === 'hh') return 'handhole';
  if (n.includes('fat') && !n.includes('region')) return 'fat';
  if (n.includes('closure') || n.includes('fdtclosure')) return 'closure';
  if (n.includes('passivecabinet') || n.includes('cabinet')) return 'cabinet';
  if (n.includes('fdthole') || n === 'fdtholes' || (n.includes('hole') && !n.includes('handhole'))) return 'hole';
  return 'generic';
}

export function pointIconHtml(kind: QFieldPointKind, selected = false): string {
  const sel = selected ? 'filter: drop-shadow(0 0 4px #6C63FF);' : '';
  switch (kind) {
    case 'pole':
    case 'generic':
      return `<svg width="22" height="20" viewBox="0 0 22 20" style="${sel}"><path d="M11 2 L20 18 L2 18 Z" fill="#43A047" stroke="#2E7D32" stroke-width="1.2"/><circle cx="11" cy="2" r="4" fill="#9C27B0"/></svg>`;
    case 'fat':
    case 'handhole':
    case 'hole':
      return `<svg width="16" height="16" viewBox="0 0 16 16" style="${sel}"><rect x="1" y="1" width="14" height="14" fill="#FFFFFF" stroke="#E53935" stroke-width="${selected ? 2.4 : 1.8}"/></svg>`;
    case 'closure':
      return `<svg width="18" height="18" viewBox="0 0 18 18" style="${sel}"><circle cx="9" cy="9" r="7" fill="#E53935" stroke="#FFFFFF" stroke-width="1.4"/></svg>`;
    case 'cabinet':
      return `<svg width="22" height="14" viewBox="0 0 22 14" style="${sel}"><rect x="1" y="1" width="20" height="12" rx="2" fill="#1A1A1A" stroke="#E53935" stroke-width="1.6"/></svg>`;
  }
}

export function lineStyleForLayer(layerName?: string | null): {
  color: string;
  weight: number;
  glowColor: string;
  glowWeight: number;
  opacity: number;
} {
  const n = normalizeLayerName(layerName);
  if (isCableLayer(layerName)) {
    const c = cableTypeColor(layerName);
    return { color: c, weight: 5.5, glowColor: c, glowWeight: 9, opacity: 0.95 };
  }
  if (n.includes('excavation') || n === 'excavation') {
    return { color: '#8D6E63', weight: 4, glowColor: '#8D6E63', glowWeight: 6, opacity: 0.85 };
  }
  return { color: '#E53935', weight: 4, glowColor: '#E53935', glowWeight: 6, opacity: 0.88 };
}

export function polygonStyleForLayer(layerName?: string | null): {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
} {
  return {
    color: '#000000',
    fillColor: '#C8E6C9',
    fillOpacity: 0.45,
    weight: 1.5,
  };
}

function propValue(props: Record<string, unknown>, keys: string[]): string | null {
  for (const want of keys) {
    for (const [k, v] of Object.entries(props)) {
      if (k.toLowerCase() !== want.toLowerCase()) continue;
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s !== '[binary]') return s;
    }
  }
  return null;
}

/** On-map label for FAT / holes / closures / cables (matches mobile). */
export function mapLabelForFeature(props: Record<string, unknown>, layerName?: string | null): string | null {
  const n = normalizeLayerName(layerName ?? String(props.layer ?? ''));
  if (n.includes('pole')) return propValue(props, ['pole_no', 'pole_id', 'name', 'label']);
  if (n.includes('fdthole') || n === 'fdtholes' || (n.includes('hole') && !n.includes('handhole'))) {
    return propValue(props, ['hole_id', 'fdt_hole_id', 'fdt_hole_no', 'id', 'name', 'label']);
  }
  if ((n.includes('fat') || n.includes('fdt')) && !n.includes('region')) {
    return propValue(props, ['fat_no', 'fat_id', 'fdt_no', 'fdt_id', 'name', 'label', 'code']);
  }
  if (n.includes('closure') || n.includes('odf')) {
    return propValue(props, ['closure_id', 'odf_id', 'odf_no', 'name', 'label']);
  }
  if (n.includes('handhole') || n === 'hh') {
    return propValue(props, ['handhole_id', 'hh_id', 'id', 'name']);
  }
  if (isCableLayer(layerName ?? String(props.layer ?? ''))) {
    return propValue(props, ['cable_id', 'cable_no', 'fiber_id', 'name', 'label', 'code']);
  }
  return propValue(props, ['name', 'label', 'id', 'code']);
}

/** Duplicate cable lines for glow underlay in GeoJSON. */
export function expandCableGlowFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (const f of features) {
    out.push(f);
    const layer = String((f.properties as Record<string, unknown>)?.layer ?? '');
    const t = f.geometry?.type;
    if (!isCableLayer(layer)) continue;
    if (t !== 'LineString' && t !== 'MultiLineString') continue;
    out.push({
      ...f,
      properties: { ...(f.properties as object), __glow: true },
    });
  }
  return out;
}

export function friendlyLayerTitle(layerName: string): string {
  const raw = layerName.trim();
  if (!raw) return 'Layer';
  return raw.replace(/_/g, ' ');
}
