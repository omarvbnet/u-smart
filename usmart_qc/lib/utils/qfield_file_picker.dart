import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';

/// QGIS / QField package extensions accepted by the server upload route.
const kQFieldPackageExtensions = ['qgz', 'zip', 'gpkg', 'qgs'];

bool isQFieldPackageFileName(String name) {
  final ext = name.split('.').last.toLowerCase();
  return kQFieldPackageExtensions.contains(ext);
}

/// Picks a QField package. On mobile, reads from disk path (large .gpkg / .qgz) instead of loading all bytes in memory.
Future<({List<int> bytes, String fileName})?> pickQFieldPackageBytes() async {
  final result = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: kQFieldPackageExtensions,
    allowMultiple: false,
    withData: kIsWeb,
    withReadStream: false,
  );
  if (result == null || result.files.isEmpty) return null;

  final file = result.files.single;
  final name = file.name.trim();
  if (name.isEmpty || !isQFieldPackageFileName(name)) return null;

  if (file.bytes != null && file.bytes!.isNotEmpty) {
    return (bytes: file.bytes!, fileName: name);
  }

  final path = file.path;
  if (path != null && path.isNotEmpty) {
    final f = File(path);
    if (await f.exists()) {
      final bytes = await f.readAsBytes();
      if (bytes.isNotEmpty) return (bytes: bytes, fileName: name);
    }
  }

  return null;
}
