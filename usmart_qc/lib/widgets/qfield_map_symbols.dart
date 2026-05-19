import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../utils/qfield_map_features.dart';

/// QField-like symbology keyed by layer / table name from GeoPackage properties.
enum QFieldPointSymbolKind {
  pole,
  fat,
  handhole,
  closure,
  cabinet,
  hole,
  generic,
}

class QFieldPointSymbolStyle {
  const QFieldPointSymbolStyle({
    required this.kind,
    this.width = 22,
    this.height = 26,
    this.showFlag = false,
  });

  final QFieldPointSymbolKind kind;
  final double width;
  final double height;
  final bool showFlag;
}

class QFieldLineSymbolStyle {
  const QFieldLineSymbolStyle({
    required this.color,
    this.strokeWidth = 5.5,
    this.borderColor,
    this.borderStrokeWidth = 7,
  });

  final Color color;
  final double strokeWidth;
  final Color? borderColor;
  final double borderStrokeWidth;
}

class QFieldPolygonSymbolStyle {
  const QFieldPolygonSymbolStyle({
    required this.fill,
    required this.border,
    this.borderWidth = 1.5,
  });

  final Color fill;
  final Color border;
  final double borderWidth;
}

/// Layer names from QGIS / QField exports (FAT, Handholes, Pulling_FOC, etc.).
abstract final class QFieldMapSymbols {
  static const fiberRed = Color(0xFFE53935);
  static const poleGreen = Color(0xFF43A047);
  static const flagPurple = Color(0xFF9C27B0);
  static const fatFill = Colors.white;
  static const fatStroke = Color(0xFFE53935);
  static const regionFill = Color(0xFFC8E6C9);
  static const trenchBrown = Color(0xFF8D6E63);

  static String normalizeLayerName(String? layer) {
    return (layer ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), '');
  }

  static String layerNameFromKey(String layerKey) {
    final i = layerKey.indexOf('|');
    if (i < 0) return layerKey.trim();
    return layerKey.substring(i + 1).trim();
  }

  static QFieldPointSymbolStyle pointStyle(String? layer) {
    final n = normalizeLayerName(layer);
    if (_matches(n, ['pole', 'poles', 'utilitypole', 'supportstructure'])) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.pole,
        width: 20,
        height: 26,
        showFlag: true,
      );
    }
    if (_matches(n, ['handhole', 'handholes', 'hh'])) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.handhole,
        width: 18,
        height: 18,
      );
    }
    if (n.contains('fat') && !n.contains('region')) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.fat,
        width: 18,
        height: 18,
      );
    }
    if (_matches(n, ['closure', 'fdtclosure'])) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.closure,
        width: 20,
        height: 14,
      );
    }
    if (_matches(n, ['passivecabinet', 'cabinet'])) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.cabinet,
        width: 22,
        height: 16,
      );
    }
    if (_matches(n, ['fdtholes', 'holes', 'fdthole'])) {
      return const QFieldPointSymbolStyle(
        kind: QFieldPointSymbolKind.hole,
        width: 14,
        height: 14,
      );
    }
    // Unknown point layers: green triangle (typical QField vertex style).
    return const QFieldPointSymbolStyle(
      kind: QFieldPointSymbolKind.generic,
      width: 18,
      height: 22,
    );
  }

  static QFieldLineSymbolStyle lineStyle(String? layer) {
    final n = normalizeLayerName(layer);
    if (isCableLayer(layer)) {
      final c = cableTypeColor(layer);
      return QFieldLineSymbolStyle(
        color: c,
        strokeWidth: 5.5,
        borderColor: c.withAlpha(90),
        borderStrokeWidth: 8,
      );
    }
    if (n.contains('excavation') || n == 'excavation') {
      return QFieldLineSymbolStyle(
        color: trenchBrown,
        strokeWidth: 4,
        borderColor: trenchBrown.withAlpha(70),
        borderStrokeWidth: 6,
      );
    }
    return QFieldLineSymbolStyle(
      color: fiberRed.withAlpha(220),
      strokeWidth: 4,
      borderColor: fiberRed.withAlpha(60),
      borderStrokeWidth: 6,
    );
  }

  static QFieldPolygonSymbolStyle polygonStyle(String? layer) {
    final n = normalizeLayerName(layer);
    if (n.contains('region') ||
        n.contains('zone') ||
        n.contains('network')) {
      return QFieldPolygonSymbolStyle(
        fill: regionFill.withAlpha(115),
        border: Colors.black87,
      );
    }
    return QFieldPolygonSymbolStyle(
      fill: regionFill.withAlpha(95),
      border: Colors.black54,
    );
  }

  static bool _matches(String n, List<String> keys) {
    for (final k in keys) {
      if (n == k || n.contains(k)) return true;
    }
    return false;
  }
}

/// On-map ID label (FAT / handhole / closure / CAB_ID).
class QFieldMapPointLabel extends StatelessWidget {
  const QFieldMapPointLabel({
    super.key,
    required this.text,
    this.highlighted = false,
    this.closureCircle = false,
  });

  final String text;
  final bool highlighted;
  /// Small red circle + white text (closures / ODF).
  final bool closureCircle;

  @override
  Widget build(BuildContext context) {
    if (closureCircle) {
      return Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: highlighted ? const Color(0xFF6C63FF) : const Color(0xFFE53935),
          border: Border.all(
            color: Colors.white.withAlpha(highlighted ? 255 : 220),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(color: Color(0x66000000), blurRadius: 2, offset: Offset(0, 1)),
          ],
        ),
        alignment: Alignment.center,
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: Text(
            text,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 5.5,
              fontWeight: FontWeight.w700,
              height: 1.0,
            ),
          ),
        ),
      );
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 48),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: highlighted ? const Color(0xFF00D4AA) : Colors.white,
          fontSize: 7,
          fontWeight: FontWeight.w600,
          height: 1.0,
          shadows: const [
            Shadow(color: Color(0xDD000000), blurRadius: 2, offset: Offset(0, 0.5)),
            Shadow(color: Color(0x88000000), blurRadius: 0.5, offset: Offset(0.5, 0)),
          ],
        ),
      ),
    );
  }
}

/// Point marker matching QField project symbology (not a map pin / circle).
class QFieldMapPointIcon extends StatelessWidget {
  const QFieldMapPointIcon({
    super.key,
    required this.layerName,
    this.selected = false,
    this.small = false,
  });

  final String? layerName;
  final bool selected;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final style = QFieldMapSymbols.pointStyle(layerName);
    final scale = small ? 0.82 : 1.0;
    final w = style.width * scale;
    final h = style.height * scale;
    Widget body;
    switch (style.kind) {
      case QFieldPointSymbolKind.pole:
      case QFieldPointSymbolKind.generic:
        body = _PoleTriangleMarker(
          color: QFieldMapSymbols.poleGreen,
          showFlag: style.showFlag,
        );
      case QFieldPointSymbolKind.fat:
      case QFieldPointSymbolKind.handhole:
      case QFieldPointSymbolKind.hole:
        body = _SquareMarker(
          fill: QFieldMapSymbols.fatFill,
          stroke: QFieldMapSymbols.fatStroke,
          strokeWidth: selected ? 2.4 : 1.8,
        );
      case QFieldPointSymbolKind.closure:
      case QFieldPointSymbolKind.cabinet:
        body = _CircleMarker(
          fill: const Color(0xFFE53935),
          stroke: Colors.white,
          strokeWidth: selected ? 2.2 : 1.4,
        );
    }

    final icon = Center(child: body);
    if (!selected) {
      return SizedBox(width: w, height: h, child: icon);
    }
    return SizedBox(
      width: w,
      height: h,
      child: DecoratedBox(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF6C63FF).withAlpha(180),
              blurRadius: 8,
              spreadRadius: 1,
            ),
          ],
        ),
        child: icon,
      ),
    );
  }
}

class _PoleTriangleMarker extends StatelessWidget {
  const _PoleTriangleMarker({
    required this.color,
    required this.showFlag,
  });

  final Color color;
  final bool showFlag;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      alignment: Alignment.bottomCenter,
      children: [
        CustomPaint(
          size: const Size(20, 18),
          painter: _TrianglePainter(color: color),
        ),
        if (showFlag)
          const Positioned(
            top: -2,
            child: Icon(Icons.flag_rounded, size: 11, color: QFieldMapSymbols.flagPurple),
          ),
      ],
    );
  }
}

class _CircleMarker extends StatelessWidget {
  const _CircleMarker({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(14, 14),
      painter: _CirclePainter(
        fill: fill,
        stroke: stroke,
        strokeWidth: strokeWidth,
      ),
    );
  }
}

class _SquareMarker extends StatelessWidget {
  const _SquareMarker({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(16, 16),
      painter: _SquarePainter(
        fill: fill,
        stroke: stroke,
        strokeWidth: strokeWidth,
      ),
    );
  }
}

class _RectMarker extends StatelessWidget {
  const _RectMarker({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(20, 12),
      painter: _RectPainter(
        fill: fill,
        stroke: stroke,
        strokeWidth: strokeWidth,
      ),
    );
  }
}

class _TrianglePainter extends CustomPainter {
  _TrianglePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = ui.Path()
      ..moveTo(size.width / 2, size.height)
      ..lineTo(0, 0)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black87
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SquarePainter extends CustomPainter {
  _SquarePainter({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(1, 1, size.width - 2, size.height - 2);
    canvas.drawRect(rect, Paint()..color = fill);
    canvas.drawRect(
      rect,
      Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _CirclePainter extends CustomPainter {
  _CirclePainter({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide / 2) - 1;
    canvas.drawCircle(center, radius, Paint()..color = fill);
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RectPainter extends CustomPainter {
  _RectPainter({
    required this.fill,
    required this.stroke,
    required this.strokeWidth,
  });

  final Color fill;
  final Color stroke;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0.5, 0.5, size.width - 1, size.height - 1);
    canvas.drawRect(rect, Paint()..color = fill);
    canvas.drawRect(
      rect,
      Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
