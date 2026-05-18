import 'package:latlong2/latlong.dart';

import 'coordinate_transform.dart';

/// One drawable item on the QField map (GeoJSON geometry and/or SQL row with coordinates).
class QFieldMapFeature {
  QFieldMapFeature({
    required this.id,
    required this.layerKey,
    required this.properties,
    this.point,
    this.polylines = const [],
    this.polygons = const [],
    this.label,
    this.source = 'geojson',
    this.sqlRowIndex,
  });

  final String id;
  final String layerKey;
  final Map<String, dynamic> properties;
  final LatLng? point;
  /// All line parts (LineString + each part of MultiLineString).
  final List<List<LatLng>> polylines;
  final List<List<LatLng>> polygons;
  final String? label;
  final String source;
  final int? sqlRowIndex;

  bool get hasGeometry =>
      point != null ||
      polylines.any((l) => l.length >= 2) ||
      polygons.any((r) => r.length >= 3);

  Iterable<LatLng> get allVertices sync* {
    if (point != null) yield point!;
    for (final line in polylines) {
      yield* line;
    }
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

/// Try WGS84 lat/lng from attribute map (QField / shapefile / GPKG columns).
LatLng? latLngFromProperties(
  Map<String, dynamic> props, {
  int? fallbackEpsg,
}) {
  final lat = _pick(props, _latKeys);
  final lng = _pick(props, _lngKeys);
  if (lat != null && lng != null) {
    final wgs = _toWgs84(lng, lat, props: props, fallbackEpsg: fallbackEpsg);
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

List<LatLng> ringToLatLng(
  List<dynamic> ring, {
  Map<String, dynamic>? crsProps,
  int? fallbackEpsg,
}) {
  final pts = <LatLng>[];
  var resolvedEpsg = crsProps != null ? CoordinateTransform.epsgFromProperties(crsProps) : null;
  resolvedEpsg ??= fallbackEpsg;

  for (final p in ring) {
    if (p is! List || p.length < 2 || p[0] is! num || p[1] is! num) continue;
    final x = (p[0] as num).toDouble();
    final y = (p[1] as num).toDouble();
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
  final pkg = m['package']?.toString() ?? m['packagePath']?.toString() ?? '';
  final layer = m['layer']?.toString() ?? m['name']?.toString() ?? '';
  if (pkg.isEmpty && layer.isEmpty) return '';
  return '$pkg|$layer';
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
  if (layerKey.isEmpty || layerKey == '|') return const [];

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
  final type = t.replaceAll(' ', '');
  final c = g['coordinates'];

  LatLng? point;
  final polylines = <List<LatLng>>[];
  final polygons = <List<LatLng>>[];

  switch (type.toLowerCase()) {
    case 'point':
      if (c is List && c.length >= 2) {
        point = _toWgs84(
          (c[0] as num).toDouble(),
          (c[1] as num).toDouble(),
          props: props,
          fallbackEpsg: fallbackEpsg,
        );
      }
      break;
    case 'multipoint':
      if (c is List) {
        for (final p in c) {
          if (p is List && p.length >= 2) {
            point ??= _toWgs84(
              (p[0] as num).toDouble(),
              (p[1] as num).toDouble(),
              props: props,
              fallbackEpsg: fallbackEpsg,
            );
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
              break; // exterior ring only for fill
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

  if (point == null && polylines.isEmpty && polygons.isEmpty) return const [];

  return [
    QFieldMapFeature(
      id: baseId,
      layerKey: layerKey,
      properties: props,
      point: point,
      polylines: polylines,
      polygons: polygons,
      label: labelFromProperties(props),
      source: props['source']?.toString() ?? 'geojson',
    ),
  ];
}

List<QFieldMapFeature> buildMapFeatures({
  Map<String, dynamic>? geojson,
  required List<({String name, String package, List<Map<String, dynamic>> rows})> sqlTables,
  Set<String> hiddenLayerKeys = const {},
  int? defaultCrsEpsg,
  Map<String, int>? layerEpsgByKey,
}) {
  final out = <QFieldMapFeature>[];
  final seenSqlPoints = <String>{};

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
        out.add(mf);
      }
    }
  }

  var sqlIdx = 0;
  for (final table in sqlTables) {
    final layerKey = '${table.package}|${table.name}';
    if (hiddenLayerKeys.contains(layerKey)) continue;
    final layerEpsg = layerEpsgByKey?[layerKey] ?? defaultCrsEpsg;
    for (var r = 0; r < table.rows.length; r++) {
      final row = table.rows[r];
      final pt = latLngFromProperties(row, fallbackEpsg: layerEpsg);
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
