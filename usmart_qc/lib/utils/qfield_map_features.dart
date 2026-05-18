import 'package:latlong2/latlong.dart';

import 'coordinate_transform.dart';

/// One drawable item on the QField map (GeoJSON geometry and/or SQL row with coordinates).
class QFieldMapFeature {
  QFieldMapFeature({
    required this.id,
    required this.layerKey,
    required this.properties,
    this.point,
    this.polyline = const [],
    this.polygons = const [],
    this.label,
    this.source = 'geojson',
    this.sqlRowIndex,
  });

  final String id;
  final String layerKey;
  final Map<String, dynamic> properties;
  final LatLng? point;
  final List<LatLng> polyline;
  final List<List<LatLng>> polygons;
  final String? label;
  final String source;
  final int? sqlRowIndex;

  bool get hasGeometry =>
      point != null || polyline.length >= 2 || polygons.any((r) => r.length >= 3);

  Iterable<LatLng> get allVertices sync* {
    if (point != null) yield point!;
    yield* polyline;
    for (final ring in polygons) {
      yield* ring;
    }
  }
}

const _latKeys = ['lat', 'latitude', 'y', 'northing', 'LAT', 'Latitude'];
const _lngKeys = ['lon', 'lng', 'longitude', 'long', 'x', 'easting', 'LON', 'Longitude'];

bool isWgs84LatLng(double lat, double lng) => CoordinateTransform.isWgs84LatLng(lat, lng);

double? _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.trim());
  return null;
}

double? _pick(Map<String, dynamic> m, List<String> keys) {
  for (final k in keys) {
    if (m.containsKey(k)) {
      final n = _num(m[k]);
      if (n != null) return n;
    }
  }
  for (final e in m.entries) {
    final lk = e.key.toLowerCase();
    for (final want in keys) {
      if (lk == want.toLowerCase()) {
        final n = _num(e.value);
        if (n != null) return n;
      }
    }
  }
  return null;
}

LatLng? _toWgs84(double x, double y, {int? epsg, Map<String, dynamic>? props}) {
  if (isWgs84LatLng(y, x)) return LatLng(y, x);
  return CoordinateTransform.reprojectXY(
    x,
    y,
    epsg: epsg ?? (props != null ? CoordinateTransform.epsgFromProperties(props) : null),
    crsEpsg: props?['crsEpsg']?.toString(),
  );
}

/// Try WGS84 lat/lng from attribute map (QField / shapefile / GPKG columns).
LatLng? latLngFromProperties(Map<String, dynamic> props) {
  final lat = _pick(props, _latKeys);
  final lng = _pick(props, _lngKeys);
  if (lat != null && lng != null) {
    final wgs = _toWgs84(lng, lat, props: props);
    if (wgs != null) return wgs;
  }
  return null;
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

List<LatLng> ringToLatLng(List<dynamic> ring, {Map<String, dynamic>? crsProps}) {
  final pts = <LatLng>[];
  final epsg = crsProps != null ? CoordinateTransform.epsgFromProperties(crsProps) : null;
  for (final p in ring) {
    if (p is List && p.length >= 2 && p[0] is num && p[1] is num) {
      final x = (p[0] as num).toDouble();
      final y = (p[1] as num).toDouble();
      final ll = _toWgs84(x, y, epsg: epsg, props: crsProps);
      if (ll != null) pts.add(ll);
    }
  }
  return pts;
}

String featureLayerKey(Map<String, dynamic> f) {
  final props = f['properties'];
  if (props is! Map) return '';
  final m = Map<String, dynamic>.from(props);
  final pkg = m['package']?.toString() ?? '';
  final layer = m['layer']?.toString() ?? '';
  return '$pkg|$layer';
}

Map<String, dynamic> featureProperties(Map<String, dynamic> f) {
  final props = f['properties'];
  if (props is Map<String, dynamic>) return Map<String, dynamic>.from(props);
  if (props is Map) return Map<String, dynamic>.from(props);
  return {};
}

QFieldMapFeature? geoJsonToMapFeature(Map<String, dynamic> f, int index) {
  final layerKey = featureLayerKey(f);
  if (layerKey.isEmpty || layerKey == '|') return null;
  final props = featureProperties(f);
  final id = 'gj_$index';
  final g = f['geometry'];
  if (g is! Map<String, dynamic>) return null;
  final t = g['type'] as String?;
  final c = g['coordinates'];

  LatLng? point;
  var polyline = <LatLng>[];
  var polygons = <List<LatLng>>[];

  if (t == 'Point' && c is List && c.length >= 2) {
    point = _toWgs84((c[0] as num).toDouble(), (c[1] as num).toDouble(), props: props);
  } else if (t == 'MultiPoint' && c is List) {
    for (final p in c) {
      if (p is List && p.length >= 2) {
        final ll = _toWgs84((p[0] as num).toDouble(), (p[1] as num).toDouble(), props: props);
        if (ll != null) {
          point ??= ll;
        }
      }
    }
  } else if (t == 'LineString' && c is List) {
    polyline = ringToLatLng(c, crsProps: props);
  } else if (t == 'MultiLineString' && c is List) {
    for (final line in c) {
      if (line is List) {
        final pts = ringToLatLng(line, crsProps: props);
        if (pts.length >= 2) {
          if (polyline.isEmpty) polyline = pts;
        }
      }
    }
  } else if (t == 'Polygon' && c is List && c.isNotEmpty) {
    final ring = c.first;
    if (ring is List) {
      final pts = ringToLatLng(ring, crsProps: props);
      if (pts.length >= 3) polygons = [pts];
    }
  } else if (t == 'MultiPolygon' && c is List) {
    for (final poly in c) {
      if (poly is List && poly.isNotEmpty) {
        final ring = poly.first;
        if (ring is List) {
          final pts = ringToLatLng(ring, crsProps: props);
          if (pts.length >= 3) polygons.add(pts);
        }
      }
    }
  }

  if (point == null && polyline.isEmpty && polygons.isEmpty) return null;

  return QFieldMapFeature(
    id: id,
    layerKey: layerKey,
    properties: props,
    point: point,
    polyline: polyline,
    polygons: polygons,
    label: labelFromProperties(props),
    source: props['source']?.toString() ?? 'geojson',
  );
}

List<QFieldMapFeature> buildMapFeatures({
  Map<String, dynamic>? geojson,
  required List<({String name, String package, List<Map<String, dynamic>> rows})> sqlTables,
  Set<String> hiddenLayerKeys = const {},
}) {
  final out = <QFieldMapFeature>[];
  final seenSqlPoints = <String>{};

  final feats = geojson?['features'];
  if (feats is List) {
    var i = 0;
    for (final raw in feats) {
      if (raw is! Map<String, dynamic>) continue;
      final mf = geoJsonToMapFeature(raw, i);
      i++;
      if (mf == null) continue;
      if (hiddenLayerKeys.contains(mf.layerKey)) continue;
      out.add(mf);
    }
  }

  var sqlIdx = 0;
  for (final table in sqlTables) {
    final layerKey = '${table.package}|${table.name}';
    if (hiddenLayerKeys.contains(layerKey)) continue;
    for (var r = 0; r < table.rows.length; r++) {
      final row = table.rows[r];
      final pt = latLngFromProperties(row);
      if (pt == null) continue;
      final dedupe = '${pt.latitude.toStringAsFixed(5)}:${pt.longitude.toStringAsFixed(5)}:$layerKey';
      if (!seenSqlPoints.add(dedupe)) continue;
      final props = Map<String, dynamic>.from(row)
        ..['layer'] = table.name
        ..['package'] = table.package
        ..['source'] = 'sql';
      out.add(QFieldMapFeature(
        id: 'sql_${table.name}_$sqlIdx',
        layerKey: layerKey,
        properties: props,
        point: pt,
        label: labelFromProperties(props) ?? '${table.name} #${r + 1}',
        source: 'sql',
        sqlRowIndex: r,
      ));
      sqlIdx++;
    }
  }

  return out;
}

QFieldMapFeature? findNearestFeature(
  List<QFieldMapFeature> features,
  LatLng tap, {
  double maxMeters = 80,
}) {
  const dist = Distance();
  QFieldMapFeature? best;
  var bestD = maxMeters;

  for (final f in features) {
    if (f.point != null) {
      final d = dist(tap, f.point!);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
      continue;
    }
    for (final v in f.allVertices) {
      final d = dist(tap, v);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
  }
  return best;
}
