import 'package:flutter/material.dart';

/// On-map comment chip: black box, engineer name + note preview.
class QFieldMapNoteBubble extends StatelessWidget {
  const QFieldMapNoteBubble({
    super.key,
    required this.authorName,
    required this.previewText,
    this.onTap,
  });

  final String authorName;
  final String previewText;
  final VoidCallback? onTap;

  static const _width = 132.0;
  static const _minHeight = 52.0;

  @override
  Widget build(BuildContext context) {
    final body = Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: _width,
          constraints: const BoxConstraints(minHeight: _minHeight),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withAlpha(230),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white.withAlpha(35)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(120),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                authorName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                previewText,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.white.withAlpha(200),
                  fontSize: 11,
                  height: 1.25,
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        body,
        CustomPaint(
          size: const Size(14, 7),
          painter: _BubbleTailPainter(),
        ),
      ],
    );
  }
}

class _BubbleTailPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width / 2 - 7, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width / 2 + 7, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = Colors.black.withAlpha(230));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
