import 'package:latlong2/latlong.dart';

import 'qfield_map_features.dart';

String _normId(String? v) {
  if (v == null) return '';
  return v.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
}

bool idsEqual(String? a, String? b) {
  final na = _normId(a);
  final nb = _normId(b);
  return na.isNotEmpty && na == nb;
}

bool isFatLayer(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('fat') && !n.contains('region');
}

bool isHandholeLayer(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('handhole') || n == 'hh';
}

bool isExcavationLayer(String? layerName) {
  final n = (layerName ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  return n.contains('excavation') || n.contains('excav');
}

String? fatIdFromProperties(Map<String, dynamic> props) {
  return _propValue(props, [
    'fat_no',
    'fatno',
    'fat_id',
    'fatid',
    'fat_number',
    'fat_num',
    'fat_name',
    'fdt_no',
    'fdt_id',
    'fdtno',
  ]);
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

/// Canonical FAT id for a feature (FAT point label or foreign-key fields).
String? fatIdFromFeature(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  if (isFatLayer(layer)) {
    return mapLabelForFeature(f.properties, layer) ??
        fatIdFromProperties(f.properties);
  }
  return fatIdFromProperties(f.properties);
}

bool featureBelongsToFat(QFieldMapFeature f, String fatId) {
  if (isFatLayer(f.properties['layer']?.toString())) {
    final self = fatIdFromFeature(f);
    if (self != null && idsEqual(self, fatId)) return true;
  }
  final ref = fatIdFromProperties(f.properties);
  if (ref != null && idsEqual(ref, fatId)) return true;
  return false;
}

Map<String, List<FeatureTapHit>> groupCableHitsByDisplayType(
  List<FeatureTapHit> cableHits,
) {
  final map = <String, List<FeatureTapHit>>{};
  for (final h in cableHits) {
    final label = cableDisplayType(h.feature);
    map.putIfAbsent(label, () => []).add(h);
  }
  final keys = map.keys.toList()..sort();
  return {for (final k in keys) k: map[k]!};
}

const _ductKeys = [
  'no_of_ducts',
  'number_of_ducts',
  'num_ducts',
  'duct_count',
  'ducts',
  'duct_no',
  'numberofducts',
];

const _contractorKeys = [
  'contractor',
  'contractor_name',
  'contractor_co',
  'contractor_company',
  'contractor_id',
];

const _excavationFieldKeys = [
  'excavation',
  'excavation_type',
  'excavation_length',
  'excav_length',
  'trench_length',
  'excavation_depth',
];

/// Excavation depth, duct count, contractor — on routes, FAT, or excavation features.
Map<String, String> siteInfoFieldsFromProperties(Map<String, dynamic> props) {
  return fatSummaryFields(props);
}

Map<String, String> fatSummaryFields(Map<String, dynamic> props) {
  final out = <String, String>{};
  final fatClosures = fatClosuresIdFromProperties(props);
  final fatClosuresKey = fatClosuresIdPropertyKey(props);
  if (fatClosures != null && fatClosuresKey != null) {
    out[fatClosuresKey] = fatClosures;
  }
  for (final e in props.entries) {
    if (e.value == null) continue;
    final lk = e.key.toLowerCase();
    final v = e.value.toString().trim();
    if (v.isEmpty || v == '[binary]') continue;
    if (fatClosuresKey != null && e.key == fatClosuresKey) continue;
    final isDuct = _ductKeys.any((k) => lk.contains(k.replaceAll('_', '')) || lk == k);
    final isContractor =
        _contractorKeys.any((k) => lk.contains('contractor') || lk == k);
    final isExcavField =
        _excavationFieldKeys.any((k) => lk.contains('excav') || lk == k);
    if (isDuct || isContractor || isExcavField) {
      out[e.key] = v;
    }
  }
  return out;
}

Map<String, dynamic> displayPropsForFeature(
  QFieldMapFeature f, {
  Set<String> skipKeys = const {
    'layer',
    'package',
    'packagePath',
    'source',
    'kind',
  },
}) {
  final m = <String, dynamic>{};
  final hideFid = isCableFeature(f) && cableIdFromProperties(f.properties) != null;

  for (final e in f.properties.entries) {
    if (skipKeys.contains(e.key)) continue;
    if (hideFid && e.key.toLowerCase() == 'fid') continue;
    if (e.value == null) continue;
    final s = e.value.toString();
    if (s == '[binary]') continue;
    m[e.key] = e.value;
  }
  if (f.geometryType != null && f.geometryType!.isNotEmpty) {
    m['geometryType'] = f.geometryType;
  }

  if (isCableFeature(f)) {
    final cableKey = cableIdPropertyKey(f.properties);
    final cableId = cableIdFromProperties(f.properties);
    if (cableKey != null && cableId != null) {
      m.remove('fid');
      m.remove('FID');
      final ordered = <String, dynamic>{cableKey: cableId};
      for (final e in m.entries) {
        if (e.key != cableKey) ordered[e.key] = e.value;
      }
      return ordered;
    }
  }

  final layer = f.properties['layer']?.toString();
  if (isHandholeLayerName(layer) && handholeContainsClosure(f.properties)) {
    final closureKey = closureOrOdfIdPropertyKey(f.properties);
    final closureId = closureOrOdfIdFromProperties(f.properties);
    if (closureKey != null && closureId != null) {
      final ordered = <String, dynamic>{closureKey: closureId};
      for (final e in m.entries) {
        if (e.key != closureKey) ordered[e.key] = e.value;
      }
      return ordered;
    }
  }

  if (isFatLayerName(layer)) {
    final closuresKey = fatClosuresIdPropertyKey(f.properties);
    final closuresId = fatClosuresIdFromProperties(f.properties);
    if (closuresKey != null && closuresId != null) {
      final ordered = <String, dynamic>{closuresKey: closuresId};
      for (final e in m.entries) {
        if (e.key != closuresKey) ordered[e.key] = e.value;
      }
      return ordered;
    }
  }

  final sorted = Map.fromEntries(
    m.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
  );
  return sorted;
}

class HandholeTapBundle {
  const HandholeTapBundle({
    required this.handhole,
    required this.cablesByType,
    this.closureOrOdfId,
    this.closurePropertyKey,
  });

  final FeatureTapHit handhole;
  final Map<String, List<FeatureTapHit>> cablesByType;
  final String? closureOrOdfId;
  final String? closurePropertyKey;
}

/// Structured tap detail when an element (e.g. FAT 41) is selected.
class QFieldTapContext {
  const QFieldTapContext({
    required this.selected,
    this.isRouteSelection = false,
    this.routeId,
    this.routeSiteInfo = const {},
    this.routeCablesByType = const {},
    this.fatId,
    this.fatClosuresId,
    this.fatClosuresPropertyKey,
    this.primaryProps = const {},
    this.fatSummary = const {},
    this.handholes = const [],
    this.excavations = const [],
    this.fatCablesByType = const {},
    this.otherLayerGroups = const [],
  });

  final QFieldMapFeature selected;
  final bool isRouteSelection;
  final String? routeId;
  final Map<String, String> routeSiteInfo;
  final Map<String, List<FeatureTapHit>> routeCablesByType;
  final String? fatId;
  final String? fatClosuresId;
  final String? fatClosuresPropertyKey;
  final Map<String, dynamic> primaryProps;
  final Map<String, String> fatSummary;
  final List<HandholeTapBundle> handholes;
  final List<FeatureTapHit> excavations;
  final Map<String, List<FeatureTapHit>> fatCablesByType;
  final List<LayerHitGroup> otherLayerGroups;
}

bool _cableMatchesHandhole(FeatureTapHit cable, FeatureTapHit handhole) {
  final hhId = handholeIdFromProperties(handhole.feature.properties);
  if (hhId != null) {
    final ref = _propValue(cable.feature.properties, [
      'hh_id',
      'handhole_id',
      'from_hh',
      'to_hh',
      'from_handhole',
      'to_handhole',
    ]);
    if (ref != null && idsEqual(ref, hhId)) return true;
  }
  final ha = featureAnchorPoint(handhole.feature);
  final ca = featureAnchorPoint(cable.feature);
  if (ha != null && ca != null) {
    const dist = Distance();
    if (dist(ha, ca) <= 18) return true;
  }
  return false;
}

QFieldTapContext _buildRouteTapContext({
  required QFieldMapFeature selected,
  required List<FeatureTapHit> locationHits,
  required List<QFieldMapFeature> allFeatures,
}) {
  final routeId = routeIdFromProperties(selected.properties) ??
      featureTapListTitle(selected);

  final cables = <FeatureTapHit>[];
  final seen = <String>{};

  void addCable(QFieldMapFeature f) {
    if (!isCableFeature(f)) return;
    if (seen.add(f.id)) {
      cables.add(FeatureTapHit(feature: f, distanceMeters: 0));
    }
  }

  for (final f in allFeatures) {
    if (!isCableFeature(f)) continue;
    if (routeId.isNotEmpty && featureBelongsToRoute(f, routeId)) {
      addCable(f);
      continue;
    }
    if (featureNearRouteGeometry(f, selected)) {
      addCable(f);
    }
  }
  for (final h in locationHits) {
    if (isCableFeature(h.feature)) addCable(h.feature);
  }

  var siteInfo = siteInfoFieldsFromProperties(selected.properties);
  void mergeSite(Map<String, String> extra) {
    for (final e in extra.entries) {
      siteInfo.putIfAbsent(e.key, () => e.value);
    }
  }

  for (final f in allFeatures) {
    final layer = f.properties['layer']?.toString();
    if (!isExcavationLayer(layer) && !isRouteLayerName(layer)) continue;
    if (f.id == selected.id) continue;
    if (routeId.isNotEmpty && featureBelongsToRoute(f, routeId)) {
      mergeSite(siteInfoFieldsFromProperties(f.properties));
      continue;
    }
    if (featureNearRouteGeometry(f, selected, maxMeters: 20)) {
      mergeSite(siteInfoFieldsFromProperties(f.properties));
    }
  }

  return QFieldTapContext(
    selected: selected,
    isRouteSelection: true,
    routeId: routeId,
    routeSiteInfo: siteInfo,
    routeCablesByType: groupCableHitsByDisplayType(cables),
    primaryProps: displayPropsForFeature(selected),
    otherLayerGroups: const [],
  );
}

QFieldTapContext buildTapContext({
  required QFieldMapFeature selected,
  required List<FeatureTapHit> locationHits,
  required List<QFieldMapFeature> allFeatures,
  LatLng? anchor,
}) {
  if (isRouteFeature(selected)) {
    return _buildRouteTapContext(
      selected: selected,
      locationHits: locationHits,
      allFeatures: allFeatures,
    );
  }

  final fatId = fatIdFromFeature(selected) ??
      (isHandholeLayer(selected.properties['layer']?.toString())
          ? fatIdFromProperties(selected.properties)
          : null);

  List<FeatureTapHit> cableHitsForFat() {
    if (fatId == null) {
      return locationHits.where((h) => isCableFeature(h.feature)).toList();
    }
    final out = <FeatureTapHit>[];
    final seen = <String>{};
    for (final f in allFeatures) {
      if (!isCableFeature(f)) continue;
      if (!featureBelongsToFat(f, fatId)) continue;
      if (seen.add(f.id)) {
        out.add(FeatureTapHit(feature: f, distanceMeters: 0));
      }
    }
    for (final h in locationHits) {
      if (!isCableFeature(h.feature)) continue;
      if (seen.add(h.feature.id)) out.add(h);
    }
    return out;
  }

  final allCables = cableHitsForFat();

  List<FeatureTapHit> handholeHits() {
    if (fatId != null) {
      final out = <FeatureTapHit>[];
      final seen = <String>{};
      for (final f in allFeatures) {
        if (!isHandholeLayer(f.properties['layer']?.toString())) continue;
        if (!featureBelongsToFat(f, fatId)) continue;
        if (seen.add(f.id)) {
          out.add(FeatureTapHit(feature: f, distanceMeters: 0));
        }
      }
      for (final h in locationHits) {
        if (!isHandholeLayer(h.feature.properties['layer']?.toString())) continue;
        if (seen.add(h.feature.id)) out.add(h);
      }
      if (out.isNotEmpty) return out;
    }
    return locationHits
        .where((h) => isHandholeLayer(h.feature.properties['layer']?.toString()))
        .toList();
  }

  List<FeatureTapHit> excavationHits() {
    if (fatId != null) {
      final out = <FeatureTapHit>[];
      final seen = <String>{};
      for (final f in allFeatures) {
        if (!isExcavationLayer(f.properties['layer']?.toString())) continue;
        if (!featureBelongsToFat(f, fatId)) continue;
        if (seen.add(f.id)) {
          out.add(FeatureTapHit(feature: f, distanceMeters: 0));
        }
      }
      for (final h in locationHits) {
        if (!isExcavationLayer(h.feature.properties['layer']?.toString())) {
          continue;
        }
        if (seen.add(h.feature.id)) out.add(h);
      }
      return out;
    }
    return locationHits
        .where((h) => isExcavationLayer(h.feature.properties['layer']?.toString()))
        .toList();
  }

  final hhList = handholeHits();
  final assignedCableIds = <String>{};
  final bundles = <HandholeTapBundle>[];

  for (final hh in hhList) {
    final cables = allCables
        .where((c) => _cableMatchesHandhole(c, hh))
        .toList();
    for (final c in cables) {
      assignedCableIds.add(c.feature.id);
    }
    String? closureId;
    String? closureKey;
    if (handholeContainsClosure(hh.feature.properties)) {
      closureId = closureOrOdfIdFromProperties(hh.feature.properties);
      closureKey = closureOrOdfIdPropertyKey(hh.feature.properties);
    }
    bundles.add(
      HandholeTapBundle(
        handhole: hh,
        cablesByType: groupCableHitsByDisplayType(cables),
        closureOrOdfId: closureId,
        closurePropertyKey: closureKey,
      ),
    );
  }

  final unassigned = allCables
      .where((c) => !assignedCableIds.contains(c.feature.id))
      .toList();
  final fatCables = groupCableHitsByDisplayType(unassigned);

  final primaryProps = displayPropsForFeature(selected);
  Map<String, String> summary = {};
  if (isFatLayer(selected.properties['layer']?.toString())) {
    summary = fatSummaryFields(selected.properties);
  } else if (fatId != null) {
    for (final f in allFeatures) {
      if (!isFatLayer(f.properties['layer']?.toString())) continue;
      if (!featureBelongsToFat(f, fatId)) continue;
      summary = fatSummaryFields(f.properties);
      if (summary.isNotEmpty) break;
    }
  }

  final otherGroups = <LayerHitGroup>[];
  final otherHits = locationHits.where((h) {
    final f = h.feature;
    if (f.id == selected.id) return false;
    if (isCableFeature(f)) return false;
    if (isHandholeLayer(f.properties['layer']?.toString())) return false;
    if (isExcavationLayer(f.properties['layer']?.toString())) return false;
    if (fatId != null && isFatLayer(f.properties['layer']?.toString())) {
      if (featureBelongsToFat(f, fatId)) return false;
    }
    return true;
  }).toList();
  otherGroups.addAll(groupHitsByLayer(otherHits));

  String? fatClosuresId;
  String? fatClosuresKey;
  if (isFatLayer(selected.properties['layer']?.toString())) {
    fatClosuresId = fatClosuresIdFromProperties(selected.properties);
    fatClosuresKey = fatClosuresIdPropertyKey(selected.properties);
  } else if (fatId != null) {
    for (final f in allFeatures) {
      if (!isFatLayer(f.properties['layer']?.toString())) continue;
      if (!featureBelongsToFat(f, fatId)) continue;
      fatClosuresId = fatClosuresIdFromProperties(f.properties);
      fatClosuresKey = fatClosuresIdPropertyKey(f.properties);
      if (fatClosuresId != null) break;
    }
  }

  return QFieldTapContext(
    selected: selected,
    fatId: fatId,
    fatClosuresId: fatClosuresId,
    fatClosuresPropertyKey: fatClosuresKey,
    primaryProps: primaryProps,
    fatSummary: summary,
    handholes: bundles,
    excavations: excavationHits(),
    fatCablesByType: fatCables,
    otherLayerGroups: otherGroups,
  );
}

Set<String> relatedCableIdsForContext(QFieldTapContext ctx) {
  final ids = <String>{};
  if (ctx.isRouteSelection) {
    for (final list in ctx.routeCablesByType.values) {
      for (final h in list) {
        ids.add(h.feature.id);
      }
    }
    return ids;
  }
  for (final hh in ctx.handholes) {
    for (final list in hh.cablesByType.values) {
      for (final h in list) {
        ids.add(h.feature.id);
      }
    }
  }
  for (final list in ctx.fatCablesByType.values) {
    for (final h in list) {
      ids.add(h.feature.id);
    }
  }
  return ids;
}
