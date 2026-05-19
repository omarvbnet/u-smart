import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../widgets/qfield_map_symbols.dart';
import 'qfield_map_features.dart';

/// Builds on-map ID labels (handhole / hole / closure circle / FAT text).
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
    final props = f.properties;

    final labels = <_LabelSpec>[];

    if (isPoleLayerName(layerName)) {
      final t = poleFatLabel(props);
      if (t != null && t.isNotEmpty) {
        labels.add(_LabelSpec(text: t, textOnly: true));
      }
    } else if (shouldShowMapLabel(layerName)) {
      if (isHandholeLayerName(layerName)) {
        final hh = handholeIdFromProperties(props);
        final hole = holeIdFromProperties(props);
        if (hh != null && hh.isNotEmpty) {
          labels.add(_LabelSpec(text: hh, textOnly: true));
        }
        if (hole != null &&
            hole.isNotEmpty &&
            hole.toLowerCase() != (hh ?? '').toLowerCase()) {
          labels.add(_LabelSpec(text: hole, textOnly: true));
        }
        if (handholeContainsClosure(props)) {
          final closureId = closureOrOdfIdFromProperties(props);
          if (closureId != null && closureId.isNotEmpty) {
            labels.add(_LabelSpec(text: closureId, closureCircle: true));
          }
        }
        if (labels.isEmpty) {
          final fallback = mapLabelForFeature(props, layerName);
          if (fallback != null && fallback.isNotEmpty) {
            labels.add(_LabelSpec(text: fallback, textOnly: true));
          }
        }
      } else if (isHoleLayerName(layerName)) {
        final hole = holeIdFromProperties(props);
        if (hole != null && hole.isNotEmpty) {
          labels.add(_LabelSpec(text: hole, textOnly: true));
        }
      } else if (useClosureCircleMapLabel(layerName)) {
        final t = closureOrOdfIdFromProperties(props);
        if (t != null && t.isNotEmpty) {
          labels.add(_LabelSpec(text: t, closureCircle: true));
        }
      } else if (isFdtFatLayerName(layerName) && !isFdtFatClosureLayerName(layerName)) {
        final closureId = closureOrOdfIdFromProperties(props);
        if (closureId != null && closureId.isNotEmpty) {
          labels.add(_LabelSpec(text: closureId, closureCircle: true));
        }
        final cab = cabIdFromProperties(props);
        if (cab != null && cab.isNotEmpty) {
          labels.add(_LabelSpec(text: cab, textOnly: true));
        }
      } else {
        final t = mapLabelForFeature(props, layerName) ?? f.label;
        if (t != null && t.isNotEmpty) {
          labels.add(_LabelSpec(text: t, textOnly: true));
        }
      }
    }

    var stack = 0.0;
    for (final pt in f.points) {
      stack = 0;
      for (final spec in labels) {
        final h = spec.closureCircle ? 26.0 : 22.0;
        final w = spec.closureCircle ? 26.0 : 50.0;
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

class _LabelSpec {
  const _LabelSpec({
    required this.text,
    this.textOnly = false,
    this.closureCircle = false,
  });

  final String text;
  final bool textOnly;
  final bool closureCircle;
}
