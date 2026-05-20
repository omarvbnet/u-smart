import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../widgets/qfield_map_symbols.dart';
import 'qfield_map_features.dart';

/// Label placement for one map point feature.
class QFieldPointLabelSpec {
  const QFieldPointLabelSpec({
    required this.text,
    this.textOnly = false,
    this.closureCircle = false,
    this.cabinetBox = false,
    this.boldBlackId = false,
  });

  final String text;
  final bool textOnly;
  final bool closureCircle;
  final bool cabinetBox;
  /// FAT / handhole / hole / closure IDs — larger bold black text.
  final bool boldBlackId;
}

/// Resolve which labels to show for a layer / properties bundle.
List<QFieldPointLabelSpec> qfieldPointLabelSpecs({
  required Map<String, dynamic> props,
  required String? layerName,
}) {
  final labels = <QFieldPointLabelSpec>[];

  if (isPoleLayerName(layerName)) {
    final t = poleFatLabel(props);
    if (t != null && t.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: t, textOnly: true));
    }
    return labels;
  }

  if (!shouldShowMapLabel(layerName)) return labels;

  if (isHandholeLayerName(layerName)) {
    final hh = handholeIdFromProperties(props);
    final hole = holeIdFromProperties(props);
    if (hh != null && hh.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: hh, textOnly: true, boldBlackId: true));
    }
    if (hole != null &&
        hole.isNotEmpty &&
        hole.toLowerCase() != (hh ?? '').toLowerCase()) {
      labels.add(QFieldPointLabelSpec(text: hole, textOnly: true, boldBlackId: true));
    }
    if (handholeContainsClosure(props)) {
      final closureId = closureOrOdfIdFromProperties(props);
      if (closureId != null && closureId.isNotEmpty) {
        labels.add(
          QFieldPointLabelSpec(text: closureId, closureCircle: true, boldBlackId: true),
        );
      }
    }
    if (labels.isEmpty) {
      final fallback = mapLabelForFeature(props, layerName);
      if (fallback != null && fallback.isNotEmpty) {
        labels.add(QFieldPointLabelSpec(text: fallback, textOnly: true));
      }
    }
    return labels;
  }

  if (isHoleLayerName(layerName)) {
    final hole = holeIdFromProperties(props);
    if (hole != null && hole.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: hole, textOnly: true, boldBlackId: true));
    }
    final closureId = closureOrOdfIdFromProperties(props);
    if (closureId != null && closureId.isNotEmpty) {
      labels.add(
        QFieldPointLabelSpec(text: closureId, closureCircle: true, boldBlackId: true),
      );
    } else if (handholeContainsClosure(props)) {
      labels.add(
        const QFieldPointLabelSpec(text: '', closureCircle: true, boldBlackId: true),
      );
    }
    if (labels.isEmpty) {
      final fallback = mapLabelForFeature(props, layerName);
      if (fallback != null &&
          fallback.isNotEmpty &&
          !fallback.toLowerCase().contains('fdt_hole')) {
        labels.add(QFieldPointLabelSpec(text: fallback, textOnly: true));
      }
    }
    return labels;
  }

  if (isPassiveCabinetLayerName(layerName)) {
    final cab = cabIdFromProperties(props);
    if (cab != null && cab.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: cab, cabinetBox: true));
    }
    return labels;
  }

  if (useClosureCircleMapLabel(layerName)) {
    final t = closureOrOdfIdFromProperties(props);
    if (t != null && t.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: t, closureCircle: true, boldBlackId: true));
    }
    return labels;
  }

  if (isFdtFatLayerName(layerName) && !isFdtFatClosureLayerName(layerName)) {
    final fatId = fatIdFromProperties(props);
    if (fatId != null && fatId.isNotEmpty) {
      labels.add(QFieldPointLabelSpec(text: fatId, textOnly: true, boldBlackId: true));
    }
    if (handholeContainsClosure(props)) {
      final closureId = closureOrOdfIdFromProperties(props);
      if (closureId != null && closureId.isNotEmpty) {
        labels.add(
          QFieldPointLabelSpec(text: closureId, closureCircle: true, boldBlackId: true),
        );
      }
    }
    return labels;
  }

  final t = mapLabelForFeature(props, layerName);
  if (t != null && t.isNotEmpty) {
    labels.add(QFieldPointLabelSpec(text: t, textOnly: true));
  }
  return labels;
}

double _labelWidth(QFieldPointLabelSpec spec) {
  if (spec.cabinetBox) return 64;
  if (spec.closureCircle) return spec.boldBlackId ? 30 : 26;
  if (spec.boldBlackId) return 58;
  return 50;
}

double _labelHeight(QFieldPointLabelSpec spec) {
  if (spec.cabinetBox) return 30;
  if (spec.closureCircle) return spec.boldBlackId ? 30 : 26;
  if (spec.boldBlackId) return 26;
  return 22;
}

/// Builds on-map ID labels (handhole / hole / closure / CAB box / FAT text).
List<Marker> buildQFieldPointLabelMarkers({
  required List<QFieldMapFeature> features,
  required bool Function(QFieldMapFeature f) isHighlighted,
  required String? Function(QFieldMapFeature f) layerNameFor,
}) {
  final out = <Marker>[];
  for (final f in features) {
    if (f.points.isEmpty) continue;
    final layerName = layerNameFor(f);
    final hi = isHighlighted(f);
    final labels = qfieldPointLabelSpecs(props: f.properties, layerName: layerName);

    for (final pt in f.points) {
      var stack = 0.0;
      for (final spec in labels) {
        final h = _labelHeight(spec);
        final w = _labelWidth(spec);
        out.add(
          Marker(
            point: pt,
            width: w,
            height: h,
            alignment: Alignment.bottomCenter,
            child: Transform.translate(
              offset: Offset(0, -(stack + h)),
              child: QFieldMapPointLabel(
                text: spec.text,
                highlighted: hi,
                closureCircle: spec.closureCircle,
                cabinetBox: spec.cabinetBox,
                boldBlackId: spec.boldBlackId,
              ),
            ),
          ),
        );
        stack += h + 2;
      }
    }
  }
  return out;
}
