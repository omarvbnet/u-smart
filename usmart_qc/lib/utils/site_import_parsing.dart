import 'dart:convert';
import 'dart:typed_data';

import 'site_xlsx_rows.dart';

/// Parses JSON `sites` array (or root array) into bulk-import payloads for `/api/sites`.
List<Map<String, dynamic>> sitesFromJsonDecoded(dynamic decoded) {
  late final List<dynamic> list;
  if (decoded is List) {
    list = decoded;
  } else if (decoded is Map && decoded['sites'] is List) {
    list = decoded['sites'] as List;
  } else {
    throw const FormatException(
      'JSON must be an array of site objects or { "sites": [...] }.',
    );
  }
  final out = <Map<String, dynamic>>[];
  for (final e in list) {
    if (e is! Map) continue;
    final m = Map<String, dynamic>.from(e);
    final siteId = _str(m['siteId'] ?? m['site_id'] ?? m['name']);
    final lat = _toDouble(m['latitude'] ?? m['lat']);
    final lng = _toDouble(m['longitude'] ?? m['lng'] ?? m['lon']);
    if (siteId == null || siteId.isEmpty) continue;
    if (lat == null || lng == null) continue;
    final location = _str(m['location']) ?? '$lat, $lng';
    final province = _str(m['province']) ?? '—';
    out.add({
      'siteId': siteId,
      'latitude': lat,
      'longitude': lng,
      'location': location,
      'province': province,
    });
  }
  if (out.isEmpty) {
    throw const FormatException(
      'No valid rows: each site needs siteId or name, plus latitude and longitude.',
    );
  }
  return out;
}

List<Map<String, dynamic>> sitesFromJsonString(String source) {
  final decoded = jsonDecode(source);
  return sitesFromJsonDecoded(decoded);
}

/// First row = headers. Required columns (any header name from each group):
/// - site id: site_id, siteid, name, site_name, id, code
/// - lat: latitude, lat, y
/// - lng: longitude, lng, lon, long, x
List<Map<String, dynamic>> sitesFromXlsxBytes(List<int> bytes) {
  final grid = xlsxFirstSheetToGrid(Uint8List.fromList(bytes));
  if (grid.length < 2) {
    throw const FormatException(
      'Excel needs a header row and at least one data row on Sheet1.',
    );
  }
  final header = grid.first;
  final norm = <String, int>{};
  for (var i = 0; i < header.length; i++) {
    final k = _normHeader(header[i]);
    if (k.isEmpty) continue;
    norm[k] = i;
  }
  int? col(Set<String> keys) {
    for (final k in keys) {
      final i = norm[k];
      if (i != null) return i;
    }
    return null;
  }

  final idCol = col({'site_id', 'siteid', 'name', 'site_name', 'id', 'code'});
  final latCol = col({'latitude', 'lat', 'y'});
  final lngCol = col({'longitude', 'lng', 'lon', 'long', 'x'});
  final locCol = col({'location', 'address', 'site_location'});
  final provCol = col({'province', 'region', 'governorate'});

  if (idCol == null || latCol == null || lngCol == null) {
    throw const FormatException(
      'Missing columns. Use headers like: site_id (or name), latitude, longitude — optional: location, province.',
    );
  }

  final out = <Map<String, dynamic>>[];
  for (var r = 1; r < grid.length; r++) {
    final row = grid[r];
    String cell(int? i) {
      if (i == null || i < 0 || i >= row.length) return '';
      return row[i].trim();
    }

    final siteId = cell(idCol);
    final lat = _toDouble(cell(latCol));
    final lng = _toDouble(cell(lngCol));
    if (siteId.isEmpty) continue;
    if (lat == null || lng == null) continue;
    var location = locCol != null ? cell(locCol) : '';
    if (location.isEmpty) location = '$lat, $lng';
    var province = provCol != null ? cell(provCol) : '';
    if (province.isEmpty) province = '—';
    out.add({
      'siteId': siteId,
      'latitude': lat,
      'longitude': lng,
      'location': location,
      'province': province,
    });
  }
  if (out.isEmpty) {
    throw const FormatException('No valid data rows after the header.');
  }
  return out;
}

String _normHeader(String raw) {
  return raw
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[\s\-]+'), '_')
      .replaceAll(RegExp(r'[^\w]+'), '');
}

String? _str(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

double? _toDouble(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.trim().replaceAll(',', '.'));
  return null;
}
