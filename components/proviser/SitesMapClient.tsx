'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Users } from 'lucide-react';
import {
  addQfieldGeoJsonToMap,
  swatchColorForLayer,
  type RegisteredMapFeature,
} from '@/components/proviser/add-qfield-to-leaflet';
import {
  LAYER_CATEGORY_LABELS,
  classifyLayerCategory,
  friendlyLayerTitle,
  type LayerCategory,
} from '@/lib/qfield-map-symbology';
import type { CablesByType } from '@/lib/qfield-map-tap-detail';
import {
  assignWebFeatureId,
  buildCableMapToggles,
  buildFeatureTapDetail,
  cableDisplayType,
  cableIdFromProperties,
  toMapFeatureRecord,
  type CableMapToggle,
  type FeatureTapDetail,
  type MapFeatureRecord,
} from '@/lib/qfield-map-tap-detail';

export type MapSitePin = {
  id: string;
  source: 'personal' | 'workspace';
  siteId: string;
  location: string;
  province: string;
  latitude: number;
  longitude: number;
  hasQfield: boolean;
  qfieldProjects: Array<{ id: string; title: string; fileName?: string }>;
  canPreviewQfield: boolean;
  hasCoordinates: boolean;
};

type GeoJsonFeatureCollection = GeoJSON.FeatureCollection;

type LayerRow = {
  id: string;
  layerName: string;
  projectTitle: string;
  category: LayerCategory;
  color: string;
  visible: boolean;
  status: 'loading' | 'ready' | 'error' | 'empty';
  error?: string;
  featureCount: number;
};

type StaffPin = {
  requesterId: string;
  latitude: number;
  longitude: number;
  name?: string | null;
  role?: string | null;
  departmentName?: string | null;
  updatedAt: string;
};

type FeatureSelection = {
  layerName: string;
  projectTitle: string;
  geometryType: string;
  category: LayerCategory;
  properties: Record<string, unknown>;
  tapDetail: FeatureTapDetail;
};

function previewUrl(site: MapSitePin, projectId: string) {
  const base =
    site.source === 'workspace'
      ? `/api/provisor-private-company/sites/${site.id}/qfield-map-preview`
      : `/api/sites/${site.id}/qfield-map-preview`;
  return `${base}?projectId=${encodeURIComponent(projectId)}`;
}

function groupFeaturesByLayer(geojson: GeoJsonFeatureCollection): Map<string, GeoJSON.Feature[]> {
  const groups = new Map<string, GeoJSON.Feature[]>();
  for (const f of geojson.features ?? []) {
    if (!f.geometry) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = String(props.layer ?? props.name ?? 'Features');
    const list = groups.get(name) ?? [];
    list.push(f);
    groups.set(name, list);
  }
  return groups;
}

function formatPropertyValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const SKIP_PROPS = new Set(['layer', 'package', 'packagePath', 'crsEpsg', 'fid']);

export function SitesMapClient({
  sites,
  enableLiveLocations = false,
}: {
  sites: MapSitePin[];
  enableLiveLocations?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const siteMarkersRef = useRef<import('leaflet').LayerGroup | null>(null);
  const staffMarkersRef = useRef<import('leaflet').LayerGroup | null>(null);
  const qfieldLayersRef = useRef<Map<string, import('leaflet').LayerGroup>>(new Map());
  const allFeaturesRef = useRef<MapFeatureRecord[]>([]);
  const featureRegistrationsRef = useRef<RegisteredMapFeature[]>([]);
  const loadGenRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [selectedSite, setSelectedSite] = useState<MapSitePin | null>(null);
  const [layerRows, setLayerRows] = useState<LayerRow[]>([]);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [layerError, setLayerError] = useState('');
  const [featureSelection, setFeatureSelection] = useState<FeatureSelection | null>(null);
  const [staff, setStaff] = useState<StaffPin[]>([]);
  const [staffMeta, setStaffMeta] = useState<{ canView: boolean; canViewNames: boolean }>({
    canView: false,
    canViewNames: false,
  });
  const [selectedStaff, setSelectedStaff] = useState<StaffPin | null>(null);
  const [cableToggles, setCableToggles] = useState<CableMapToggle[]>([]);
  const [hiddenCableTypeKeys, setHiddenCableTypeKeys] = useState<Set<string>>(new Set());
  const [hiddenCableIdKeys, setHiddenCableIdKeys] = useState<Set<string>>(new Set());

  const sitesWithCoords = sites.filter((s) => s.hasCoordinates);
  const sitesList = sites.filter((s) => s.canPreviewQfield && s.qfieldProjects.length > 0);

  const clearQfieldLayers = useCallback(() => {
    qfieldLayersRef.current.forEach((l) => l.remove());
    qfieldLayersRef.current.clear();
    allFeaturesRef.current = [];
    featureRegistrationsRef.current = [];
    setCableToggles([]);
    setHiddenCableTypeKeys(new Set());
    setHiddenCableIdKeys(new Set());
  }, []);

  const applyCableVisibility = useCallback(() => {
    for (const reg of featureRegistrationsRef.current) {
      if (!reg.cableTypeKey && !reg.cableIdKey) continue;
      const hideType = reg.cableTypeKey ? hiddenCableTypeKeys.has(reg.cableTypeKey) : false;
      const hideId = reg.cableIdKey ? hiddenCableIdKeys.has(reg.cableIdKey) : false;
      const hide = hideType || hideId;
      const gj = reg.geoJson;
      if (hide) {
        if (gj.hasLayer(reg.leafletLayer)) gj.removeLayer(reg.leafletLayer);
      } else if (!gj.hasLayer(reg.leafletLayer)) {
        gj.addLayer(reg.leafletLayer);
      }
    }
  }, [hiddenCableTypeKeys, hiddenCableIdKeys]);

  useEffect(() => {
    applyCableVisibility();
  }, [applyCableVisibility]);

  const registerFeatureLayer = useCallback((entry: RegisteredMapFeature) => {
    featureRegistrationsRef.current.push(entry);
  }, []);

  const toggleCableFilter = useCallback((toggle: CableMapToggle) => {
    if (toggle.isTypeGroup) {
      setHiddenCableTypeKeys((prev) => {
        const next = new Set(prev);
        if (next.has(toggle.key)) next.delete(toggle.key);
        else next.add(toggle.key);
        return next;
      });
    } else {
      setHiddenCableIdKeys((prev) => {
        const next = new Set(prev);
        if (next.has(toggle.key)) next.delete(toggle.key);
        else next.add(toggle.key);
        return next;
      });
    }
  }, []);

  const setLayerVisible = useCallback((id: string, visible: boolean) => {
    setLayerRows((prev) => prev.map((r) => (r.id === id ? { ...r, visible } : r)));
    const leafletLayer = qfieldLayersRef.current.get(id);
    const map = mapInstanceRef.current;
    if (!leafletLayer || !map) return;
    if (visible) leafletLayer.addTo(map);
    else leafletLayer.remove();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      if (!document.querySelector('link[data-leaflet-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.setAttribute('data-leaflet-css', '1');
        document.head.appendChild(link);
      }
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: true }).setView([33.3152, 44.3661], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      siteMarkersRef.current = L.layerGroup().addTo(map);
      staffMarkersRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 100);
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      clearQfieldLayers();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      siteMarkersRef.current = null;
      staffMarkersRef.current = null;
    };
  }, [clearQfieldLayers]);

  const loadSiteLayers = useCallback(
    async (site: MapSitePin) => {
      if (!mapReady || !mapInstanceRef.current || !site.canPreviewQfield) return;

      const gen = ++loadGenRef.current;
      setSelectedSite(site);
      setFeatureSelection(null);
      setSelectedStaff(null);
      setLayerError('');
      setLoadingLayers(true);
      setLayerRows([]);
      clearQfieldLayers();
      allFeaturesRef.current = [];

      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      const bounds = L.latLngBounds([]);
      let hasBounds = false;

      if (site.hasCoordinates) {
        bounds.extend([site.latitude, site.longitude]);
        hasBounds = true;
      }

      const rows: LayerRow[] = [];

      for (let pi = 0; pi < site.qfieldProjects.length; pi++) {
        if (loadGenRef.current !== gen) return;
        const project = site.qfieldProjects[pi];
        try {
          const res = await fetch(previewUrl(site, project.id), { credentials: 'include' });
          const data = await res.json();

          if (!data.success) {
            rows.push({
              id: `${site.id}:${project.id}:err`,
              layerName: '—',
              projectTitle: project.title || project.fileName || project.id,
              color: '#E53935',
              visible: false,
              status: 'error',
              error: data.message || 'Load failed',
              category: 'other',
              featureCount: 0,
            });
            continue;
          }

          const geojson = data.geojson as GeoJsonFeatureCollection | undefined;
          if (!geojson?.features?.length) {
            rows.push({
              id: `${site.id}:${project.id}:empty`,
              layerName: 'No geometries',
              projectTitle: project.title || project.fileName || project.id,
              color: '#888',
              visible: false,
              status: 'empty',
              error: data.message ?? 'No features in file',
              category: 'other',
              featureCount: 0,
            });
            continue;
          }

          const groups = groupFeaturesByLayer(geojson);
          const projectTitle = project.title || project.fileName || project.id;

          for (const [layerName, features] of groups) {
            if (!features.length) continue;
            const rowId = `${site.id}:${project.id}:${layerName}`;
            const category = classifyLayerCategory(layerName);
            const swatch = swatchColorForLayer(layerName);

            const taggedFeatures = features.map((f, idx) => {
              const webId = assignWebFeatureId(f, layerName, idx);
              const props = { ...(f.properties as Record<string, unknown>), __webId: webId };
              const tagged = { ...f, properties: props } as GeoJSON.Feature;
              allFeaturesRef.current.push(toMapFeatureRecord(tagged, layerName, webId));
              return tagged;
            });

            const { group: leafletLayer, geoLayer } = addQfieldGeoJsonToMap(L, map, taggedFeatures, {
              layerName,
              projectTitle,
              onFeatureLayer: registerFeatureLayer,
              onFeatureClick: (info) => {
                const webId = info.webId || String(info.properties.__webId ?? '');
                const tapDetail = buildFeatureTapDetail(allFeaturesRef.current, webId);
                if (!tapDetail) return;
                setFeatureSelection({
                  layerName: info.layerName,
                  projectTitle: info.projectTitle,
                  geometryType: info.geometryType,
                  category: info.category,
                  properties: info.properties,
                  tapDetail,
                });
                setSelectedStaff(null);
              },
            });

            qfieldLayersRef.current.set(rowId, leafletLayer);

            try {
              const b = geoLayer.getBounds();
              if (b.isValid()) {
                bounds.extend(b);
                hasBounds = true;
              }
            } catch {
              /* empty */
            }

            const apiBounds = data.bounds as
              | { west: number; south: number; east: number; north: number }
              | undefined;
            if (apiBounds && Number.isFinite(apiBounds.south)) {
              bounds.extend([
                [apiBounds.south, apiBounds.west],
                [apiBounds.north, apiBounds.east],
              ]);
              hasBounds = true;
            }

            rows.push({
              id: rowId,
              layerName: friendlyLayerTitle(layerName),
              projectTitle,
              category,
              color: swatch,
              visible: true,
              status: 'ready',
              featureCount: features.length,
            });
          }
        } catch (err) {
          rows.push({
            id: `${site.id}:${project.id}:err`,
            layerName: '—',
            projectTitle: project.title || project.fileName || project.id,
            color: '#E53935',
            visible: false,
            status: 'error',
            error: err instanceof Error ? err.message : 'Network error',
            category: 'other',
            featureCount: 0,
          });
        }
      }

      if (loadGenRef.current !== gen) return;

      setLayerRows(rows);
      setCableToggles(buildCableMapToggles(allFeaturesRef.current));
      setHiddenCableTypeKeys(new Set());
      setHiddenCableIdKeys(new Set());
      setLoadingLayers(false);
      requestAnimationFrame(() => applyCableVisibility());

      if (hasBounds && map) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
      }
      map.invalidateSize();
    },
    [mapReady, clearQfieldLayers, registerFeatureLayer, applyCableVisibility]
  );

  const refreshSiteMarkers = useCallback(async () => {
    if (!mapReady || !siteMarkersRef.current) return;
    const L = await import('leaflet');
    const group = siteMarkersRef.current;
    group.clearLayers();

    const bounds: [number, number][] = [];
    for (const site of sitesWithCoords) {
      const latlng: [number, number] = [site.latitude, site.longitude];
      bounds.push(latlng);
      const isSelected = selectedSite?.id === site.id;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          transform: translate(-50%, -100%);
          white-space: nowrap;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 2px solid ${isSelected ? '#fff' : '#f59e0b'};
          background: ${isSelected ? '#f59e0b' : 'rgba(15,20,25,0.92)'};
          color: ${isSelected ? '#000' : '#fbbf24'};
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        ">${site.siteId}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker(latlng, { icon });
      marker.on('click', () => {
        loadSiteLayers(site);
      });
      marker.addTo(group);
    }

    if (bounds.length && mapInstanceRef.current && !selectedSite) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [mapReady, sitesWithCoords, selectedSite, loadSiteLayers]);

  useEffect(() => {
    refreshSiteMarkers();
  }, [refreshSiteMarkers]);

  const fetchStaffLocations = useCallback(async () => {
    if (!enableLiveLocations || !mapReady) return;
    try {
      const res = await fetch('/api/provisor-private-company/live-locations', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) return;
      setStaffMeta({ canView: !!data.canViewTeam, canViewNames: !!data.canViewNames });
      if (data.canViewTeam && Array.isArray(data.locations)) {
        setStaff(
          data.locations.map((loc: StaffPin) => ({
            requesterId: loc.requesterId,
            latitude: loc.latitude,
            longitude: loc.longitude,
            name: loc.name,
            role: loc.role,
            departmentName: loc.departmentName,
            updatedAt: loc.updatedAt,
          }))
        );
      } else {
        setStaff([]);
      }
    } catch {
      /* ignore */
    }
  }, [enableLiveLocations, mapReady]);

  useEffect(() => {
    fetchStaffLocations();
    if (!enableLiveLocations) return;
    const t = setInterval(fetchStaffLocations, 20000);
    return () => clearInterval(t);
  }, [fetchStaffLocations, enableLiveLocations]);

  const refreshStaffMarkers = useCallback(async () => {
    if (!mapReady || !staffMarkersRef.current || !staffMeta.canView) return;
    const L = await import('leaflet');
    const group = staffMarkersRef.current;
    group.clearLayers();

    for (const person of staff) {
      const latlng: [number, number] = [person.latitude, person.longitude];
      const label = staffMeta.canViewNames ? person.name || person.requesterId.slice(0, 8) : 'Staff';
      const marker = L.circleMarker(latlng, {
        radius: 9,
        color: '#22c55e',
        fillColor: '#4ade80',
        fillOpacity: 0.95,
        weight: 2,
      });
      marker.bindTooltip(label, { permanent: false, direction: 'top' });
      marker.on('click', (e) => {
        import('leaflet').then((Lf) => Lf.DomEvent.stopPropagation(e));
        setSelectedStaff(person);
        setFeatureSelection(null);
      });
      marker.addTo(group);
    }
  }, [mapReady, staff, staffMeta]);

  useEffect(() => {
    refreshStaffMarkers();
  }, [refreshStaffMarkers]);

  const featureEntries = featureSelection
    ? Object.entries(featureSelection.tapDetail.primaryProps).filter(([k]) => !SKIP_PROPS.has(k))
    : [];

  const legendItems = useMemo(
    () =>
      (
        [
          'fiber_cable',
          'fdt_holes',
          'fat',
          'closure',
          'fdt',
          'handhole',
          'pole',
          'region',
        ] as LayerCategory[]
      ).map((cat) => ({ cat, label: LAYER_CATEGORY_LABELS[cat] })),
    []
  );

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="relative">
        <div ref={mapRef} className="h-[min(78vh,640px)] rounded-xl border border-white/10 z-0" />
        {loadingLayers && (
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 rounded-lg bg-black/80 border border-white/10 px-3 py-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            Loading QField layers…
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-white/10 bg-[#0f1419] p-4 max-h-[min(78vh,640px)] overflow-y-auto flex flex-col gap-4">
        <section>
          <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            Sites
          </h2>
          <p className="text-xs text-gray-500 mb-2">Tap a site name on the map or pick below to load QField layers.</p>
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {sitesList.map((site) => (
              <li key={`${site.source}-${site.id}`}>
                <button
                  type="button"
                  onClick={() => loadSiteLayers(site)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                    selectedSite?.id === site.id
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <span className="font-medium">{site.siteId}</span>
                  <span className="block text-xs text-gray-500 truncate">{site.location || site.province}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selectedSite && (
          <section>
            <h2 className="text-sm font-medium text-amber-300 mb-1">{selectedSite.siteId}</h2>
            <p className="text-xs text-gray-500">{selectedSite.location}</p>
            <p className="text-xs text-gray-600">{selectedSite.province}</p>
            {layerError && <p className="text-xs text-red-400 mt-2">{layerError}</p>}
            {layerRows.length > 0 && (
              <ul className="mt-3 space-y-1">
                {layerRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 text-xs rounded px-2 py-1 bg-white/5"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: row.color }} />
                    <span className="flex-1 truncate text-gray-300">
                      {row.layerName}
                      <span className="text-gray-600"> · {LAYER_CATEGORY_LABELS[row.category]}</span>
                      {row.status === 'ready' ? ` (${row.featureCount})` : ''}
                    </span>
                    {row.status === 'ready' && (
                      <button
                        type="button"
                        className="text-gray-500 hover:text-white"
                        onClick={() => setLayerVisible(row.id, !row.visible)}
                      >
                        {row.visible ? 'hide' : 'show'}
                      </button>
                    )}
                    {row.error && <span className="text-red-400">{row.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            {!loadingLayers && layerRows.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">No layers loaded.</p>
            )}
          </section>
        )}

        {cableToggles.length > 0 && (
          <section className="border-t border-white/10 pt-3">
            <h2 className="text-sm font-medium text-gray-300 mb-2">Fiber cable types</h2>
            <p className="text-[10px] text-gray-500 mb-2">Toggle types on/off (same as mobile QField map).</p>
            <div className="flex flex-wrap gap-1.5">
              {cableToggles
                .filter((t) => t.isTypeGroup)
                .map((t) => (
                  <CableFilterChip
                    key={t.key}
                    toggle={t}
                    selected={!hiddenCableTypeKeys.has(t.key)}
                    onToggle={() => toggleCableFilter(t)}
                  />
                ))}
            </div>
            {cableToggles.some((t) => !t.isTypeGroup) && (
              <>
                <h3 className="text-xs font-medium text-gray-400 mt-3 mb-1.5">Cable IDs</h3>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                  {cableToggles
                    .filter((t) => !t.isTypeGroup)
                    .map((t) => (
                      <CableFilterChip
                        key={t.key}
                        toggle={t}
                        selected={!hiddenCableIdKeys.has(t.key)}
                        onToggle={() => toggleCableFilter(t)}
                        compact
                      />
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        <section className="border-t border-white/10 pt-3">
          <h2 className="text-sm font-medium text-gray-300 mb-2">Legend (QField style)</h2>
          <ul className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-400 mb-3">
            {legendItems.map(({ cat, label }) => (
              <li key={cat} className="flex items-center gap-1.5">
                <LegendSwatch category={cat} />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-white/10 pt-3">
          <h2 className="text-sm font-medium text-gray-300 mb-2">Element details</h2>
          {!featureSelection ? (
            <p className="text-xs text-gray-500">
              Hover for fiber type. Click a route, fiber cable, FAT, handhole, or FDT hole.
            </p>
          ) : (
            <FeatureDetailPanel
              selection={featureSelection}
              featureEntries={featureEntries}
            />
          )}
        </section>

        {enableLiveLocations && (
          <section className="border-t border-white/10 pt-3">
            <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Staff live ({staff.length})
            </h2>
            {!staffMeta.canView ? (
              <p className="text-xs text-gray-500">Live team map is for workspace owners and managers.</p>
            ) : staff.length === 0 ? (
              <p className="text-xs text-gray-500">No recent GPS pings (staff must open the mobile map).</p>
            ) : (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {staff.map((p) => (
                  <li key={p.requesterId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStaff(p);
                        setFeatureSelection(null);
                        mapInstanceRef.current?.setView([p.latitude, p.longitude], 15);
                      }}
                      className={`w-full text-left rounded px-2 py-1.5 text-xs ${
                        selectedStaff?.requesterId === p.requesterId
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {staffMeta.canViewNames ? p.name || p.requesterId : 'Staff member'}
                      {p.role ? ` · ${p.role}` : ''}
                      <span className="block text-gray-600">
                        {new Date(p.updatedAt).toLocaleTimeString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedStaff && staffMeta.canViewNames && (
              <div className="mt-2 text-xs text-gray-400 rounded bg-emerald-500/10 px-2 py-2 border border-emerald-500/20">
                <p className="font-medium text-emerald-200">{selectedStaff.name}</p>
                <p>{selectedStaff.role}</p>
                {selectedStaff.departmentName && <p>{selectedStaff.departmentName}</p>}
              </div>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

function CableFilterChip({
  toggle,
  selected,
  onToggle,
  compact = false,
}: {
  toggle: CableMapToggle;
  selected: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border transition ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      } ${
        selected
          ? 'border-white/30 bg-white/10 text-gray-100'
          : 'border-white/10 bg-black/40 text-gray-600 line-through'
      }`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: toggle.color }}
      />
      {toggle.isTypeGroup ? `${toggle.label} (${toggle.count})` : toggle.label}
    </button>
  );
}

function CablesByTypeBlock({ title, data }: { title: string; data: CablesByType }) {
  const keys = Object.keys(data);
  if (!keys.length) return null;
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{title}</p>
      <ul className="space-y-2">
        {keys.map((type) => (
          <li key={type}>
            <p className="text-amber-200/90 font-semibold">{type}</p>
            {data[type].length > 0 ? (
              <p className="text-gray-300 mt-0.5 break-all">{data[type].join(', ')}</p>
            ) : (
              <p className="text-gray-600">No fiber IDs in layer data</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteInfoFields({ data }: { data: Record<string, string> }) {
  const keys = Object.keys(data);
  if (!keys.length) return null;
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Ducts & site info</p>
      <ul className="space-y-1">
        {keys.map((k) => (
          <li key={k} className="flex gap-2">
            <span className="text-gray-500 shrink-0">{k}:</span>
            <span className="text-gray-200 break-all">{data[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureDetailPanel({
  selection,
  featureEntries,
}: {
  selection: FeatureSelection;
  featureEntries: [string, unknown][];
}) {
  const d = selection.tapDetail;
  const isCable = selection.category === 'fiber_cable' || !!d.cablesByType;
  const fiberType = isCable
    ? cableDisplayType(selection.properties, selection.layerName)
    : null;
  const fiberId = isCable ? cableIdFromProperties(selection.properties) : null;

  return (
    <div className="text-xs space-y-2">
      {isCable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-amber-200/80">Fiber cable</p>
          <p className="text-sm font-semibold text-amber-100">{fiberType}</p>
          {fiberId ? (
            <p className="text-gray-200">
              <span className="text-gray-500">Fiber / cable ID:</span> {fiberId}
            </p>
          ) : (
            <p className="text-gray-500">No cable ID in layer attributes</p>
          )}
          {d.fatId && (
            <p className="text-gray-400">
              <span className="text-gray-500">Linked FAT:</span> {d.fatId}
            </p>
          )}
        </div>
      )}

      <p className="text-sm font-semibold text-white">{d.title}</p>
      <p className="text-gray-400">
        <span className="text-gray-500">Type:</span>{' '}
        {LAYER_CATEGORY_LABELS[selection.category] ?? selection.category}
      </p>
      <p className="text-gray-400">
        <span className="text-gray-500">Layer:</span> {selection.layerName}
      </p>
      <p className="text-gray-400">
        <span className="text-gray-500">File:</span> {selection.projectTitle}
      </p>

      {d.isRoute && d.routeId && (
        <p className="text-gray-300">
          <span className="text-gray-500">Route ID:</span> {d.routeId}
        </p>
      )}
      {d.fatId && (
        <p className="text-gray-300">
          <span className="text-gray-500">FAT ID:</span> {d.fatId}
        </p>
      )}
      {d.handholeId && (
        <p className="text-gray-300">
          <span className="text-gray-500">Handhole ID:</span> {d.handholeId}
        </p>
      )}
      {d.holeId && (
        <p className="text-gray-300">
          <span className="text-gray-500">Hole ID:</span> {d.holeId}
        </p>
      )}

      {d.isRoute && d.routeSiteInfo && <SiteInfoFields data={d.routeSiteInfo} />}
      {!d.isRoute && d.ductsAndSiteInfo && <SiteInfoFields data={d.ductsAndSiteInfo} />}

      {d.isRoute && d.routeCablesByType && (
        <CablesByTypeBlock title="Fibers on route (type · IDs)" data={d.routeCablesByType} />
      )}
      {!d.isRoute && d.cablesByType && Object.keys(d.cablesByType).length > 0 && (
        <CablesByTypeBlock title="Fiber types · IDs" data={d.cablesByType} />
      )}

      {d.handholesAtFat?.map((hh) => (
        <div key={hh.handholeId} className="rounded-lg border border-white/10 p-2 space-y-1">
          <p className="font-medium text-gray-200">Handhole {hh.handholeId}</p>
          {hh.holeId && (
            <p className="text-gray-400">
              <span className="text-gray-500">Hole:</span> {hh.holeId}
            </p>
          )}
          <CablesByTypeBlock title="Cables at handhole" data={hh.cablesByType} />
        </div>
      ))}

      <div className="max-h-40 overflow-y-auto rounded-lg bg-black/30 border border-white/10">
        <table className="w-full">
          <tbody>
            {featureEntries.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-gray-500">No extra attributes</td>
              </tr>
            ) : (
              featureEntries.map(([k, v]) => (
                <tr key={k} className="border-t border-white/5 first:border-0">
                  <td className="px-2 py-1.5 text-gray-500 align-top font-medium">{k}</td>
                  <td className="px-2 py-1.5 text-gray-200 break-all">{formatPropertyValue(v)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LegendSwatch({ category }: { category: LayerCategory }) {
  if (category === 'fiber_cable') {
    return (
      <span className="inline-block w-5 h-1 rounded-full bg-[#E53935] shadow-[0_0_6px_rgba(229,57,53,0.6)]" />
    );
  }
  if (category === 'fdt_holes' || category === 'fat' || category === 'handhole') {
    return <span className="inline-block w-3 h-3 border-2 border-[#E53935] bg-white" />;
  }
  if (category === 'closure') {
    return <span className="inline-block w-3 h-3 rounded-full bg-[#E53935]" />;
  }
  if (category === 'pole') {
    return (
      <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#43A047]" />
    );
  }
  if (category === 'region') {
    return <span className="inline-block w-4 h-3 bg-[#C8E6C9] border border-black/50 opacity-80" />;
  }
  return <span className="inline-block w-3 h-3 bg-gray-500 rounded-sm" />;
}
