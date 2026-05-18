import 'package:latlong2/latlong.dart';
import 'package:proj4dart/proj4dart.dart';

/// UTM / projected meters → WGS84 for QField map (client-side fallback when API coords are still projected).
class CoordinateTransform {
  CoordinateTransform._();

  static Projection? _wgs84;

  static Projection get wgs84 {
    _wgs84 ??= Projection.get('EPSG:4326')!;
    return _wgs84!;
  }

  static bool isWgs84LatLng(double lat, double lng) =>
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  static bool looksLikeProjectedMeters(double x, double y) {
    if (isWgs84LatLng(y, x)) return false;
    final ax = x.abs();
    final ay = y.abs();
    return ax >= 1e4 && ax <= 1e7 && ay >= 1e4 && ay <= 1.2e7;
  }

  static Projection _utmEpsg(int epsg) {
    final key = 'EPSG:$epsg';
    final existing = Projection.get(key);
    if (existing != null) return existing;
    final zone = epsg - 32600;
    return Projection.add(
      key,
      '+proj=utm +zone=$zone +datum=WGS84 +units=m +no_defs',
    );
  }

  static LatLng? reprojectXY(
    double x,
    double y, {
    int? epsg,
    String? crsEpsg,
  }) {
    if (isWgs84LatLng(y, x)) return LatLng(y, x);
    if (!looksLikeProjectedMeters(x, y)) return null;

    final codes = <int>[];
    if (epsg != null) codes.add(epsg);
    if (crsEpsg != null) {
      final m = RegExp(r'(\d{4,5})').firstMatch(crsEpsg);
      if (m != null) codes.add(int.parse(m.group(1)!));
    }
    for (final z in [38, 39, 37, 40]) {
      codes.add(32600 + z);
    }

    for (final code in codes.toSet()) {
      try {
        final src = _utmEpsg(code);
        final out = src.transform(wgs84, Point(x: x, y: y));
        final lat = out.y;
        final lng = out.x;
        if (isWgs84LatLng(lat, lng)) {
          if (lat >= 22 && lat <= 42 && lng >= 34 && lng <= 55) {
            return LatLng(lat, lng);
          }
          if (epsg != null || crsEpsg != null) return LatLng(lat, lng);
        }
      } catch (_) {
        continue;
      }
    }

    for (final code in [32638, 32639, 32637, 32640]) {
      try {
        final src = _utmEpsg(code);
        final out = src.transform(wgs84, Point(x: x, y: y));
        final lat = out.y;
        final lng = out.x;
        if (isWgs84LatLng(lat, lng) &&
            lat >= 22 &&
            lat <= 42 &&
            lng >= 34 &&
            lng <= 55) {
          return LatLng(lat, lng);
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  static int? epsgFromProperties(Map<String, dynamic> props) {
    final raw = props['crsEpsg'] ?? props['crs_epsg'] ?? props['srs'];
    if (raw is num) return raw.toInt();
    if (raw is String) {
      final m = RegExp(r'(\d{4,5})').firstMatch(raw);
      if (m != null) return int.tryParse(m.group(1)!);
    }
    return null;
  }
}
