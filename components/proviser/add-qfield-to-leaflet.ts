import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import {
  cableTypeColor,
  classifyLayerCategory,
  expandCableGlowFeatures,
  isCableLayer,
  lineStyleForLayer,
  mapLabelForFeature,
  pointIconHtml,
  pointKindForLayer,
  polygonStyleForLayer,
  type LayerCategory,
} from '@/lib/qfield-map-symbology';

export type FeaturePickHandler = (info: {
  layerName: string;
  projectTitle: string;
  geometryType: string;
  properties: Record<string, unknown>;
  category: LayerCategory;
}) => void;

export function addQfieldGeoJsonToMap(
  L: typeof import('leaflet'),
  map: LeafletMap,
  features: GeoJSON.Feature[],
  opts: {
    layerName: string;
    projectTitle: string;
    onFeatureClick: FeaturePickHandler;
  }
): { group: LayerGroup; geoLayer: import('leaflet').GeoJSON } {
  const group = L.layerGroup();
  const expanded = expandCableGlowFeatures(features);

  const geoLayer = L.geoJSON(
    { type: 'FeatureCollection', features: expanded } as GeoJSON.FeatureCollection,
    {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const layer = String(props.layer ?? opts.layerName);
        const isGlow = props.__glow === true;
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
        const html = pointIconHtml(kind);
        const icon = L.divIcon({
          className: '',
          html,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        return L.marker(latlng, { icon });
      },
      onEachFeature: (feature, layer) => {
        const props = { ...(feature.properties as Record<string, unknown>) };
        if (props.__glow) return;

        const layerName = String(props.layer ?? opts.layerName);
        const label = mapLabelForFeature(props, layerName);
        if (label && 'bindTooltip' in layer) {
          (layer as import('leaflet').Layer).bindTooltip(label, {
            permanent: false,
            direction: 'top',
            className: 'proviser-map-label',
          });
        }

        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          opts.onFeatureClick({
            layerName,
            projectTitle: opts.projectTitle,
            geometryType: feature.geometry?.type ?? 'Unknown',
            properties: props,
            category: classifyLayerCategory(layerName),
          });
        });
      },
    }
  );

  geoLayer.addTo(group);
  group.addTo(map);
  return { group, geoLayer };
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
