'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

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
};

type GeoJsonFeatureCollection = GeoJSON.FeatureCollection;

type LayerRow = {
  id: string;
  siteLabel: string;
  projectTitle: string;
  layerName: string;
  color: string;
  visible: boolean;
  status: 'loading' | 'ready' | 'error' | 'empty';
  error?: string;
  featureCount: number;
};

const FILE_COLORS = [
  '#f59e0b',
  '#38bdf8',
  '#a78bfa',
  '#4ade80',
  '#fb7185',
  '#f472b6',
  '#2dd4bf',
  '#facc15',
  '#60a5fa',
  '#c084fc',
];

const LAYER_STROKES = ['#fbbf24', '#22d3ee', '#c4b5fd', '#86efac', '#fda4af', '#fde047', '#93c5fd'];

function previewUrl(site: MapSitePin, projectId: string) {
  const base =
    site.source === 'workspace'
      ? `/api/provisor-private-company/sites/${site.id}/qfield-map-preview`
      : `/api/sites/${site.id}/qfield-map-preview`;
  return `${base}?projectId=${encodeURIComponent(projectId)}`;
}

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function groupFeaturesByLayer(geojson: GeoJsonFeatureCollection): Map<string, GeoJSON.Feature[]> {
  const groups = new Map<string, GeoJSON.Feature[]>();
  for (const f of geojson.features ?? []) {
    if (!f.geometry) continue;
    const name = String((f.properties as Record<string, unknown>)?.layer ?? 'Features');
    const list = groups.get(name) ?? [];
    list.push(f);
    groups.set(name, list);
  }
  if (!groups.size) {
    groups.set('Features', []);
  }
  return groups;
}

type LoadTask = {
  site: MapSitePin;
  project: MapSitePin['qfieldProjects'][number];
  fileColor: string;
};

export function SitesMapClient({ sites }: { sites: MapSitePin[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const leafletLayersRef = useRef<Map<string, import('leaflet').GeoJSON>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [layerRows, setLayerRows] = useState<LayerRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });

  const tasks = useMemo(() => {
    const list: LoadTask[] = [];
    let fileIdx = 0;
    for (const site of sites) {
      if (!site.canPreviewQfield || !site.qfieldProjects.length) continue;
      for (const project of site.qfieldProjects) {
        list.push({
          site,
          project,
          fileColor: FILE_COLORS[fileIdx % FILE_COLORS.length],
        });
        fileIdx += 1;
      }
    }
    return list;
  }, [sites]);

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

      mapInstanceRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      leafletLayersRef.current.forEach((l) => l.remove());
      leafletLayersRef.current.clear();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const fitAllVisibleBounds = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const L = await import('leaflet');
    const bounds = L.latLngBounds([]);
    let has = false;
    leafletLayersRef.current.forEach((layer, id) => {
      const row = layerRows.find((r) => r.id === id);
      if (row && !row.visible) return;
      try {
        const b = layer.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          has = true;
        }
      } catch {
        /* skip */
      }
    });
    if (has) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    }
  }, [layerRows]);

  const setLayerVisible = useCallback((id: string, visible: boolean) => {
    setLayerRows((prev) => prev.map((r) => (r.id === id ? { ...r, visible } : r)));
    const leafletLayer = leafletLayersRef.current.get(id);
    const map = mapInstanceRef.current;
    if (!leafletLayer || !map) return;
    if (visible) {
      leafletLayer.addTo(map);
    } else {
      leafletLayer.remove();
    }
  }, []);

  const loadAllLayers = useCallback(async () => {
    if (!mapReady || !mapInstanceRef.current || !tasks.length) return;

    setLoadingAll(true);
    setLoadProgress({ done: 0, total: tasks.length });

    const initialRows: LayerRow[] = [];
    for (const { site, project, fileColor } of tasks) {
      initialRows.push({
        id: `${site.id}:${project.id}:pending`,
        siteLabel: site.siteId,
        projectTitle: project.title || project.fileName || project.id,
        layerName: '…',
        color: fileColor,
        visible: true,
        status: 'loading',
        featureCount: 0,
      });
    }
    setLayerRows(initialRows);

    const L = await import('leaflet');
    const map = mapInstanceRef.current;
    leafletLayersRef.current.forEach((l) => l.remove());
    leafletLayersRef.current.clear();

    const allRows: LayerRow[] = [];
    const bounds = L.latLngBounds([]);
    let hasBounds = false;

    for (let i = 0; i < tasks.length; i++) {
      const { site, project, fileColor } = tasks[i];
      setLoadProgress({ done: i, total: tasks.length });

      try {
        const res = await fetch(previewUrl(site, project.id), { credentials: 'include' });
        const data = await res.json();

        if (!data.success || !data.geojson?.features) {
          allRows.push({
            id: `${site.id}:${project.id}:error`,
            siteLabel: site.siteId,
            projectTitle: project.title || project.fileName || project.id,
            layerName: '—',
            color: fileColor,
            visible: true,
            status: 'error',
            error: data.message || 'Could not load',
            featureCount: 0,
          });
          continue;
        }

        const geojson = data.geojson as GeoJsonFeatureCollection;
        const groups = groupFeaturesByLayer(geojson);

        if (!geojson.features.length) {
          allRows.push({
            id: `${site.id}:${project.id}:empty`,
            siteLabel: site.siteId,
            projectTitle: project.title || project.fileName || project.id,
            layerName: 'No geometries',
            color: fileColor,
            visible: false,
            status: 'empty',
            error: data.message ?? 'No vector layers in file',
            featureCount: 0,
          });
          continue;
        }

        for (const [layerName, features] of groups) {
          if (!features.length) continue;
          const rowId = `${site.id}:${project.id}:${layerName}`;
          const stroke = LAYER_STROKES[hashIndex(layerName + fileColor, LAYER_STROKES.length)];

          const subCollection: GeoJsonFeatureCollection = {
            type: 'FeatureCollection',
            features,
          };

          const leafletLayer = L.geoJSON(subCollection, {
            style: () => ({
              color: stroke,
              weight: 2,
              fillColor: fileColor,
              fillOpacity: 0.25,
              opacity: 0.9,
            }),
            onEachFeature: (feature, layer) => {
              const props = feature.properties as Record<string, unknown> | undefined;
              const title = `${site.siteId} · ${project.title || project.fileName}`;
              const body = [
                `<strong>${title}</strong>`,
                `<span style="opacity:0.85">Layer: ${layerName}</span>`,
                site.location ? `<br/>${site.location}` : '',
              ].join('');
              layer.bindPopup(body);
            },
          });

          leafletLayer.addTo(map);
          leafletLayersRef.current.set(rowId, leafletLayer);

          try {
            const b = leafletLayer.getBounds();
            if (b.isValid()) {
              bounds.extend(b);
              hasBounds = true;
            }
          } catch {
            /* skip */
          }

          allRows.push({
            id: rowId,
            siteLabel: site.siteId,
            projectTitle: project.title || project.fileName || project.id,
            layerName,
            color: stroke,
            visible: true,
            status: 'ready',
            featureCount: features.length,
          });
        }

        const apiLayers = Array.isArray(data.layers) ? data.layers : [];
        for (const summary of apiLayers) {
          const name = typeof summary.layer === 'string' ? summary.layer : '';
          if (!name || allRows.some((r) => r.id.endsWith(`:${name}`) && r.projectTitle === (project.title || project.fileName))) {
            continue;
          }
          if (!groups.has(name)) {
            allRows.push({
              id: `${site.id}:${project.id}:${name}:meta`,
              siteLabel: site.siteId,
              projectTitle: project.title || project.fileName || project.id,
              layerName: name,
              color: fileColor,
              visible: false,
              status: 'empty',
              error: 'Listed in project but no features exported',
              featureCount: summary.featureCount ?? 0,
            });
          }
        }
      } catch {
        allRows.push({
          id: `${site.id}:${project.id}:error`,
          siteLabel: site.siteId,
          projectTitle: project.title || project.fileName || project.id,
          layerName: '—',
          color: fileColor,
          visible: false,
          status: 'error',
          error: 'Network error',
          featureCount: 0,
        });
      }
    }

    setLayerRows(allRows);
    setLoadProgress({ done: tasks.length, total: tasks.length });
    setLoadingAll(false);

    if (hasBounds && map) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [mapReady, tasks]);

  useEffect(() => {
    if (mapReady && tasks.length) {
      loadAllLayers();
    } else if (mapReady) {
      setLayerRows([]);
    }
  }, [mapReady, tasks, loadAllLayers]);

  const readyCount = layerRows.filter((r) => r.status === 'ready').length;
  const grouped = useMemo(() => {
    const bySite = new Map<string, LayerRow[]>();
    for (const row of layerRows) {
      const key = row.siteLabel;
      if (!bySite.has(key)) bySite.set(key, []);
      bySite.get(key)!.push(row);
    }
    return [...bySite.entries()];
  }, [layerRows]);

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="relative">
        <div ref={mapRef} className="h-[min(78vh,640px)] rounded-xl border border-white/10 z-0" />
        {(loadingAll || loadProgress.total > 0) && (
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 rounded-lg bg-black/75 border border-white/10 px-3 py-2 text-sm text-white">
            {loadingAll && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
            Loading QField layers {loadProgress.done}/{loadProgress.total}
            {readyCount > 0 && !loadingAll ? ` · ${readyCount} on map` : ''}
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-white/10 bg-[#0f1419] p-4 max-h-[min(78vh,640px)] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium text-gray-300">QField layers</h2>
          <button
            type="button"
            onClick={() => fitAllVisibleBounds()}
            className="text-xs text-amber-400 hover:underline"
          >
            Fit all
          </button>
        </div>

        {!tasks.length ? (
          <p className="text-sm text-gray-500">No QField project files on your sites.</p>
        ) : !layerRows.length && loadingAll ? (
          <p className="text-sm text-gray-500">Reading project files…</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([siteLabel, rows]) => (
              <div key={siteLabel}>
                <p className="text-xs font-semibold text-amber-400/90 uppercase tracking-wide mb-2">{siteLabel}</p>
                <ul className="space-y-1.5">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        row.status === 'error' ? 'bg-red-500/10' : 'bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={row.status !== 'ready'}
                        onClick={() => setLayerVisible(row.id, !row.visible)}
                        className="mt-0.5 text-gray-400 hover:text-white disabled:opacity-30"
                        aria-label={row.visible ? 'Hide layer' : 'Show layer'}
                      >
                        {row.visible && row.status === 'ready' ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: row.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-white truncate">{row.layerName}</p>
                        <p className="text-xs text-gray-500 truncate">{row.projectTitle}</p>
                        {row.status === 'loading' && (
                          <p className="text-xs text-gray-600">Loading…</p>
                        )}
                        {row.status === 'ready' && (
                          <p className="text-xs text-gray-600">{row.featureCount} features</p>
                        )}
                        {row.error && <p className="text-xs text-red-400/90">{row.error}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-600 mt-4 leading-relaxed">
          All QField file layers load automatically. Colors distinguish layers inside each project file.
        </p>
      </aside>
    </div>
  );
}
