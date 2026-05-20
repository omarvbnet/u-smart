import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import '../models/site_design_document.dart';
import '../models/workspace_site.dart';
import '../providers/sites_provider.dart';
import '../services/api_service.dart';

class WorkspaceSitesProvider extends ChangeNotifier {
  WorkspaceSitesProvider(this._api);

  final ApiService _api;
  List<WorkspaceSite> _sites = [];
  bool _loading = false;
  bool _canManageSites = false;
  String? _error;

  List<WorkspaceSite> get sites => _sites;
  List<WorkspaceSite> get mapSites =>
      _sites.where((s) => s.hasMapCoordinates && s.isConfirmed).toList();
  bool get loading => _loading;
  bool get canManageSites => _canManageSites;
  String? get error => _error;

  void _upsertSite(WorkspaceSite site) {
    final idx = _sites.indexWhere((s) => s.id == site.id);
    if (idx >= 0) {
      final next = List<WorkspaceSite>.from(_sites);
      next[idx] = site;
      _sites = next;
    } else {
      _sites = [..._sites, site]..sort((a, b) => a.siteCode.compareTo(b.siteCode));
    }
    notifyListeners();
  }

  Future<void> fetchSites() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await _api.get(ApiConfig.privateCompanySites);
      if (data['success'] == true && data['sites'] is List) {
        _sites = (data['sites'] as List)
            .map((e) => WorkspaceSite.fromJson(e as Map<String, dynamic>))
            .toList();
        _canManageSites = data['canManageSites'] == true;
      }
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> createSite({
    required String siteCode,
    required String location,
    required String province,
    double? latitude,
    double? longitude,
    bool hasQfield = false,
    List<Map<String, dynamic>>? qfieldProjects,
    List<Map<String, dynamic>>? designDocuments,
  }) async {
    try {
      final body = <String, dynamic>{
        'siteCode': siteCode,
        'location': location,
        'province': province,
        'hasQfield': hasQfield,
      };
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;
      if (qfieldProjects != null && qfieldProjects.isNotEmpty) {
        body['qfieldProjects'] = qfieldProjects;
      }
      if (designDocuments != null) {
        body['designDocuments'] = designDocuments;
      }
      final data = await _api.post(ApiConfig.privateCompanySites, body: body);
      if (data['success'] == true) {
        final siteJson = data['site'];
        if (siteJson is Map<String, dynamic>) {
          _upsertSite(WorkspaceSite.fromJson(siteJson));
        }
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> updateSite(
    String id, {
    String? siteCode,
    String? location,
    String? province,
    double? latitude,
    double? longitude,
    List<Map<String, dynamic>>? qfieldProjects,
    List<Map<String, dynamic>>? designDocuments,
    bool removeQfield = false,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (siteCode != null) body['siteCode'] = siteCode;
      if (location != null) body['location'] = location;
      if (province != null) body['province'] = province;
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;
      if (qfieldProjects != null) body['qfieldProjects'] = qfieldProjects;
      if (designDocuments != null) body['designDocuments'] = designDocuments;
      if (removeQfield) body['removeQfield'] = true;
      final data = await _api.patch(ApiConfig.privateCompanySiteDetail(id), body: body);
      if (data['success'] == true) {
        final siteJson = data['site'];
        if (siteJson is Map<String, dynamic>) {
          _upsertSite(WorkspaceSite.fromJson(siteJson));
        }
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> confirmSite(String id, {bool reject = false}) async {
    try {
      final data = await _api.post(
        ApiConfig.privateCompanySiteConfirm(id),
        body: {'reject': reject},
      );
      if (data['success'] == true) {
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> deleteSite(String id) async {
    try {
      final data = await _api.delete(ApiConfig.privateCompanySiteDetail(id));
      if (data['success'] == true) {
        await fetchSites();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<({WorkspaceSite site, List<WorkspaceSiteTicket> tickets})?> loadSiteDetail(
    String id, {
    String filter = 'all',
  }) async {
    try {
      final data = await _api.get(
        '${ApiConfig.privateCompanySiteDetail(id)}?filter=$filter',
      );
      if (data['success'] == true && data['site'] is Map) {
        final site = WorkspaceSite.fromJson(data['site'] as Map<String, dynamic>);
        final tickets = data['tickets'] is List
            ? (data['tickets'] as List)
                .map((e) => WorkspaceSiteTicket.fromJson(e as Map<String, dynamic>))
                .toList()
            : <WorkspaceSiteTicket>[];
        return (site: site, tickets: tickets);
      }
    } catch (_) {}
    return null;
  }

  Future<Map<String, dynamic>?> fetchQFieldMapPreview(
    String siteId, {
    String? projectId,
  }) async {
    try {
      final pid = projectId?.trim() ?? '';
      final query = pid.isNotEmpty ? {'projectId': pid} : null;
      return await _api.getSafe(
        '${ApiConfig.privateCompanySiteDetail(siteId)}/qfield-map-preview',
        query: query,
      );
    } catch (_) {
      return null;
    }
  }

  void reset() {
    _sites = [];
    _canManageSites = false;
    _error = null;
    notifyListeners();
  }

  static List<Map<String, dynamic>> qfieldProjectPayload(
    String url,
    String fileName, {
    String? title,
  }) =>
      SitesProvider.qfieldProjectPayload(url, fileName, title: title);

  static List<Map<String, dynamic>> designDocumentsPayload(
    List<SiteDesignDocument> docs,
  ) =>
      SitesProvider.designDocumentsPayload(docs);
}
