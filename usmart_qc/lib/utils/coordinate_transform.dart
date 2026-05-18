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

  static const _utmTryOrder = [
    32638, 32639, 32637, 32640, 32636, 32641,
    32738, 32739, 32737, 32740,
  ];

  static LatLng? _transformEpsg(double x, double y, int code) {
    try {
      final src = _utmEpsg(code);
      final out = src.transform(wgs84, Point(x: x, y: y));
      final lat = out.y;
      final lng = out.x;
      if (isWgs84LatLng(lat, lng)) return LatLng(lat, lng);
    } catch (_) {}
    return null;
  }

  /// Try all common UTM zones; accept any valid WGS84 (not limited to Iraq bbox).
  static LatLng? reprojectXYGuessed(double x, double y) {
    if (isWgs84LatLng(y, x)) return LatLng(y, x);
    if (!looksLikeProjectedMeters(x, y)) return null;
    for (final code in _utmTryOrder) {
      final ll = _transformEpsg(x, y, code);
      if (ll != null) return ll;
    }
    return null;
  }

  static LatLng? reprojectXY(
    double x,
    double y, {
    int? epsg,
    String? crsEpsg,
  }) {
    if (isWgs84LatLng(y, x)) return LatLng(y, x);

    final codes = <int>[];
    if (epsg != null) codes.add(epsg);
    if (crsEpsg != null) {
      final m = RegExp(r'(\d{4,5})').firstMatch(crsEpsg);
      if (m != null) codes.add(int.parse(m.group(1)!));
    }

    if (looksLikeProjectedMeters(x, y)) {
      for (final code in codes.toSet()) {
        final ll = _transformEpsg(x, y, code);
        if (ll != null) return ll;
      }
      return reprojectXYGuessed(x, y);
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
