import 'package:flutter/material.dart';
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

String? _propValue(Map<String, dynamic> props, Iterable<String> keys) {
  for (final want in keys) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return s;
    }
  }
  return null;
}

const _cableIdKeys = [
  'cable_id',
  'cableid',
  'cable_no',
  'cableno',
  'cable_number',
  'cable_num',
  'cable_name',
  'cable_code',
  'cableid_no',
  'fibercable_id',
  'fiber_cable_id',
  'fiber_id',
  'fiberid',
  'line_id',
  'line_no',
  'segment_id',
  'segment_no',
  'foc_id',
  'foc_no',
  'pulling_id',
  'pulling_no',
  'name',
  'label',
  'code',
];

const _routeIdKeys = [
  'route_id',
  'routeid',
  'route_no',
  'routeno',
  'route_number',
  'route_num',
  'route_name',
  'route_code',
  'trench_id',
  'trench_no',
  'excavation_id',
  'excavation_no',
];

String? routeIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, _routeIdKeys);
}

String? routeIdPropertyKey(Map<String, dynamic> props) {
  for (final want in _routeIdKeys) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return e.key;
    }
  }
  return null;
}

bool isRouteLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('route')) return true;
  if (n.contains('excavation') || n.contains('excav')) return true;
  if (n.contains('trench')) return true;
  if (n.contains('duct') && !n.contains('product')) return true;
  return false;
}

bool _idsEqual(String? a, String? b) {
  final na = (a ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  final nb = (b ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return na.isNotEmpty && na == nb;
}

/// Trench / excavation / route polyline (not a fiber cable).
bool isRouteFeature(QFieldMapFeature f) {
  if (isCableLayer(f.properties['layer']?.toString())) return false;
  final layer = f.properties['layer']?.toString();
  final hasLine = f.polylines.any((l) => l.length >= 2);
  if (!hasLine) return false;
  if (isRouteLayerName(layer)) return true;
  if (routeIdFromProperties(f.properties) != null) return true;
  return false;
}

bool featureBelongsToRoute(QFieldMapFeature f, String routeId) {
  final ref = routeIdFromProperties(f.properties);
  if (ref != null && _idsEqual(ref, routeId)) return true;
  return false;
}

/// Shortest distance from a point to a route polyline (meters).
double distancePointToRoutePolyline(LatLng point, QFieldMapFeature route) {
  var best = double.infinity;
  for (final line in route.polylines) {
    if (line.length < 2) continue;
    for (var i = 0; i < line.length - 1; i++) {
      final d = _distancePointToSegment(point, line[i], line[i + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/// Cable line runs along / near the selected route geometry.
bool featureNearRouteGeometry(
  QFieldMapFeature feature,
  QFieldMapFeature route, {
  double maxMeters = 35,
}) {
  if (route.polylines.isEmpty) return false;
  for (final line in feature.polylines) {
    for (final p in line) {
      if (distancePointToRoutePolyline(p, route) <= maxMeters) return true;
    }
  }
  for (final p in feature.points) {
    if (distancePointToRoutePolyline(p, route) <= maxMeters) return true;
  }
  return false;
}

String? cableIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, _cableIdKeys);
}

/// Original attribute column name for the cable identifier (e.g. `cable_id`).
String? cableIdPropertyKey(Map<String, dynamic> props) {
  for (final want in _cableIdKeys) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return e.key;
    }
  }
  return null;
}

bool _isCableLayerName(String? layerName) {
  return isCableLayer(layerName);
}

String? labelFromProperties(Map<String, dynamic> props) {
  final layer = props['layer']?.toString();
  final fromLayer = mapLabelForFeature(props, layer);
  if (fromLayer != null) return fromLayer;

  if (_isCableLayerName(layer)) {
    final cableId = cableIdFromProperties(props);
    if (cableId != null) return cableId;
  }

  const prefer = ['name', 'label', 'title', 'id', 'code', 'Name', 'LABEL'];
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

/// ID / number shown on the map for poles, FAT, closures, handholes.
String? mapLabelForFeature(Map<String, dynamic> props, String? layerName) {
  final n = (layerName ?? props['layer']?.toString() ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'\s+'), '');

  if (n.contains('pole')) {
    return poleFatLabel(props);
  }
  if (isHoleLayerName(layerName)) {
    return holeIdFromProperties(props) ??
        _propValue(props, ['id', 'name', 'label', 'code']);
  }
  if (isPassiveCabinetLayerName(layerName)) {
    return cabIdFromProperties(props);
  }
  if ((n.contains('fat') || n.contains('fdt')) && !n.contains('region')) {
    return fatIdFromProperties(props) ??
        cabIdFromProperties(props) ??
        _propValue(props, [
          'fat_no',
          'fatno',
          'fat_id',
          'fatid',
          'fat_number',
          'fat_num',
          'fat_name',
          'fdt_no',
          'fdt_id',
          'name',
          'label',
          'code',
        ]);
  }
  if (n.contains('closure') || n.contains('odf')) {
    return closureOrOdfIdFromProperties(props);
  }
  if (isFdtFatClosureLayerName(layerName)) {
    return closureOrOdfIdFromProperties(props);
  }
  if (n.contains('handhole') || n == 'hh') {
    return handholeIdFromProperties(props) ??
        holeIdFromProperties(props) ??
        _propValue(props, ['id', 'name', 'label']);
  }
  if (isCableLayer(layerName) || n.contains('ftth') || (n.contains('fiber') && !n.contains('region'))) {
    return cableIdFromProperties(props);
  }
  return null;
}

bool isPoleLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('pole') || n.contains('utilitypole') || n.contains('supportstructure');
}

bool isPassiveCabinetLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), '');
  return n.contains('passivecabinet') ||
      n == 'passive_cabinet' ||
      (n.contains('passive') && n.contains('cabinet'));
}

bool isClosureLayerName(String? layerName) {
  if (isPassiveCabinetLayerName(layerName)) return false;
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('handhole') || n == 'hh') return false;
  return n.contains('closure') || n.contains('odf');
}

bool isFdtFatLayerName(String? layerName) {
  if (isHoleLayerName(layerName)) return false;
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return (n.contains('fat') || n.contains('fdt')) && !n.contains('region');
}

bool isHoleLayerName(String? layerName) {
  if (isHandholeLayerName(layerName)) return false;
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), '');
  if (n.contains('fdthole') || n == 'fdtholes') return true;
  if (n.contains('hole') && !n.contains('handhole')) return true;
  return false;
}

/// GIS keys / layer names that store hole numbers (shown as "Hole ID" in UI).
const _holeIdValueKeys = [
  'hole_id',
  'Hole_ID',
  'hole_no',
  'holeid',
  'hole_number',
  'hole_num',
  'fdt_holes',
  'FDT_Holes',
  'fdt_hole_id',
  'fdt_hole_no',
];

/// Whether [propertyKey] is a hole-ID attribute (not the layer name shown raw).
bool isHoleIdPropertyKey(String? propertyKey) {
  if (propertyKey == null || propertyKey.trim().isEmpty) return true;
  final k = propertyKey.trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), '');
  if (k == 'layer' || k == 'package') return false;
  for (final want in _holeIdValueKeys) {
    if (k == want.toLowerCase().replaceAll(RegExp(r'[\s_]+'), '')) return true;
  }
  if (k.contains('hole') && !k.contains('handhole')) return true;
  return false;
}

/// User-facing label for hole-ID rows (never "FDT_Holes").
String holeIdDisplayLabel(String? rawPropertyKey, {String fallback = 'Hole ID'}) {
  if (rawPropertyKey == null || isHoleIdPropertyKey(rawPropertyKey)) {
    return fallback;
  }
  return rawPropertyKey;
}

bool shouldShowMapLabel(String? layerName) {
  if (isPoleLayerName(layerName)) return false;
  if (isPassiveCabinetLayerName(layerName)) return true;
  if (isFdtFatLayerName(layerName)) return true;
  if (isClosureLayerName(layerName)) return true;
  if (isHandholeLayerName(layerName)) return true;
  if (isHoleLayerName(layerName)) return true;
  return false;
}

/// CAB_ID inside a slightly larger on-map box (passive cabinet layers).
bool useCabinetBoxMapLabel(String? layerName) => isPassiveCabinetLayerName(layerName);

/// Text-only on-map label (FAT / handhole / pole→FAT ref).
bool useCompactMapLabel(String? layerName) {
  if (isClosureLayerName(layerName)) return false;
  if (isFdtFatLayerName(layerName)) return true;
  if (isHandholeLayerName(layerName)) return true;
  return false;
}

/// Small red circle badge + white ID (closures / ODF / FDT closure layers).
bool useClosureCircleMapLabel(String? layerName) {
  return isClosureLayerName(layerName) || isFdtFatClosureLayerName(layerName);
}

@Deprecated('Use useClosureCircleMapLabel')
bool useClosureBoxMapLabel(String? layerName) => useClosureCircleMapLabel(layerName);

String? cabIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, [
    'cab_id',
    'CAB_ID',
    'cabid',
    'cab_no',
    'cabno',
    'cab_number',
    'cab_num',
    'cabinet_id',
    'cabinet_no',
  ]);
}

String? fatIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, [
    'fat_id',
    'FAT_ID',
    'fat_no',
    'fatno',
    'fatid',
    'fat_number',
    'fat_num',
    'fat_name',
    'fdt_no',
    'fdt_id',
    'fdtno',
  ]);
}

/// Pole points: show linked FAT id when present (never pole_no on map).
String? poleFatLabel(Map<String, dynamic> props) {
  return fatIdFromProperties(props);
}

bool isCableFeature(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  if (isCableLayer(layer)) return true;
  final n = (layer ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('ftth')) return true;
  return _propValue(f.properties, ['cable_type', 'cabletype', 'fiber_count']) != null;
}

String cableDisplayType(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  final fromProps = _propValue(f.properties, [
    'cable_type',
    'cabletype',
    'cable_size',
    'fiber_count',
    'type',
    'ftth_type',
    'name',
  ]);
  if (fromProps != null && fromProps.isNotEmpty) {
    final p = fromProps.toLowerCase().replaceAll(RegExp(r'\s+'), '');
    if (p.contains('12f') || p == '12') return '12F';
    if (p.contains('24f') || p == '24') return '24F';
    if (p.contains('36f') || p == '36') return '36F';
    if (p.contains('48f') || p == '48') return '48F';
    if (p.contains('pulling')) return 'Pulling FOC';
    if (p.contains('foc')) return 'FOC';
    return fromProps;
  }
  return cableTypeLabel(layer);
}

Color cableTypeColorForLabel(String label) {
  final n = label.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('12f') || n == '12') return const Color(0xFFE53935);
  if (n.contains('24f') || n == '24') return const Color(0xFF1E88E5);
  if (n.contains('36f') || n == '36') return const Color(0xFF8E24AA);
  if (n.contains('48f') || n == '48') return const Color(0xFFFF8F00);
  if (n.contains('pulling')) return const Color(0xFFD32F2F);
  if (n.contains('foc')) return const Color(0xFFC62828);
  return const Color(0xFFE53935);
}

Color cableDisplayColor(QFieldMapFeature f) {
  return cableTypeColorForLabel(cableDisplayType(f));
}

/// Toggle chips for cable types and individual cable IDs on the map.
class CableMapToggle {
  const CableMapToggle({
    required this.key,
    required this.label,
    required this.color,
    required this.isTypeGroup,
    this.count = 1,
  });

  final String key;
  final String label;
  final Color color;
  final bool isTypeGroup;
  final int count;
}

List<CableMapToggle> buildCableMapToggles(List<QFieldMapFeature> features) {
  final types = <String, ({String label, Color color, int count})>{};
  final ids = <String, CableMapToggle>{};

  for (final f in features) {
    final layer = f.properties['layer']?.toString();
    if (!isCableFeature(f) && !isCableLayer(layer)) continue;

    final typeLabel = cableDisplayType(f);
    final typeKey = 'ctype:$typeLabel';
    final existing = types[typeKey];
    types[typeKey] = (
      label: typeLabel,
      color: cableTypeColorForLabel(typeLabel),
      count: (existing?.count ?? 0) + 1,
    );

    final cid = cableIdFromProperties(f.properties);
    if (cid != null && cid.isNotEmpty) {
      ids[f.id] = CableMapToggle(
        key: 'cid:${f.id}',
        label: cid,
        color: cableDisplayColor(f),
        isTypeGroup: false,
      );
    }
  }

  final out = <CableMapToggle>[
    for (final e in types.entries)
      CableMapToggle(
        key: e.key,
        label: e.value.label,
        color: e.value.color,
        isTypeGroup: true,
        count: e.value.count,
      ),
    ...ids.values,
  ];
  out.sort((a, b) {
    if (a.isTypeGroup != b.isTypeGroup) return a.isTypeGroup ? -1 : 1;
    return a.label.compareTo(b.label);
  });
  return out;
}

bool isCableFeatureVisible(
  QFieldMapFeature f, {
  required Set<String> hiddenLayerKeys,
  required Set<String> hiddenCableTypeKeys,
  required Set<String> hiddenCableIdKeys,
}) {
  if (hiddenLayerKeys.contains(f.layerKey)) return false;
  final layer = f.properties['layer']?.toString();
  if (!isCableFeature(f) && !isCableLayer(layer)) return true;
  final typeKey = 'ctype:${cableDisplayType(f)}';
  if (hiddenCableTypeKeys.contains(typeKey)) return false;
  if (hiddenCableIdKeys.contains(f.id)) return false;
  return true;
}

bool isHandholeLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('handhole') || n == 'hh';
}

String? handholeIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, [
    'hh_id',
    'hh_no',
    'hhid',
    'handhole_id',
    'handhole_no',
    'handholeid',
    'hh_number',
  ]);
}

String? holeIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, _holeIdValueKeys);
}

String? holeIdPropertyKey(Map<String, dynamic> props) {
  for (final want in _holeIdValueKeys) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return e.key;
    }
  }
  return null;
}

const _closureOrOdfIdKeys = [
  'closure_or_odf_id',
  'clouser_or_odf_id',
  'closure_odf_id',
  'closureorodfid',
  'closure_or_odf',
  'odf_id',
  'odf_no',
  'odf_number',
  'closure_id',
  'closure_no',
];

const _fatClosuresIdKeys = [
  'fat_closures_id',
  'fat_clousers_id',
  'fat_closure_id',
  'fat_closures_ids',
  'fat_closure_ids',
  'fat_clouser_id',
  'closures_id',
];

/// Closure / ODF identifier — prefers `Closure_OR_ODF_ID`, falls back to FAT closure fields.
String? closureOrOdfIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, _closureOrOdfIdKeys) ??
      _propValue(props, _fatClosuresIdKeys);
}

String? closureOrOdfIdPropertyKey(Map<String, dynamic> props) {
  for (final want in [..._closureOrOdfIdKeys, ..._fatClosuresIdKeys]) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return e.key;
    }
  }
  return null;
}

/// Layer names like "FDT Closure", "FAT_Closure" (not generic handholes).
bool isFdtFatClosureLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (isHandholeLayerName(layerName)) return false;
  final hasClosure = n.contains('closure') || n.contains('clos') || n.contains('odf');
  final hasFdtFat = n.contains('fdt') || n.contains('fat');
  return hasClosure && (hasFdtFat || isClosureLayerName(layerName));
}

String? fatClosuresIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, _fatClosuresIdKeys);
}

String? fatClosuresIdPropertyKey(Map<String, dynamic> props) {
  for (final want in _fatClosuresIdKeys) {
    for (final e in props.entries) {
      if (e.key.toLowerCase() != want.toLowerCase()) continue;
      final v = e.value;
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isEmpty || s == '[binary]') continue;
      return e.key;
    }
  }
  return null;
}

/// Handhole record has closure / ODF (attribute or non-empty closure_or_odf_id).
bool handholeContainsClosure(Map<String, dynamic> props) {
  final closureId = closureOrOdfIdFromProperties(props);
  if (closureId != null && closureId.isNotEmpty) return true;

  for (final e in props.entries) {
    final lk = e.key.toLowerCase();
    if (lk.contains('fat_closure')) continue;
    if (!lk.contains('closure') && !lk.contains('odf')) continue;
    if (lk == 'layer' || lk == 'package') continue;

    final v = e.value;
    if (v == null) continue;
    final s = v.toString().trim().toLowerCase();
    if (s.isEmpty || s == '[binary]') continue;

    if (lk.contains('has_') ||
        lk.contains('contain') ||
        lk == 'closures' ||
        lk == 'closure') {
      if (s == 'yes' || s == 'true' || s == '1' || s == 'y') return true;
      if (s != 'no' && s != 'false' && s != '0' && s != 'n') {
        if (s.length <= 64) return true;
      }
    }
  }
  return false;
}

/// Title in the tap list (ID/number first, then layer).
String featureTapListTitle(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  if (isRouteFeature(f)) {
    final routeId = routeIdFromProperties(f.properties);
    if (routeId != null && routeId.isNotEmpty) return routeId;
  }
  if (_isCableLayerName(layer)) {
    final cableId = cableIdFromProperties(f.properties);
    if (cableId != null && cableId.isNotEmpty) return cableId;
  }
  if (isClosureLayerName(layer) ||
      isFdtFatClosureLayerName(layer) ||
      (layer != null && handholeContainsClosure(f.properties))) {
    final closureId = closureOrOdfIdFromProperties(f.properties);
    if (closureId != null && closureId.isNotEmpty) return closureId;
  }
  if (isHoleLayerName(layer)) {
    final holeId = holeIdFromProperties(f.properties);
    if (holeId != null && holeId.isNotEmpty) return holeId;
  }
  if (isPassiveCabinetLayerName(layer)) {
    final cab = cabIdFromProperties(f.properties);
    if (cab != null && cab.isNotEmpty) return cab;
  }
  if (isFdtFatLayerName(layer) && !isFdtFatClosureLayerName(layer)) {
    final fatId = fatIdFromProperties(f.properties);
    if (fatId != null && fatId.isNotEmpty) return fatId;
  }
  final id = mapLabelForFeature(f.properties, layer);
  if (id != null && id.isNotEmpty) {
    final lk = id.toLowerCase();
    if (lk != 'fid' && !lk.startsWith('gj_')) return id;
  }
  if (_isCableLayerName(layer)) {
    final cableId = cableIdFromProperties(f.properties);
    if (cableId != null && cableId.isNotEmpty) return cableId;
  }
  return layer?.trim().isNotEmpty == true ? layer! : f.id;
}

String featureTapListSubtitle(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString().trim() ?? '';
  final props = f.properties;
  final parts = <String>[];

  if (isHandholeLayerName(layer)) {
    final holeId = holeIdFromProperties(props);
    if (holeId != null && holeId.isNotEmpty) {
      parts.add('Hole ID $holeId');
    }
    if (handholeContainsClosure(props)) {
      final closureId = closureOrOdfIdFromProperties(props);
      if (closureId != null && closureId.isNotEmpty) {
        parts.add('Closure/ODF $closureId');
      } else {
        parts.add('Closure/ODF');
      }
    }
  }

  if (isHoleLayerName(layer)) {
    final holeId = holeIdFromProperties(props);
    if (holeId != null && holeId.isNotEmpty) {
      parts.add('Hole ID $holeId');
    }
    final gt = f.geometryType;
    if (gt != null && gt.isNotEmpty) parts.add(gt);
    final pkg = props['package']?.toString().trim() ?? '';
    if (pkg.isNotEmpty) parts.add(pkg);
    return parts.isEmpty ? f.source : parts.join(' · ');
  }

  if (isFatLayerName(layer) || isFdtFatLayerName(layer)) {
    final closureId = closureOrOdfIdFromProperties(props);
    if (closureId != null && closureId.isNotEmpty) {
      parts.add('Closure/ODF $closureId');
    }
  }

  final pkg = props['package']?.toString().trim() ?? '';
  if (isClosureLayerName(layer) || isFdtFatClosureLayerName(layer)) {
    if (parts.isNotEmpty) return parts.join(' · ');
    final gt = f.geometryType;
    if (gt != null && gt.isNotEmpty) return gt;
    return f.source;
  }

  final gt = f.geometryType;
  if (layer.isNotEmpty &&
      !isClosureLayerName(layer) &&
      !isFdtFatClosureLayerName(layer)) {
    parts.add(layer);
  }
  if (pkg.isNotEmpty && pkg != layer) parts.add(pkg);
  if (gt != null && gt.isNotEmpty) parts.add(gt);
  return parts.isEmpty ? f.source : parts.join(' · ');
}

bool isFatLayerName(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('fat') && !n.contains('region');
}

/// All features within [maxMeters] of [point] (same location cluster).
List<FeatureTapHit> featuresNearPoint(
  List<QFieldMapFeature> features,
  LatLng point, {
  double maxMeters = 12,
}) {
  final hits = <FeatureTapHit>[];
  for (final f in features) {
    if (!f.hasGeometry) continue;
    final d = distanceFeatureToTap(f, point);
    if (d <= maxMeters) hits.add(FeatureTapHit(feature: f, distanceMeters: d));
  }
  hits.sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
  return hits;
}

LatLng? featureAnchorPoint(QFieldMapFeature f) {
  for (final p in f.points) {
    return p;
  }
  for (final line in f.polylines) {
    if (line.isNotEmpty) return line.first;
  }
  for (final ring in f.polygons) {
    if (ring.isNotEmpty) return ring.first;
  }
  return null;
}

/// GIS layer table names for fiber / cable line layers.
bool isCableLayer(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('cable')) return true;
  if (n.contains('pullingfoc')) return true;
  if (n.contains('ftth')) return true;
  if (n.contains('fiber') && !n.contains('region')) return true;
  if (n == 'foc' || n.endsWith('_foc')) return true;
  return false;
}

/// Display name for cable type grouping (12F, 24F, Pulling FOC, …).
String cableTypeLabel(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('cable12') || n.contains('12f')) return '12F';
  if (n.contains('cable24') || n.contains('24f')) return '24F';
  if (n.contains('cable36') || n.contains('36f')) return '36F';
  if (n.contains('cable48') || n.contains('48f')) return '48F';
  if (n.contains('pullingfoc')) return 'Pulling FOC';
  if (n == 'foc' || n.endsWith('_foc')) return 'FOC';
  if (n.contains('cable')) return layerName?.trim() ?? 'Cable';
  return layerName?.trim() ?? 'Line';
}

/// Distinct map color per cable layer type.
Color cableTypeColor(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('cable12') || n.contains('12f')) return const Color(0xFFE53935);
  if (n.contains('cable24') || n.contains('24f')) return const Color(0xFF1E88E5);
  if (n.contains('cable36') || n.contains('36f')) return const Color(0xFF8E24AA);
  if (n.contains('cable48') || n.contains('48f')) return const Color(0xFFFF8F00);
  if (n.contains('pullingfoc')) return const Color(0xFFD32F2F);
  if (n == 'foc' || n.endsWith('_foc')) return const Color(0xFFC62828);
  return const Color(0xFFE53935);
}

class LayerHitGroup {
  const LayerHitGroup({
    required this.layerKey,
    required this.layerName,
    required this.hits,
  });

  final String layerKey;
  final String layerName;
  final List<FeatureTapHit> hits;
}

List<LayerHitGroup> groupHitsByLayer(List<FeatureTapHit> hits) {
  final map = <String, List<FeatureTapHit>>{};
  for (final h in hits) {
    map.putIfAbsent(h.feature.layerKey, () => []).add(h);
  }
  final groups = map.entries.map((e) {
    final layerName =
        e.value.first.feature.properties['layer']?.toString().trim() ??
        e.key.split('|').last;
    return LayerHitGroup(
      layerKey: e.key,
      layerName: layerName.isEmpty ? e.key : layerName,
      hits: e.value,
    );
  }).toList();
  groups.sort((a, b) {
    final ac = isCableLayer(a.layerName);
    final bc = isCableLayer(b.layerName);
    if (ac != bc) return ac ? 1 : -1;
    return a.layerName.compareTo(b.layerName);
  });
  return groups;
}

/// Cable line features near [anchor] for the selected element.
List<FeatureTapHit> cableHitsNearPoint(
  List<QFieldMapFeature> features,
  LatLng anchor, {
  double maxMeters = 40,
}) {
  return featuresNearPoint(features, anchor, maxMeters: maxMeters)
      .where((h) => isCableLayer(h.feature.properties['layer']?.toString()))
      .toList();
}

Map<String, List<FeatureTapHit>> groupCableHitsByType(List<FeatureTapHit> cableHits) {
  final map = <String, List<FeatureTapHit>>{};
  for (final h in cableHits) {
    final label = cableTypeLabel(h.feature.properties['layer']?.toString());
    map.putIfAbsent(label, () => []).add(h);
  }
  final keys = map.keys.toList()..sort();
  return {for (final k in keys) k: map[k]!};
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
      label: mapLabelForFeature(props, props['layer']?.toString()) ??
          labelFromProperties(props),
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
