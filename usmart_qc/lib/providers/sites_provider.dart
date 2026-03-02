import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/site.dart';
import '../services/api_service.dart';

class SitesProvider extends ChangeNotifier {
  final ApiService _api;
  List<Site> _sites = [];
  bool _loading = false;

  SitesProvider(this._api);

  List<Site> get sites => _sites;
  List<Site> get sitesWithCoordinates =>
      _sites.where((s) => s.hasCoordinates).toList();
  bool get loading => _loading;

  Future<void> fetchSites() async {
    _loading = true;
    notifyListeners();
    try {
      final data = await _api.get(ApiConfig.sites);
      if (data['success'] == true && data['sites'] is List) {
        _sites = (data['sites'] as List)
            .map((e) => Site.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    _loading = false;
    notifyListeners();
  }

  Future<bool> createSite({
    required String siteId,
    required String location,
    required String province,
    double? latitude,
    double? longitude,
  }) async {
    try {
      final body = <String, dynamic>{
        'siteId': siteId,
        'location': location,
        'province': province,
      };
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;

      final data = await _api.post(ApiConfig.sites, body: body);
      if (data['success'] == true) {
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> updateSite(String id, {
    String? siteId,
    String? location,
    String? province,
    double? latitude,
    double? longitude,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (siteId != null) body['siteId'] = siteId;
      if (location != null) body['location'] = location;
      if (province != null) body['province'] = province;
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;

      if (body.isEmpty) return false;

      final data = await _api.patch(ApiConfig.siteDetail(id), body: body);
      if (data['success'] == true) {
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> deleteSite(String id) async {
    try {
      final data = await _api.delete(ApiConfig.siteDetail(id));
      if (data['success'] == true) {
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }
}
