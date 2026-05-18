import 'package:latlong2/latlong.dart';

import 'coordinate_transform.dart';

/// Drawable geometry from QField GeoPackage / shapefile (never synthetic SQL pins).
class QFieldMapFeature {
  QFieldMapFeature({
    required this.id,
    required this.layerKey,
    required this.properties,
    this.points = const [],
    this.polylines = const [],
    this.polygons = const [],
    this.label,
    this.source = 'geojson',
    this.geometryType,
  });

  final String id;
  final String layerKey;
  final Map<String, dynamic> properties;
  /// Point / MultiPoint vertices (drawn with QField layer symbology, not generic pins).
  final List<LatLng> points;
  final List<List<LatLng>> polylines;
  final List<List<LatLng>> polygons;
  final String? label;
  final String source;
  final String? geometryType;

  bool get hasGeometry =>
      points.isNotEmpty ||
      polylines.any((l) => l.length >= 2) ||
      polygons.any((r) => r.length >= 3);

  Iterable<LatLng> get allVertices sync* {
    yield* points;
    for (final line in polylines) {
      yield* line;
    }
    for (final ring in polygons) {
      yield* ring;
    }
  }
}

/// Stable layer id for chips + visibility (package + table/layer name).
String normalizeLayerKey(String package, String layer) {
  final p = package.trim();
  final l = layer.trim();
  if (p.isEmpty && l.isEmpty) return '';
  if (p.isEmpty) return l;
  if (l.isEmpty) return p;
  return '$p|$l';
}

double? _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.trim());
  return null;
}

LatLng? _toWgs84(
  double x,
  double y, {
  int? epsg,
  Map<String, dynamic>? props,
  int? fallbackEpsg,
}) {
  if (CoordinateTransform.isWgs84LatLng(y, x)) return LatLng(y, x);
  final fromProps = props != null ? CoordinateTransform.epsgFromProperties(props) : null;
  final code = epsg ?? fromProps ?? fallbackEpsg;
  return CoordinateTransform.reprojectXY(
    x,
    y,
    epsg: code,
    crsEpsg: props?['crsEpsg']?.toString(),
  ) ??
      CoordinateTransform.reprojectXYGuessed(x, y);
}

String? labelFromProperties(Map<String, dynamic> props) {
  const prefer = ['name', 'label', 'title', 'id', 'code', 'fid', 'Name', 'LABEL'];
  for (final k in prefer) {
    final v = props[k];
    if (v != null && '$v'.trim().isNotEmpty) return '$v'.trim();
  }
  for (final e in props.entries) {
    if (e.value is String && (e.value as String).trim().isNotEmpty) {
      final lk = e.key.toLowerCase();
      if (lk.contains('name') || lk == 'id' || lk == 'code') {
        return (e.value as String).trim();
      }
    }
  }
  return null;
}

List<LatLng> ringToLatLng(
  List<dynamic> ring, {
  Map<String, dynamic>? crsProps,
  int? fallbackEpsg,
}) {
  final pts = <LatLng>[];
  var resolvedEpsg = crsProps != null ? CoordinateTransform.epsgFromProperties(crsProps) : null;
  resolvedEpsg ??= fallbackEpsg;

  for (final p in ring) {
    if (p is! List || p.length < 2) continue;
    final x = _num(p[0]);
    final y = _num(p[1]);
    if (x == null || y == null) continue;
    final ll = _toWgs84(x, y, epsg: resolvedEpsg, props: crsProps, fallbackEpsg: fallbackEpsg);
    if (ll != null) {
      pts.add(ll);
      resolvedEpsg ??= fallbackEpsg ?? CoordinateTransform.epsgFromProperties(crsProps ?? {});
    }
  }
  return pts;
}

String featureLayerKey(Map<String, dynamic> f) {
  final props = f['properties'];
  if (props is! Map) return '';
  final m = Map<String, dynamic>.from(props);
  return normalizeLayerKey(
    m['package']?.toString() ?? m['packagePath']?.toString() ?? '',
    m['layer']?.toString() ?? m['name']?.toString() ?? '',
  );
}

Map<String, dynamic> featureProperties(Map<String, dynamic> f) {
  final props = f['properties'];
  if (props is Map<String, dynamic>) return Map<String, dynamic>.from(props);
  if (props is Map) return Map<String, dynamic>.from(props);
  return {};
}

List<QFieldMapFeature> geoJsonToMapFeatures(
  Map<String, dynamic> f,
  int index, {
  int? fallbackEpsg,
  Map<String, int>? layerEpsgByKey,
}) {
  final layerKey = featureLayerKey(f);
  if (layerKey.isEmpty) return const [];

  final props = featureProperties(f);
  final layerEpsg = layerEpsgByKey?[layerKey] ?? fallbackEpsg;
  final g = f['geometry'];
  if (g is! Map<String, dynamic>) return const [];

  return _featuresFromGeometry(
    g,
    baseId: 'gj_$index',
    layerKey: layerKey,
    props: props,
    fallbackEpsg: layerEpsg ?? fallbackEpsg,
  );
}

List<QFieldMapFeature> _featuresFromGeometry(
  Map<String, dynamic> g, {
  required String baseId,
  required String layerKey,
  required Map<String, dynamic> props,
  int? fallbackEpsg,
}) {
  final t = (g['type'] as String?)?.trim();
  if (t == null || t.isEmpty) return const [];
  final type = t.replaceAll(' ', '').toLowerCase();
  final c = g['coordinates'];

  final points = <LatLng>[];
  final polylines = <List<LatLng>>[];
  final polygons = <List<LatLng>>[];

  switch (type) {
    case 'point':
      if (c is List && c.length >= 2) {
        final ll = _toWgs84(
          _num(c[0]) ?? 0,
          _num(c[1]) ?? 0,
          props: props,
          fallbackEpsg: fallbackEpsg,
        );
        if (ll != null) points.add(ll);
      }
      break;
    case 'multipoint':
      if (c is List) {
        for (final p in c) {
          if (p is List && p.length >= 2) {
            final ll = _toWgs84(
              _num(p[0]) ?? 0,
              _num(p[1]) ?? 0,
              props: props,
              fallbackEpsg: fallbackEpsg,
            );
            if (ll != null) points.add(ll);
          }
        }
      }
      break;
    case 'linestring':
      if (c is List) {
        final pts = ringToLatLng(c, crsProps: props, fallbackEpsg: fallbackEpsg);
        if (pts.length >= 2) polylines.add(pts);
      }
      break;
    case 'multilinestring':
      if (c is List) {
        for (final line in c) {
          if (line is List) {
            final pts = ringToLatLng(line, crsProps: props, fallbackEpsg: fallbackEpsg);
            if (pts.length >= 2) polylines.add(pts);
          }
        }
      }
      break;
    case 'polygon':
      if (c is List) {
        for (final ring in c) {
          if (ring is List) {
            final pts = ringToLatLng(ring, crsProps: props, fallbackEpsg: fallbackEpsg);
            if (pts.length >= 3) {
              polygons.add(pts);
              break;
            }
          }
        }
      }
      break;
    case 'multipolygon':
      if (c is List) {
        for (final poly in c) {
          if (poly is List && poly.isNotEmpty) {
            final ring = poly.first;
            if (ring is List) {
              final pts = ringToLatLng(ring, crsProps: props, fallbackEpsg: fallbackEpsg);
              if (pts.length >= 3) polygons.add(pts);
            }
          }
        }
      }
      break;
    case 'geometrycollection':
      final geoms = g['geometries'];
      if (geoms is List) {
        var sub = 0;
        final out = <QFieldMapFeature>[];
        for (final subG in geoms) {
          if (subG is! Map<String, dynamic>) continue;
          out.addAll(
            _featuresFromGeometry(
              subG,
              baseId: '${baseId}_$sub',
              layerKey: layerKey,
              props: props,
              fallbackEpsg: fallbackEpsg,
            ),
          );
          sub++;
        }
        return out;
      }
      break;
  }

  if (points.isEmpty && polylines.isEmpty && polygons.isEmpty) return const [];

  return [
    QFieldMapFeature(
      id: baseId,
      layerKey: layerKey,
      properties: props,
      points: points,
      polylines: polylines,
      polygons: polygons,
      label: labelFromProperties(props),
      source: props['source']?.toString() ?? 'geojson',
      geometryType: type,
    ),
  ];
}

/// Build map drawables from GeoJSON only (file geometries). SQL tables are for attributes in the panel, not pins.
List<QFieldMapFeature> buildMapFeatures({
  Map<String, dynamic>? geojson,
  Set<String> hiddenLayerKeys = const {},
  int? defaultCrsEpsg,
  Map<String, int>? layerEpsgByKey,
}) {
  final out = <QFieldMapFeature>[];

  final feats = geojson?['features'];
  if (feats is List) {
    var i = 0;
    for (final raw in feats) {
      if (raw is! Map<String, dynamic>) continue;
      final list = geoJsonToMapFeatures(
        raw,
        i,
        fallbackEpsg: defaultCrsEpsg,
        layerEpsgByKey: layerEpsgByKey,
      );
      i++;
      for (final mf in list) {
        if (hiddenLayerKeys.contains(mf.layerKey)) continue;
        if (!mf.hasGeometry) continue;
        final kind = mf.properties['kind']?.toString();
        final src = mf.properties['source']?.toString();
        if (kind == 'qgis_project_extent' || src == 'qgis_project') continue;
        out.add(mf);
      }
    }
  }

  return out;
}

int countDrawables(Iterable<QFieldMapFeature> features) {
  var n = 0;
  for (final f in features) {
    n += f.points.length;
    n += f.polylines.where((l) => l.length >= 2).length;
    n += f.polygons.where((p) => p.length >= 3).length;
  }
  return n;
}

/// One map feature hit by a tap, with distance in meters.
class FeatureTapHit {
  const FeatureTapHit({required this.feature, required this.distanceMeters});

  final QFieldMapFeature feature;
  final double distanceMeters;
}

double _distancePointToSegment(LatLng tap, LatLng a, LatLng b) {
  const dist = Distance();
  var best = dist(tap, a);
  final end = dist(tap, b);
  if (end < best) best = end;
  for (var t = 0.1; t < 0.95; t += 0.12) {
    final lat = a.latitude + (b.latitude - a.latitude) * t;
    final lng = a.longitude + (b.longitude - a.longitude) * t;
    final d = dist(tap, LatLng(lat, lng));
    if (d < best) best = d;
  }
  return best;
}

bool _pointInPolygon(LatLng tap, List<LatLng> ring) {
  if (ring.length < 3) return false;
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final xi = ring[i].longitude;
    final yi = ring[i].latitude;
    final xj = ring[j].longitude;
    final yj = ring[j].latitude;
    final intersect = ((yi > tap.latitude) != (yj > tap.latitude)) &&
        (tap.longitude <
            (xj - xi) * (tap.latitude - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/// Shortest distance from [tap] to any part of [feature] (vertices, edges, polygon interior).
double distanceFeatureToTap(QFieldMapFeature feature, LatLng tap) {
  const dist = Distance();
  var best = double.infinity;

  for (final p in feature.points) {
    best = best < dist(tap, p) ? best : dist(tap, p);
  }

  for (final line in feature.polylines) {
    if (line.length < 2) continue;
    for (var i = 0; i < line.length - 1; i++) {
      final d = _distancePointToSegment(tap, line[i], line[i + 1]);
      if (d < best) best = d;
    }
  }

  for (final ring in feature.polygons) {
    if (ring.length < 3) continue;
    if (_pointInPolygon(tap, ring)) return 0;
    for (var i = 0; i < ring.length - 1; i++) {
      final d = _distancePointToSegment(tap, ring[i], ring[i + 1]);
      if (d < best) best = d;
    }
  }

  return best;
}

/// All features within [maxMeters] of [tap], closest first.
List<FeatureTapHit> findFeaturesNearTap(
  List<QFieldMapFeature> features,
  LatLng tap, {
  double maxMeters = 80,
}) {
  final hits = <FeatureTapHit>[];
  for (final f in features) {
    if (!f.hasGeometry) continue;
    final d = distanceFeatureToTap(f, tap);
    if (d <= maxMeters) hits.add(FeatureTapHit(feature: f, distanceMeters: d));
  }
  hits.sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
  return hits;
}

/// Layer keys at a tap, ordered by the nearest feature in each layer.
List<String> layerKeysFromTapHits(List<FeatureTapHit> hits) {
  final seen = <String>{};
  final keys = <String>[];
  for (final h in hits) {
    final k = h.feature.layerKey;
    if (k.isEmpty || seen.contains(k)) continue;
    seen.add(k);
    keys.add(k);
  }
  return keys;
}

QFieldMapFeature? findNearestFeature(
  List<QFieldMapFeature> features,
  LatLng tap, {
  double maxMeters = 80,
}) {
  final hits = findFeaturesNearTap(features, tap, maxMeters: maxMeters);
  return hits.isEmpty ? null : hits.first.feature;
}
