import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/site.dart';
import '../services/api_service.dart';

class SitesProvider extends ChangeNotifier {
  final ApiService _api;
  List<Site> _sites = [];
  bool _loading = false;
  bool _isWorkspaceMember = false;
  bool _canManageWorkspaceSites = false;

  SitesProvider(this._api);

  List<Site> get sites => _sites;
  List<Site> get sitesWithCoordinates =>
      _sites.where((s) => s.hasCoordinates).toList();
  bool get loading => _loading;
  bool get isWorkspaceMember => _isWorkspaceMember;
  bool get canManageWorkspaceSites => _canManageWorkspaceSites;
  /// Owner/manager/coordinator can add workspace sites; non-workspace users can add personal sites.
  bool get canAddSite => !_isWorkspaceMember || _canManageWorkspaceSites;

  Future<void> fetchSites({bool includeWorkspace = false}) async {
    _loading = true;
    notifyListeners();
    try {
      final data = await _api.get(ApiConfig.sites);
      var merged = <Site>[];
      if (data['success'] == true && data['sites'] is List) {
        merged = (data['sites'] as List)
            .map((e) => Site.fromJson(e as Map<String, dynamic>))
            .toList();
      }

      _isWorkspaceMember = false;
      _canManageWorkspaceSites = false;
      if (includeWorkspace) {
        try {
          final ws = await _api.get(ApiConfig.privateCompanySites);
          if (ws['success'] == true && ws['sites'] is List) {
            _isWorkspaceMember = true;
            _canManageWorkspaceSites = ws['canManageSites'] == true;
            final wsSites = (ws['sites'] as List)
                .map((e) => Site.fromWorkspaceJson(e as Map<String, dynamic>))
                .toList();
            merged = [...merged, ...wsSites];
          }
        } catch (_) {}
      }

      _sites = merged;
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
    bool hasQfield = false,
    List<Map<String, dynamic>>? qfieldProjects,
  }) async {
    try {
      final body = <String, dynamic>{
        'siteId': siteId,
        'location': location,
        'province': province,
      };
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;
      if (qfieldProjects != null && qfieldProjects.isNotEmpty) {
        body['qfieldProjects'] = qfieldProjects;
      } else if (hasQfield) {
        body['hasQfield'] = true;
      }

      final data = await _api.post(ApiConfig.sites, body: body);
      if (data['success'] == true) {
        await fetchSites(includeWorkspace: _isWorkspaceMember);
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
    List<Map<String, dynamic>>? qfieldProjects,
    bool removeQfield = false,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (siteId != null) body['siteId'] = siteId;
      if (location != null) body['location'] = location;
      if (province != null) body['province'] = province;
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;
      if (qfieldProjects != null) body['qfieldProjects'] = qfieldProjects;
      if (removeQfield) body['removeQfield'] = true;

      if (body.isEmpty) return false;

      final data = await _api.patch(ApiConfig.siteDetail(id), body: body);
      if (data['success'] == true) {
        await fetchSites(includeWorkspace: _isWorkspaceMember);
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<Map<String, dynamic>?> fetchSiteQFieldMapPreview(
    String siteId,
    String projectId,
  ) async {
    try {
      return await _api.get(
        '${ApiConfig.siteDetail(siteId)}/qfield-map-preview?projectId=$projectId',
      );
    } catch (_) {
      return null;
    }
  }

  static List<Map<String, dynamic>> qfieldProjectPayload(
    String url,
    String fileName, {
    String? title,
  }) {
    return [
      {
        'currentUrl': url,
        'fileName': fileName,
        if (title != null) 'title': title,
      },
    ];
  }

  Future<bool> deleteSite(String id) async {
    try {
      final data = await _api.delete(ApiConfig.siteDetail(id));
      if (data['success'] == true) {
        await fetchSites(includeWorkspace: _isWorkspaceMember);
        return true;
      }
    } catch (_) {}
    return false;
  }

  /// Bulk import (POST `/api/sites` with `{ sites: [...] }`). Each row needs
  /// `siteId` (or `name` in source maps), `latitude`, `longitude`; optional `location`, `province`.
  Future<Map<String, dynamic>?> bulkImportSites(
      List<Map<String, dynamic>> sites) async {
    try {
      final data = await _api.post(ApiConfig.sites, body: {'sites': sites});
      return data;
    } catch (_) {
      return null;
    }
  }

  /// Shares an owned site with another requester by username or email (server validates).
  Future<String?> shareSite(String siteDbId, String usernameOrEmail,
      {bool includeTickets = true}) async {
    try {
      final data = await _api.post(
        ApiConfig.siteShare(siteDbId),
        body: {
          'usernameOrEmail': usernameOrEmail.trim(),
          'includeTickets': includeTickets,
        },
      );
      if (data['success'] == true) {
        await fetchSites(includeWorkspace: _isWorkspaceMember);
        return null;
      }
      return data['message'] as String? ?? 'Failed';
    } catch (_) {
      return 'Failed';
    }
  }

  /// Time-bound public visitor link (URL) for anonymous site preview (web).
  Future<Map<String, dynamic>> createSiteVisitorLink(
    String siteDbId,
    DateTime validFrom,
    DateTime validUntil, {
    bool includeTickets = false,
  }) async {
    try {
      return await _api.post(
        ApiConfig.siteVisitorLink(siteDbId),
        body: {
          'validFrom': validFrom.toUtc().toIso8601String(),
          'validUntil': validUntil.toUtc().toIso8601String(),
          'includeTickets': includeTickets,
        },
      );
    } catch (_) {
      return {'success': false, 'message': 'Connection error'};
    }
  }

  /// Owner revokes a share, or recipient removes the site from their list.
  Future<bool> revokeSiteShare(String siteDbId, String shareId) async {
    try {
      final data = await _api.delete(
        ApiConfig.siteShare(siteDbId),
        query: {'shareId': shareId},
      );
      if (data['success'] == true) {
        await fetchSites(includeWorkspace: _isWorkspaceMember);
        return true;
      }
    } catch (_) {}
    return false;
  }
}
