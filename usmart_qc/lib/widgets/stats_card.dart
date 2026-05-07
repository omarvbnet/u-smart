import 'package:flutter/material.dart';

/// Responsive grid density for dashboard stat tiles.
int statsGridCrossAxisCount(double width, int itemCount) {
  if (itemCount <= 0) return 1;
  if (itemCount == 1) return 1;
  if (width >= 1000 && itemCount >= 4) return 4;
  if (width >= 720 && itemCount == 3) return 3;
  return 2;
}

double statsGridAspectRatio(double width, int cols) {
  if (cols >= 4) return width >= 1100 ? 1.42 : 1.28;
  if (cols == 3) return 1.22;
  return width < 360 ? 1.02 : width < 420 ? 1.08 : 1.14;
}

class ResponsiveStatsGrid extends StatelessWidget {
  final List<Widget> children;
  final double spacing;

  const ResponsiveStatsGrid({
    super.key,
    required this.children,
    this.spacing = 11,
  });

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final count = statsGridCrossAxisCount(w, children.length);
    return GridView.count(
      crossAxisCount: count,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: spacing,
      mainAxisSpacing: spacing,
      childAspectRatio: statsGridAspectRatio(w, count),
      children: children,
    );
  }
}

class StatsCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const StatsCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withAlpha(30)),
            boxShadow: [
              BoxShadow(
                color: color.withAlpha(12),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [color.withAlpha(40), color.withAlpha(15)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const Spacer(),
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white.withAlpha(100),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
