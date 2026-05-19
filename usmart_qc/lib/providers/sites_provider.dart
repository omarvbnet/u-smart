import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/qfield_project.dart';
import '../models/site.dart';
import '../models/site_design_document.dart';
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

  /// Seed flags before [fetchSites] completes to avoid showing Add Site to field staff briefly.
  void seedWorkspaceFromMembership({
    required bool isMember,
    required bool canManageWorkspace,
  }) {
    _isWorkspaceMember = isMember;
    _canManageWorkspaceSites = canManageWorkspace;
    notifyListeners();
  }

  Future<({bool ok, String? message, List<QFieldProject>? projects})>
      postSiteQFieldMapAction(
    Site site,
    Map<String, dynamic> body,
  ) async {
    try {
      final path = site.isWorkspace && site.workspaceSiteId != null
          ? ApiConfig.privateCompanySiteQFieldProjects(site.workspaceSiteId!)
          : ApiConfig.siteQFieldProjects(site.id);
      final data = await _api.post(path, body: body);
      if (data['success'] == true && data['qfieldProjects'] is List) {
        final list = (data['qfieldProjects'] as List)
            .map((e) => QFieldProject.fromJson(e as Map<String, dynamic>))
            .toList();
        return (ok: true, message: null, projects: list);
      }
      final msg = data['message'];
      if (msg is String && msg.trim().isNotEmpty) {
        return (ok: false, message: msg.trim(), projects: null);
      }
    } catch (_) {}
    return (ok: false, message: null, projects: null);
  }

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
    List<Map<String, dynamic>>? designDocuments,
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
      if (designDocuments != null) {
        body['designDocuments'] = designDocuments;
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
    List<Map<String, dynamic>>? designDocuments,
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
      if (designDocuments != null) body['designDocuments'] = designDocuments;
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

  Future<Map<String, dynamic>?> fetchQFieldMapPreviewForSite(
    Site site, {
    String? projectId,
  }) async {
    try {
      final pid = projectId?.trim() ?? '';
      final base = site.isWorkspace && site.workspaceSiteId != null
          ? ApiConfig.privateCompanySiteDetail(site.workspaceSiteId!)
          : ApiConfig.siteDetail(site.isWorkspace ? site.workspaceSiteId! : site.id);
      final query = pid.isNotEmpty ? {'projectId': pid} : null;
      return await _api.getSafe('$base/qfield-map-preview', query: query);
    } catch (_) {
      return null;
    }
  }

  static List<Map<String, dynamic>> qfieldProjectPayload(
    String url,
    String fileName, {
    String? title,
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    return [
      {
        'id': 'qfp_${DateTime.now().millisecondsSinceEpoch}',
        'currentUrl': url,
        'fileName': fileName,
        'createdAt': now,
        'updatedAt': now,
        if (title != null) 'title': title,
      },
    ];
  }

  static List<Map<String, dynamic>> designDocumentsPayload(
    List<SiteDesignDocument> docs,
  ) =>
      docs.map((d) => d.toPayload()).toList();

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
