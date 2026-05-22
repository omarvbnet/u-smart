import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import {
  cableTypeColor,
  classifyLayerCategory,
  expandCableGlowFeatures,
  isCableLayer,
  lineStyleForLayer,
  pointIconHtml,
  pointKindForLayer,
  polygonStyleForLayer,
  type LayerCategory,
} from '@/lib/qfield-map-symbology';
import {
  cableTypeToggleKey,
  hoverTooltipForFeature,
  permanentMapLabel,
  shouldShowPermanentMapLabel,
} from '@/lib/qfield-map-tap-detail';

export type FeaturePickHandler = (info: {
  layerName: string;
  projectTitle: string;
  geometryType: string;
  properties: Record<string, unknown>;
  category: LayerCategory;
  webId: string;
}) => void;

export type RegisteredMapFeature = {
  webId: string;
  leafletLayer: import('leaflet').Layer;
  geoJson: import('leaflet').GeoJSON;
  isGlow: boolean;
  isHitZone: boolean;
  cableTypeKey?: string;
  cableIdKey?: string;
};

/** Wider invisible stroke so fiber lines are easier to click. */
function expandCableHitZones(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (const f of features) {
    const layer = String((f.properties as Record<string, unknown>)?.layer ?? '');
    const t = f.geometry?.type;
    if (
      isCableLayer(layer) &&
      (t === 'LineString' || t === 'MultiLineString')
    ) {
      out.push({
        ...f,
        properties: { ...(f.properties as object), __hitZone: true },
      });
    }
    out.push(f);
  }
  return out;
}

export function addQfieldGeoJsonToMap(
  L: typeof import('leaflet'),
  map: LeafletMap,
  features: GeoJSON.Feature[],
  opts: {
    layerName: string;
    projectTitle: string;
    onFeatureClick: FeaturePickHandler;
    onFeatureLayer?: (entry: RegisteredMapFeature) => void;
  }
): { group: LayerGroup; geoLayer: import('leaflet').GeoJSON } {
  const group = L.layerGroup();
  const expanded = expandCableHitZones(expandCableGlowFeatures(features));

  const geoLayer = L.geoJSON(
    { type: 'FeatureCollection', features: expanded } as GeoJSON.FeatureCollection,
    {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const layer = String(props.layer ?? opts.layerName);
        const isGlow = props.__glow === true;
        const isHitZone = props.__hitZone === true;
        const t = feature?.geometry?.type ?? '';

        if (t === 'Polygon' || t === 'MultiPolygon') {
          const ps = polygonStyleForLayer(layer);
          return {
            color: ps.color,
            fillColor: ps.fillColor,
            fillOpacity: ps.fillOpacity,
            weight: ps.weight,
          };
        }

        const ls = lineStyleForLayer(layer);
        if (isGlow) {
          return {
            color: ls.glowColor,
            weight: ls.glowWeight,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
          };
        }
        if (isHitZone) {
          return {
            color: ls.color,
            weight: 14,
            opacity: 0,
            lineCap: 'round',
            lineJoin: 'round',
          };
        }
        return {
          color: ls.color,
          weight: ls.weight,
          opacity: ls.opacity,
          lineCap: 'round',
          lineJoin: 'round',
        };
      },
      pointToLayer: (feature, latlng) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const layer = String(props.layer ?? opts.layerName);
        const kind = pointKindForLayer(layer);
        const permLabel = permanentMapLabel(props, layer);
        let html = pointIconHtml(kind);
        if (permLabel && shouldShowPermanentMapLabel(layer)) {
          html = `<div class="proviser-map-point-label-wrap">${html}<span class="proviser-map-point-id">${escapeHtml(permLabel)}</span></div>`;
        }
        const icon = L.divIcon({
          className: 'proviser-map-point-icon',
          html,
          iconSize: permLabel ? [56, 36] : [24, 24],
          iconAnchor: permLabel ? [28, 18] : [12, 12],
        });
        return L.marker(latlng, { icon });
      },
      onEachFeature: (feature, layer) => {
        const props = { ...(feature.properties as Record<string, unknown>) };
        const layerName = String(props.layer ?? opts.layerName);
        const isCable = isCableLayer(layerName);
        const webId = String(props.__webId ?? props.__glowSourceWebId ?? '');

        if (props.__glow) {
          if (opts.onFeatureLayer && webId) {
            opts.onFeatureLayer({
              webId,
              leafletLayer: layer,
              geoJson: geoLayer,
              isGlow: true,
              isHitZone: false,
              cableTypeKey: isCable ? cableTypeToggleKey(props, layerName) : undefined,
              cableIdKey: isCable ? `cid:${webId}` : undefined,
            });
          }
          return;
        }

        const geomType = feature.geometry?.type ?? 'Unknown';
        const isHitZone = props.__hitZone === true;

        const pick = () => {
          opts.onFeatureClick({
            layerName,
            projectTitle: opts.projectTitle,
            geometryType: geomType,
            properties: props,
            category: classifyLayerCategory(layerName),
            webId,
          });
        };

        if (!isHitZone) {
          const hover = hoverTooltipForFeature(props, layerName, geomType);
          if (hover && 'bindTooltip' in layer) {
            (layer as import('leaflet').Layer).bindTooltip(hover, {
              permanent: false,
              sticky: true,
              direction: 'top',
              className: 'proviser-map-label',
            });
          }

          const perm = permanentMapLabel(props, layerName);
          if (
            perm &&
            shouldShowPermanentMapLabel(layerName) &&
            'bindTooltip' in layer &&
            (geomType === 'LineString' ||
              geomType === 'MultiLineString' ||
              geomType === 'Polygon')
          ) {
            (layer as import('leaflet').Layer).bindTooltip(perm, {
              permanent: true,
              direction: 'center',
              className: 'proviser-map-label proviser-map-label--permanent',
            });
          }
        }

        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          pick();
        });

        if (opts.onFeatureLayer && webId) {
          opts.onFeatureLayer({
            webId,
            leafletLayer: layer,
            geoJson: geoLayer,
            isGlow: false,
            isHitZone,
            cableTypeKey: isCable ? cableTypeToggleKey(props, layerName) : undefined,
            cableIdKey: isCable ? `cid:${webId}` : undefined,
          });
        }
      },
    }
  );

  geoLayer.addTo(group);
  group.addTo(map);
  return { group, geoLayer };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Legend swatch color for a GIS layer name. */
export function swatchColorForLayer(layerName: string): string {
  if (isCableLayer(layerName)) return cableTypeColor(layerName);
  const kind = pointKindForLayer(layerName);
  if (kind === 'pole' || kind === 'generic') return '#43A047';
  if (kind === 'closure') return '#E53935';
  if (kind === 'cabinet') return '#1A1A1A';
  return '#FFFFFF';
}
