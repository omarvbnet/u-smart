import 'package:flutter/material.dart';
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

/// Cable type from layer name and/or attribute columns (for combined FTTH layers).
String cableDisplayType(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  final fromProps = _propValue(f.properties, [
    'cable_type',
    'cabletype',
    'cable_size',
    'cablesize',
    'fiber',
    'fibers',
    'fiber_count',
    'fiber_count_',
    'fibre',
    'fibre_type',
    'type',
    'ftth_type',
    'cable',
    'strand',
    'size',
    'description',
    'name',
  ]);
  if (fromProps != null && fromProps.isNotEmpty) {
    final p = fromProps.toLowerCase().replaceAll(RegExp(r'\s+'), '');
    if (p.contains('12f') || p == '12' || p.contains('cable12')) return '12F';
    if (p.contains('24f') || p == '24' || p.contains('cable24')) return '24F';
    if (p.contains('36f') || p == '36' || p.contains('cable36')) return '36F';
    if (p.contains('48f') || p == '48' || p.contains('cable48')) return '48F';
    if (p.contains('pulling')) return 'Pulling FOC';
    if (p.contains('foc')) return 'FOC';
    if (RegExp(r'^\d+f$').hasMatch(p)) return fromProps.toUpperCase();
    return fromProps;
  }
  return cableTypeLabel(layer);
}

Color cableDisplayColor(QFieldMapFeature f) {
  return cableTypeColorForLabel(cableDisplayType(f));
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

bool isCableFeature(QFieldMapFeature f) {
  final layer = f.properties['layer']?.toString();
  if (isCableLayer(layer)) return true;
  final n = (layer ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  if (n.contains('ftth')) return true;
  return _propValue(f.properties, ['cable_type', 'cabletype', 'fiber_count']) != null;
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

Map<String, String> fatSummaryFields(Map<String, dynamic> props) {
  final out = <String, String>{};
  for (final e in props.entries) {
    if (e.value == null) continue;
    final lk = e.key.toLowerCase();
    final v = e.value.toString().trim();
    if (v.isEmpty || v == '[binary]') continue;
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
  for (final e in f.properties.entries) {
    if (skipKeys.contains(e.key)) continue;
    if (e.value == null) continue;
    final s = e.value.toString();
    if (s == '[binary]') continue;
    m[e.key] = e.value;
  }
  if (f.geometryType != null && f.geometryType!.isNotEmpty) {
    m['geometryType'] = f.geometryType;
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
  });

  final FeatureTapHit handhole;
  final Map<String, List<FeatureTapHit>> cablesByType;
}

/// Structured tap detail when an element (e.g. FAT 41) is selected.
class QFieldTapContext {
  const QFieldTapContext({
    required this.selected,
    this.fatId,
    this.primaryProps = const {},
    this.fatSummary = const {},
    this.handholes = const [],
    this.excavations = const [],
    this.fatCablesByType = const {},
    this.otherLayerGroups = const [],
  });

  final QFieldMapFeature selected;
  final String? fatId;
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

QFieldTapContext buildTapContext({
  required QFieldMapFeature selected,
  required List<FeatureTapHit> locationHits,
  required List<QFieldMapFeature> allFeatures,
  LatLng? anchor,
}) {
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
    bundles.add(
      HandholeTapBundle(
        handhole: hh,
        cablesByType: groupCableHitsByDisplayType(cables),
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

  return QFieldTapContext(
    selected: selected,
    fatId: fatId,
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
