'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

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

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties?: Record<string, unknown>;
  }>;
};

type PreviewPayload = {
  geojson: GeoJsonFeatureCollection;
  bounds?: { west: number; south: number; east: number; north: number };
};

function previewUrl(site: MapSitePin, projectId: string) {
  const base =
    site.source === 'workspace'
      ? `/api/provisor-private-company/sites/${site.id}/qfield-map-preview`
      : `/api/sites/${site.id}/qfield-map-preview`;
  return `${base}?projectId=${encodeURIComponent(projectId)}`;
}

export function SitesMapClient({ sites }: { sites: MapSitePin[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const layerGroupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const geoLayerRef = useRef<import('leaflet').GeoJSON | null>(null);
  const [selected, setSelected] = useState<MapSitePin | null>(null);
  const [projectId, setProjectId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [mapReady, setMapReady] = useState(false);

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

      const markers = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = markers;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
      geoLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !layerGroupRef.current) return;
    let cancelled = false;
    (async () => {
    const L = await import('leaflet');
    if (cancelled || !layerGroupRef.current) return;
    const group = layerGroupRef.current;
    group.clearLayers();

    const bounds: import('leaflet').LatLngExpression[] = [];
    for (const site of sites) {
      const latlng: [number, number] = [site.latitude, site.longitude];
      bounds.push(latlng);
      const marker = L.circleMarker(latlng, {
        radius: 8,
        color: site.hasQfield ? '#f59e0b' : '#38bdf8',
        fillColor: site.hasQfield ? '#f59e0b' : '#38bdf8',
        fillOpacity: 0.85,
        weight: 2,
      });
      marker.bindPopup(`<strong>${site.siteId}</strong><br/>${site.location}`);
      marker.on('click', () => {
        setSelected(site);
        setProjectId(site.qfieldProjects[0]?.id ?? '');
        setPreviewError('');
      });
      marker.addTo(group);
    }

    if (bounds.length && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds as [number, number][], { padding: [40, 40], maxZoom: 14 });
    }
    })();
    return () => {
      cancelled = true;
    };
  }, [sites, mapReady]);

  const loadQfieldLayer = useCallback(async () => {
    if (!selected || !projectId || !selected.canPreviewQfield) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await fetch(previewUrl(selected, projectId), { credentials: 'include' });
      const data = await res.json();
      if (!data.success || !data.geojson) {
        setPreviewError(data.message || 'Could not load QField layer');
        return;
      }
      const L = await import('leaflet');
      if (geoLayerRef.current) {
        geoLayerRef.current.remove();
        geoLayerRef.current = null;
      }
      if (!mapInstanceRef.current) return;

      const layer = L.geoJSON(data.geojson as GeoJSON.FeatureCollection, {
        style: () => ({ color: '#fbbf24', weight: 2, fillOpacity: 0.15 }),
      });
      layer.addTo(mapInstanceRef.current);
      geoLayerRef.current = layer;

      const b = data.bounds as PreviewPayload['bounds'];
      if (b && mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(
          [
            [b.south, b.west],
            [b.north, b.east],
          ],
          { padding: [24, 24] }
        );
      } else {
        try {
          mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [24, 24] });
        } catch {
          /* empty layer */
        }
      }
    } catch {
      setPreviewError('Failed to load map layer');
    } finally {
      setPreviewLoading(false);
    }
  }, [selected, projectId]);

  useEffect(() => {
    if (selected?.hasQfield && projectId && selected.canPreviewQfield) {
      loadQfieldLayer();
    }
  }, [selected, projectId, loadQfieldLayer]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div ref={mapRef} className="h-[min(70vh,560px)] rounded-xl border border-white/10 z-0" />
      <aside className="rounded-xl border border-white/10 bg-[#0f1419] p-4 h-fit">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Site &amp; QField</h2>
        {!selected ? (
          <p className="text-sm text-gray-500">Click a pin to view site details and QField layers.</p>
        ) : (
          <>
            <p className="font-medium text-white">{selected.siteId}</p>
            <p className="text-sm text-gray-400 mt-1">{selected.location}</p>
            <p className="text-xs text-gray-600 mt-1">{selected.province}</p>
            {selected.hasQfield && selected.qfieldProjects.length > 0 ? (
              <div className="mt-4 space-y-2">
                <label className="text-xs text-gray-500">QField project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-sm text-white"
                  disabled={!selected.canPreviewQfield}
                >
                  {selected.qfieldProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.fileName || p.id}
                    </option>
                  ))}
                </select>
                {!selected.canPreviewQfield && (
                  <p className="text-xs text-amber-400/80">Your role cannot preview QField on this site.</p>
                )}
                {previewLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading layers…
                  </div>
                )}
                {previewError && <p className="text-xs text-red-400">{previewError}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-3">No QField project on this site.</p>
            )}
          </>
        )}
        <p className="text-xs text-gray-600 mt-4">
          Amber pins = QField site. Blue = coordinates only.
        </p>
      </aside>
    </div>
  );
}
