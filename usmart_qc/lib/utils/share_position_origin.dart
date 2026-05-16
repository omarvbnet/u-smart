import 'package:flutter/material.dart';

/// iOS/iPadOS share sheets require a non-empty [Rect] in global coordinates.
/// Callers often passed no rect or a 0×0 rect from the wrong [BuildContext], which
/// triggers: `sharePositionOrigin ... must be non-zero and within coordinate space`.
Rect sharePositionOriginForShareSheet(BuildContext context) {
  final box = context.findRenderObject() as RenderBox?;
  if (box != null &&
      box.attached &&
      box.hasSize &&
      box.size.width > 0 &&
      box.size.height > 0) {
    final rect = box.localToGlobal(Offset.zero) & box.size;
    if (rect.width > 0 && rect.height > 0) {
      return rect;
    }
  }
  final size = MediaQuery.sizeOf(context);
  return Rect.fromCenter(
    center: Offset(size.width / 2, size.height / 2),
    width: 2,
    height: 2,
  );
}
