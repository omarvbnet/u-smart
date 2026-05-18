import 'package:flutter/material.dart';

/// Shared breakpoints and spacing for mobile-first ticket / map UIs.
abstract final class RLayout {
  static const double minTouchTarget = 48;

  static Size screenSize(BuildContext context) => MediaQuery.sizeOf(context);

  static EdgeInsets viewPadding(BuildContext context) =>
      MediaQuery.paddingOf(context);

  static bool isCompact(BuildContext context) =>
      screenSize(context).width < 380;

  static bool isNarrow(BuildContext context) =>
      screenSize(context).width < 340;

  static bool isShortScreen(BuildContext context) =>
      screenSize(context).height < 640;

  /// Horizontal padding for page content (12–20).
  static double horizontalPad(BuildContext context) {
    final w = screenSize(context).width;
    if (w < 340) return 12;
    if (w < 400) return 14;
    if (w > 600) return 20;
    return 16;
  }

  static EdgeInsets pagePadding(BuildContext context) {
    final h = horizontalPad(context);
    final bottom = viewPadding(context).bottom;
    return EdgeInsets.fromLTRB(h, 0, h, bottom > 0 ? bottom : 16);
  }

  /// Fraction of screen height reserved for the map preview (clamped later).
  static double mapHeightFraction(BuildContext context) {
    final h = screenSize(context).height;
    if (h < 580) return 0.40;
    if (h < 680) return 0.46;
    if (h < 780) return 0.52;
    return 0.56;
  }

  /// Clamp map height inside a bottom sheet or dialog.
  static double mapHeightInSheet(BuildContext context, {double? maxHeight}) {
    final screenH = screenSize(context).height;
    final avail = maxHeight ?? screenH * 0.88;
    final fraction = mapHeightFraction(context);
    final target = screenH * fraction;
    final maxMap = avail - 220;
    return target.clamp(200.0, maxMap > 200 ? maxMap : 280);
  }

  /// Body height below toolbar (site name, badges, etc.) — excludes status bar + toolbar.
  static double ticketHeaderBodyHeight(
    BuildContext context, {
    bool hasAssignedLine = false,
    bool hasCrewBanner = false,
    bool hasResultBadge = false,
  }) {
    var h = isShortScreen(context) ? 64.0 : 72.0;
    if (hasAssignedLine) h += 24;
    if (hasCrewBanner) h += 58;
    if (hasResultBadge) h += 40;
    return h;
  }

  /// Full SliverAppBar expanded height including status bar and toolbar.
  static double ticketSliverExpandedHeight(
    BuildContext context, {
    bool hasAssignedLine = false,
    bool hasCrewBanner = false,
    bool hasResultBadge = false,
  }) {
    final top = viewPadding(context).top;
    return top + kToolbarHeight + ticketHeaderBodyHeight(
          context,
          hasAssignedLine: hasAssignedLine,
          hasCrewBanner: hasCrewBanner,
          hasResultBadge: hasResultBadge,
        );
  }

  static double titleFontSize(BuildContext context) {
    if (isNarrow(context)) return 20;
    if (isCompact(context)) return 22;
    return 24;
  }
}

/// Minimum 48dp tap target wrapping a child.
class MinTouchTarget extends StatelessWidget {
  const MinTouchTarget({
    super.key,
    required this.onTap,
    required this.child,
    this.tooltip,
  });

  final VoidCallback? onTap;
  final Widget child;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    Widget w = ConstrainedBox(
      constraints: const BoxConstraints(
        minWidth: RLayout.minTouchTarget,
        minHeight: RLayout.minTouchTarget,
      ),
      child: Center(child: child),
    );
    if (tooltip != null) {
      w = Tooltip(message: tooltip!, child: w);
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: w,
      ),
    );
  }
}
