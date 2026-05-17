import 'package:flutter/material.dart';

/// Resolves a non-empty [Rect] for `Share.shareXFiles` `sharePositionOrigin` on iOS/iPadOS.
///
/// `share_plus` maps this into `UIPopoverPresentationController.sourceRect` on the
/// Flutter [UIView] and checks it with `CGRectContainsRect`. Coordinates from
/// [RenderBox.localToGlobal] are not always in the same space as that check;
/// converting through the nearest [Overlay] matches the embedder view and avoids
/// spurious "must be ... within coordinate space" failures after async gaps.
Rect sharePositionOriginForShareSheet(BuildContext context) {
  final box = context.findRenderObject() as RenderBox?;
  final RenderBox? root =
      Overlay.maybeOf(context)?.context.findRenderObject() as RenderBox?;

  if (box != null &&
      root != null &&
      box.attached &&
      root.attached &&
      box.hasSize &&
      root.hasSize &&
      box.size.width > 0 &&
      box.size.height > 0) {
    final topLeft = root.globalToLocal(box.localToGlobal(Offset.zero));
    var rect = topLeft & box.size;
    final bounds = Offset.zero & root.size;
    rect = rect.intersect(bounds);
    if (rect.width >= 1 && rect.height >= 1) {
      return rect;
    }
  }

  if (root != null && root.hasSize) {
    final size = root.size;
    return Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: 48,
      height: 48,
    );
  }

  final mq = MediaQuery.sizeOf(context);
  return Rect.fromCenter(
    center: Offset(mq.width / 2, mq.height / 2),
    width: 48,
    height: 48,
  );
}
