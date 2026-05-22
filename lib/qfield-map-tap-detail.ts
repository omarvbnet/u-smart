/**
 * QField map tap / label logic aligned with Flutter `qfield_map_features.dart` and `qfield_map_tap_context.dart`.
 */

import {
  classifyLayerCategory,
  isCableLayer,
  mapLabelForFeature,
  normalizeLayerName,
  type LayerCategory,
} from '@/lib/qfield-map-symbology';

export type MapFeatureRecord = {
  id: string;
  layerName: string;
  geometryType: string;
  properties: Record<string, unknown>;
};

export type CablesByType = Record<string, string[]>;

export type FeatureTapDetail = {
  category: LayerCategory;
  layerName: string;
  geometryType: string;
  title: string;
  isRoute: boolean;
  routeId?: string;
  routeSiteInfo?: Record<string, string>;
  routeCablesByType?: CablesByType;
  fatId?: string;
  handholeId?: string;
  holeId?: string;
  ductsAndSiteInfo?: Record<string, string>;
  cablesByType?: CablesByType;
  handholesAtFat?: Array<{
    handholeId: string;
    holeId?: string;
    cablesByType: CablesByType;
  }>;
  primaryProps: Record<string, unknown>;
};

const CABLE_ID_KEYS = [
  'cable_id',
  'cableid',
  'cable_no',
  'cableno',
  'cable_number',
  'fiber_id',
  'fiberid',
  'line_id',
  'segment_id',
  'foc_id',
  'foc_no',
  'name',
  'label',
  'code',
];

const ROUTE_ID_KEYS = [
  'route_id',
  'routeid',
  'route_no',
  'routeno',
  'route_name',
  'trench_id',
  'excavation_id',
];

const DUCT_KEYS = [
  'no_of_ducts',
  'number_of_ducts',
  'num_ducts',
  'duct_count',
  'ducts',
  'duct_no',
  'numberofducts',
];

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

function idsEqual(a?: string | null, b?: string | null): boolean {
  const na = (a ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const nb = (b ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return na.length > 0 && na === nb;
}

export function assignWebFeatureId(
  feature: GeoJSON.Feature,
  layerName: string,
  index: number
): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const fid = props.fid ?? props.FID ?? props.id;
  if (fid != null && String(fid).trim()) return `${layerName}::${fid}`;
  return `${layerName}::${index}`;
}

export function isHandholeLayer(layerName?: string | null): boolean {
  const n = normalizeLayerName(layerName);
  return n.includes('handhole') || n === 'hh';
}

export function isFatLayer(layerName?: string | null): boolean {
  const n = normalizeLayerName(layerName);
  return (n.includes('fat') || n.includes('fdt')) && !n.includes('region');
}

export function isHoleLayer(layerName?: string | null): boolean {
  const n = normalizeLayerName(layerName);
  if (isHandholeLayer(layerName)) return false;
  if (n.includes('fdthole') || n === 'fdtholes') return true;
  return n.includes('hole') && !n.includes('handhole');
}

export function isRouteLayerName(layerName?: string | null): boolean {
  const n = normalizeLayerName(layerName);
  if (n.includes('route')) return true;
  if (n.includes('excavation') || n.includes('excav')) return true;
  if (n.includes('trench')) return true;
  if (n.includes('duct') && !n.includes('product')) return true;
  return false;
}

export function isRouteFeature(rec: MapFeatureRecord): boolean {
  if (isCableLayer(rec.layerName)) return false;
  const t = rec.geometryType;
  const isLine = t === 'LineString' || t === 'MultiLineString';
  if (!isLine) return false;
  if (isRouteLayerName(rec.layerName)) return true;
  return routeIdFromProperties(rec.properties) != null;
}

export function isCableFeatureRecord(rec: MapFeatureRecord): boolean {
  if (isCableLayer(rec.layerName)) return true;
  if (classifyLayerCategory(rec.layerName) === 'fiber_cable') return true;
  const n = normalizeLayerName(rec.layerName);
  if (n.includes('ftth')) return true;
  const geom = rec.geometryType;
  if (
    (geom === 'LineString' || geom === 'MultiLineString') &&
    propValue(rec.properties, ['cable_type', 'cabletype', 'fiber_count', 'cable_id', 'fiber_id']) !=
      null
  ) {
    return true;
  }
  return (
    propValue(rec.properties, ['cable_type', 'cabletype', 'fiber_count']) != null
  );
}

export function cableIdFromProperties(props: Record<string, unknown>): string | null {
  return propValue(props, CABLE_ID_KEYS);
}

export function routeIdFromProperties(props: Record<string, unknown>): string | null {
  return propValue(props, ROUTE_ID_KEYS);
}

export function fatIdFromProperties(props: Record<string, unknown>): string | null {
  return propValue(props, [
    'fat_id',
    'fat_no',
    'fatid',
    'fat_number',
    'fat_name',
    'fdt_no',
    'fdt_id',
    'fdtno',
  ]);
}

export function handholeIdFromProperties(props: Record<string, unknown>): string | null {
  return propValue(props, [
    'hh_id',
    'hh_no',
    'hhid',
    'handhole_id',
    'handhole_no',
    'handholeid',
    'hh_number',
  ]);
}

export function holeIdFromProperties(props: Record<string, unknown>): string | null {
  return propValue(props, [
    'hole_id',
    'hole_no',
    'fdt_hole_id',
    'fdt_hole_no',
    'holeid',
  ]);
}

export function cableTypeLabel(layerName?: string | null): string {
  const n = normalizeLayerName(layerName);
  if (n.includes('cable12') || n.includes('12f')) return '12F';
  if (n.includes('cable24') || n.includes('24f')) return '24F';
  if (n.includes('cable36') || n.includes('36f')) return '36F';
  if (n.includes('cable48') || n.includes('48f')) return '48F';
  if (n.includes('pullingfoc')) return 'Pulling FOC';
  if (n === 'foc' || n.endsWith('_foc')) return 'FOC';
  if (n.includes('cable')) return (layerName ?? 'Cable').trim();
  return (layerName ?? 'Line').trim();
}

/** Fiber / cable type for hover and grouping (matches mobile `cableDisplayType`). */
export function cableDisplayType(
  props: Record<string, unknown>,
  layerName?: string | null
): string {
  const fromProps = propValue(props, [
    'cable_type',
    'cabletype',
    'cable_size',
    'fiber_count',
    'type',
    'ftth_type',
    'name',
  ]);
  if (fromProps) {
    const p = fromProps.toLowerCase().replace(/\s+/g, '');
    if (p.includes('12f') || p === '12') return '12F';
    if (p.includes('24f') || p === '24') return '24F';
    if (p.includes('36f') || p === '36') return '36F';
    if (p.includes('48f') || p === '48') return '48F';
    if (p.includes('pulling')) return 'Pulling FOC';
    if (p.includes('foc')) return 'FOC';
    return fromProps;
  }
  return cableTypeLabel(layerName);
}

export function shouldShowPermanentMapLabel(layerName?: string | null): boolean {
  return isFatLayer(layerName) || isHandholeLayer(layerName) || isHoleLayer(layerName);
}

export function permanentMapLabel(
  props: Record<string, unknown>,
  layerName?: string | null
): string | null {
  if (isHandholeLayer(layerName)) {
    return handholeIdFromProperties(props) ?? mapLabelForFeature(props, layerName);
  }
  if (isFatLayer(layerName) || isHoleLayer(layerName)) {
    return mapLabelForFeature(props, layerName);
  }
  return null;
}

export function hoverTooltipForFeature(
  props: Record<string, unknown>,
  layerName?: string | null,
  geometryType?: string
): string {
  const layer = layerName ?? String(props.layer ?? '');
  const cat = classifyLayerCategory(layer);

  if (isCableLayer(layer) || isCableFeatureRecord({ id: '', layerName: layer, geometryType: geometryType ?? '', properties: props })) {
    const cid = cableIdFromProperties(props);
    const type = cableDisplayType(props, layer);
    return cid ? `${type} · ${cid}` : type;
  }

  if (isRouteLayerName(layer) || (geometryType === 'LineString' && isRouteLayerName(layer))) {
    const rid = routeIdFromProperties(props);
    const type = cableDisplayType(props, layer);
    return rid ? `Route · ${type} · ${rid}` : `Route · ${type}`;
  }

  const id =
    permanentMapLabel(props, layer) ?? mapLabelForFeature(props, layer);
  const fiberProp = propValue(props, ['fiber_type', 'fiber_count', 'cable_type']);
  if (id && fiberProp) return `${id} · ${fiberProp}`;
  if (id) return id;
  if (fiberProp) return fiberProp;

  return cableDisplayType(props, layer) !== cableTypeLabel(layer)
    ? cableDisplayType(props, layer)
    : (cat === 'other' ? layer : cat.replace('_', ' '));
}

function fatSummaryFields(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    const s = String(v).trim();
    if (!s || s === '[binary]') continue;
    const isDuct = DUCT_KEYS.some(
      (dk) => lk.includes(dk.replace(/_/g, '')) || lk === dk
    );
    if (isDuct || lk.includes('contractor') || lk.includes('excav')) {
      out[k] = s;
    }
  }
  return out;
}

function featureBelongsToRoute(rec: MapFeatureRecord, routeId: string): boolean {
  const ref = routeIdFromProperties(rec.properties);
  return ref != null && idsEqual(ref, routeId);
}

function featureBelongsToFat(rec: MapFeatureRecord, fatId: string): boolean {
  if (isFatLayer(rec.layerName)) {
    const self = mapLabelForFeature(rec.properties, rec.layerName) ?? fatIdFromProperties(rec.properties);
    if (self && idsEqual(self, fatId)) return true;
  }
  const ref = fatIdFromProperties(rec.properties);
  return ref != null && idsEqual(ref, fatId);
}

function cableMatchesHandhole(
  cable: MapFeatureRecord,
  handhole: MapFeatureRecord
): boolean {
  const hhId = handholeIdFromProperties(handhole.properties);
  if (hhId) {
    const ref = propValue(cable.properties, [
      'hh_id',
      'handhole_id',
      'from_hh',
      'to_hh',
      'from_handhole',
      'to_handhole',
    ]);
    if (ref && idsEqual(ref, hhId)) return true;
  }
  const ha = featureAnchor(cable);
  const ca = featureAnchor(handhole);
  if (ha && ca && haversineMeters(ha, ca) <= 18) return true;
  return false;
}

type LatLng = { lat: number; lng: number };

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function coordsFromGeometry(geom: GeoJSON.Geometry | null | undefined): LatLng[] {
  if (!geom) return [];
  const out: LatLng[] = [];
  const push = (c: number[]) => {
    if (c.length >= 2) out.push({ lng: c[0], lat: c[1] });
  };
  switch (geom.type) {
    case 'Point':
      push(geom.coordinates as number[]);
      break;
    case 'MultiPoint':
      for (const c of geom.coordinates as number[][]) push(c);
      break;
    case 'LineString':
      for (const c of geom.coordinates as number[][]) push(c);
      break;
    case 'MultiLineString':
      for (const line of geom.coordinates as number[][][]) {
        for (const c of line) push(c);
      }
      break;
    case 'Polygon':
      for (const c of (geom.coordinates as number[][][])[0] ?? []) push(c);
      break;
    case 'MultiPolygon':
      for (const poly of geom.coordinates as number[][][][]) {
        for (const c of poly[0] ?? []) push(c);
      }
      break;
    default:
      break;
  }
  return out;
}

function featureAnchor(rec: MapFeatureRecord): LatLng | null {
  const geom = (rec.properties.__geometry as GeoJSON.Geometry | undefined) ?? null;
  const pts = coordsFromGeometry(geom);
  if (!pts.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of pts) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

function distancePointToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const dAb = haversineMeters(a, b);
  if (dAb < 0.01) return haversineMeters(p, a);
  const dAp = haversineMeters(a, p);
  const dBp = haversineMeters(b, p);
  const s = (dAp + dBp + dAb) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - dAp) * (s - dBp) * (s - dAb)));
  const perp = (2 * area) / dAb;
  if (dAp * dAp > dBp * dBp + dAb * dAb) return dBp;
  if (dBp * dBp > dAp * dAp + dAb * dAb) return dAp;
  return perp;
}

function distancePointToPolyline(point: LatLng, line: LatLng[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distancePointToSegment(point, line[i], line[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function featureNearRouteGeometry(
  feature: MapFeatureRecord,
  route: MapFeatureRecord,
  maxMeters = 35
): boolean {
  const routeGeom = route.properties.__geometry as GeoJSON.Geometry | undefined;
  if (!routeGeom) return false;
  const routeLines: LatLng[][] = [];
  if (routeGeom.type === 'LineString') {
    routeLines.push(coordsFromGeometry(routeGeom));
  } else if (routeGeom.type === 'MultiLineString') {
    for (const line of routeGeom.coordinates as number[][][]) {
      routeLines.push(line.map((c) => ({ lng: c[0], lat: c[1] })));
    }
  }
  if (!routeLines.length) return false;

  const featGeom = feature.properties.__geometry as GeoJSON.Geometry | undefined;
  const pts = coordsFromGeometry(featGeom);
  for (const p of pts) {
    for (const line of routeLines) {
      if (line.length >= 2 && distancePointToPolyline(p, line) <= maxMeters) return true;
    }
  }
  return false;
}

function groupCablesByType(cables: MapFeatureRecord[]): CablesByType {
  const map: Record<string, Set<string>> = {};
  for (const c of cables) {
    const type = cableDisplayType(c.properties, c.layerName);
    if (!map[type]) map[type] = new Set();
    const cid = cableIdFromProperties(c.properties);
    if (cid) map[type].add(cid);
  }
  const out: CablesByType = {};
  for (const k of Object.keys(map).sort()) {
    out[k] = [...map[k]].sort();
  }
  return out;
}

function displayPropsForFeature(rec: MapFeatureRecord): Record<string, unknown> {
  const skip = new Set(['layer', 'package', 'packagePath', '__geometry', '__webId', '__glow']);
  const m: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec.properties)) {
    if (skip.has(k)) continue;
    if (v == null) continue;
    const s = String(v);
    if (s === '[binary]') continue;
    m[k] = v;
  }
  return m;
}

function buildRouteDetail(
  selected: MapFeatureRecord,
  allFeatures: MapFeatureRecord[]
): FeatureTapDetail {
  const routeId =
    routeIdFromProperties(selected.properties) ??
    mapLabelForFeature(selected.properties, selected.layerName) ??
    'Route';

  const cables: MapFeatureRecord[] = [];
  const seen = new Set<string>();

  for (const f of allFeatures) {
    if (!isCableFeatureRecord(f)) continue;
    if (routeId && featureBelongsToRoute(f, routeId)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        cables.push(f);
      }
      continue;
    }
    if (featureNearRouteGeometry(f, selected)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        cables.push(f);
      }
    }
  }

  let siteInfo = fatSummaryFields(selected.properties);
  for (const f of allFeatures) {
    if (f.id === selected.id) continue;
    if (!isRouteLayerName(f.layerName) && !normalizeLayerName(f.layerName).includes('excav')) {
      continue;
    }
    if (routeId && featureBelongsToRoute(f, routeId)) {
      siteInfo = { ...siteInfo, ...fatSummaryFields(f.properties) };
    } else if (featureNearRouteGeometry(f, selected, 20)) {
      siteInfo = { ...siteInfo, ...fatSummaryFields(f.properties) };
    }
  }

  return {
    category: classifyLayerCategory(selected.layerName),
    layerName: selected.layerName,
    geometryType: selected.geometryType,
    title: `Route ${routeId}`,
    isRoute: true,
    routeId,
    routeSiteInfo: siteInfo,
    routeCablesByType: groupCablesByType(cables),
    primaryProps: displayPropsForFeature(selected),
  };
}

function buildFatOrHandholeDetail(
  selected: MapFeatureRecord,
  allFeatures: MapFeatureRecord[]
): FeatureTapDetail {
  const layer = selected.layerName;
  const fatId = isFatLayer(layer)
    ? mapLabelForFeature(selected.properties, layer) ?? fatIdFromProperties(selected.properties)
    : isHandholeLayer(layer)
      ? fatIdFromProperties(selected.properties)
      : fatIdFromProperties(selected.properties);

  const handholeId = isHandholeLayer(layer)
    ? handholeIdFromProperties(selected.properties) ?? mapLabelForFeature(selected.properties, layer)
    : undefined;

  const holeId = isHoleLayer(layer) ? holeIdFromProperties(selected.properties) ?? undefined : undefined;

  const allCables: MapFeatureRecord[] = [];
  const cableSeen = new Set<string>();
  for (const f of allFeatures) {
    if (!isCableFeatureRecord(f)) continue;
    if (fatId && featureBelongsToFat(f, fatId)) {
      if (!cableSeen.has(f.id)) {
        cableSeen.add(f.id);
        allCables.push(f);
      }
    }
  }

  const handholes: MapFeatureRecord[] = [];
  const hhSeen = new Set<string>();
  for (const f of allFeatures) {
    if (!isHandholeLayer(f.layerName)) continue;
    if (fatId && featureBelongsToFat(f, fatId)) {
      if (!hhSeen.has(f.id)) {
        hhSeen.add(f.id);
        handholes.push(f);
      }
    }
  }
  if (!handholes.length && isHandholeLayer(layer)) {
    handholes.push(selected);
  }

  const assigned = new Set<string>();
  const hhBundles: FeatureTapDetail['handholesAtFat'] = [];

  for (const hh of handholes) {
    const matched = allCables.filter((c) => cableMatchesHandhole(c, hh));
    for (const c of matched) assigned.add(c.id);
    const hhLabel =
      handholeIdFromProperties(hh.properties) ??
      mapLabelForFeature(hh.properties, hh.layerName) ??
      'Handhole';
    hhBundles.push({
      handholeId: hhLabel,
      holeId: holeIdFromProperties(hh.properties) ?? undefined,
      cablesByType: groupCablesByType(matched),
    });
  }

  const unassigned = allCables.filter((c) => !assigned.has(c.id));

  let ducts = fatSummaryFields(selected.properties);
  if (isFatLayer(layer) && fatId && Object.keys(ducts).length === 0) {
    for (const f of allFeatures) {
      if (!isFatLayer(f.layerName)) continue;
      if (!featureBelongsToFat(f, fatId)) continue;
      ducts = fatSummaryFields(f.properties);
      if (Object.keys(ducts).length) break;
    }
  }

  const title = handholeId
    ? `Handhole ${handholeId}`
    : fatId
      ? `FAT ${fatId}`
      : holeId
        ? `Hole ${holeId}`
        : mapLabelForFeature(selected.properties, layer) ?? selected.layerName;

  return {
    category: classifyLayerCategory(layer),
    layerName: layer,
    geometryType: selected.geometryType,
    title,
    isRoute: false,
    fatId: fatId ?? undefined,
    handholeId: handholeId ?? undefined,
    holeId: holeId ?? undefined,
    ductsAndSiteInfo: ducts,
    cablesByType: groupCablesByType(unassigned),
    handholesAtFat: hhBundles.length ? hhBundles : undefined,
    primaryProps: displayPropsForFeature(selected),
  };
}

export function toMapFeatureRecord(
  feature: GeoJSON.Feature,
  layerName: string,
  webId: string
): MapFeatureRecord {
  return {
    id: webId,
    layerName,
    geometryType: feature.geometry?.type ?? 'Unknown',
    properties: {
      ...(feature.properties as Record<string, unknown>),
      layer: (feature.properties as Record<string, unknown>)?.layer ?? layerName,
      __webId: webId,
      __geometry: feature.geometry ?? null,
    },
  };
}

export type CableMapToggle = {
  key: string;
  label: string;
  color: string;
  isTypeGroup: boolean;
  count: number;
};

export function cableTypeToggleKey(
  props: Record<string, unknown>,
  layerName: string
): string {
  return `ctype:${cableDisplayType(props, layerName)}`;
}

export function cableIdToggleKey(webId: string): string {
  return `cid:${webId}`;
}

/** Toggle chips for cable types and individual cable IDs (matches mobile map). */
export function buildCableMapToggles(features: MapFeatureRecord[]): CableMapToggle[] {
  const types = new Map<string, { label: string; color: string; count: number }>();
  const ids: CableMapToggle[] = [];

  for (const f of features) {
    if (!isCableFeatureRecord(f)) continue;
    const typeLabel = cableDisplayType(f.properties, f.layerName);
    const typeKey = `ctype:${typeLabel}`;
    const prev = types.get(typeKey);
    types.set(typeKey, {
      label: typeLabel,
      color: cableTypeColorForLabel(typeLabel),
      count: (prev?.count ?? 0) + 1,
    });

    const cid = cableIdFromProperties(f.properties);
    if (cid) {
      ids.push({
        key: cableIdToggleKey(f.id),
        label: cid,
        color: cableTypeColorForLabel(typeLabel),
        isTypeGroup: false,
        count: 1,
      });
    }
  }

  const out: CableMapToggle[] = [
    ...[...types.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, v]) => ({
        key,
        label: v.label,
        color: v.color,
        isTypeGroup: true,
        count: v.count,
      })),
    ...ids.sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return out;
}

function cableTypeColorForLabel(label: string): string {
  const n = label.trim().toLowerCase().replace(/\s+/g, '');
  if (n.includes('12f') || n === '12') return '#E53935';
  if (n.includes('24f') || n === '24') return '#1E88E5';
  if (n.includes('36f') || n === '36') return '#8E24AA';
  if (n.includes('48f') || n === '48') return '#FF8F00';
  if (n.includes('pulling')) return '#D32F2F';
  if (n.includes('foc')) return '#C62828';
  return '#E53935';
}

export function buildCableFeatureTapDetail(selected: MapFeatureRecord): FeatureTapDetail {
  const type = cableDisplayType(selected.properties, selected.layerName);
  const cid = cableIdFromProperties(selected.properties);
  const linkedFat = fatIdFromProperties(selected.properties);
  const primary = displayPropsForFeature(selected);
  return {
    category: 'fiber_cable',
    layerName: selected.layerName,
    geometryType: selected.geometryType,
    title: cid ? `${type} · ${cid}` : type,
    isRoute: false,
    fatId: linkedFat ?? undefined,
    cablesByType: groupCablesByType([selected]),
    primaryProps: primary,
  };
}

export function buildFeatureTapDetail(
  allFeatures: MapFeatureRecord[],
  webId: string
): FeatureTapDetail | null {
  const selected = allFeatures.find((f) => f.id === webId);
  if (!selected) return null;

  if (isRouteFeature(selected)) {
    return buildRouteDetail(selected, allFeatures);
  }

  // Cables before FAT/handhole — many cable rows carry fat_id / hh_id foreign keys.
  if (isCableFeatureRecord(selected)) {
    return buildCableFeatureTapDetail(selected);
  }

  if (
    isFatLayer(selected.layerName) ||
    isHandholeLayer(selected.layerName) ||
    isHoleLayer(selected.layerName)
  ) {
    return buildFatOrHandholeDetail(selected, allFeatures);
  }

  return {
    category: classifyLayerCategory(selected.layerName),
    layerName: selected.layerName,
    geometryType: selected.geometryType,
    title: mapLabelForFeature(selected.properties, selected.layerName) ?? selected.layerName,
    isRoute: false,
    primaryProps: displayPropsForFeature(selected),
  };
}
