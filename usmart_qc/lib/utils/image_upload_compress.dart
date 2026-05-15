import 'dart:typed_data';

import 'package:image/image.dart' as img;

bool _isRasterImageFilename(String filename) {
  final l = filename.toLowerCase();
  return l.endsWith('.jpg') ||
      l.endsWith('.jpeg') ||
      l.endsWith('.png') ||
      l.endsWith('.webp');
}

/// Resize (max long edge 1920) and JPEG encode at ~medium quality for uploads.
({Uint8List bytes, String filename}) compressRasterForUpload(
  Uint8List input,
  String filename,
) {
  if (!_isRasterImageFilename(filename)) {
    return (bytes: input, filename: filename);
  }
  final decoded = img.decodeImage(input);
  if (decoded == null) {
    return (bytes: input, filename: filename);
  }
  const maxSide = 1920;
  img.Image work = decoded;
  if (decoded.width > maxSide || decoded.height > maxSide) {
    if (decoded.width >= decoded.height) {
      work = img.copyResize(decoded, width: maxSide, interpolation: img.Interpolation.linear);
    } else {
      work = img.copyResize(decoded, height: maxSide, interpolation: img.Interpolation.linear);
    }
  }
  final jpg = Uint8List.fromList(img.encodeJpg(work, quality: 72));
  final base = filename.replaceAll(RegExp(r'\.[^.]+$'), '');
  final safeBase = base.isEmpty ? 'image' : base;
  return (bytes: jpg, filename: '$safeBase.jpg');
}
