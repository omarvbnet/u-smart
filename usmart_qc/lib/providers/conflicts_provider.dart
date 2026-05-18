import 'dart:async';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/conflict.dart';
import '../services/api_service.dart';

class ConflictsProvider extends ChangeNotifier {
  final ApiService _api;

  List<ConflictCase> _conflicts = [];
  ConflictCase? _selectedConflict;
  bool _loading = false;
  String? _error;
  int _workspacePendingCount = 0;
  bool _workspaceMode = false;

  ConflictsProvider(this._api);

  List<ConflictCase> get conflicts => _conflicts;
  int get workspacePendingCount => _workspacePendingCount;
  bool get workspaceMode => _workspaceMode;
  List<ConflictCase> get pendingConflicts =>
      _conflicts.where((c) => c.isPending).toList();
  ConflictCase? get selectedConflict => _selectedConflict;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> fetchWorkspaceConflicts({String status = 'open'}) async {
    _loading = true;
    _error = null;
    _workspaceMode = true;
    notifyListeners();
    try {
      final data = await _api.getSafe(
        ApiConfig.privateCompanyConflicts,
        query: {'status': status},
      );
      if (data != null &&
          data['success'] == true &&
          data['conflicts'] is List) {
        _conflicts = (data['conflicts'] as List)
            .map((e) => ConflictCase.fromJson(e as Map<String, dynamic>))
            .toList();
        _workspacePendingCount = data['pendingCount'] is int
            ? data['pendingCount'] as int
            : pendingConflicts.length;
      } else {
        _conflicts = [];
        _workspacePendingCount = 0;
      }
    } catch (e) {
      _error = 'Failed to load conflicts';
      _conflicts = [];
      _workspacePendingCount = 0;
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> fetchConflicts() async {
    _loading = true;
    _error = null;
    _workspaceMode = false;
    notifyListeners();
    try {
      final data = await _api.getSafe(ApiConfig.conflicts, query: {
        'serviceSlug': ApiConfig.serviceSlug,
      });
      if (data != null &&
          data['success'] == true &&
          data['conflicts'] is List) {
        _conflicts = (data['conflicts'] as List)
            .map((e) => ConflictCase.fromJson(e as Map<String, dynamic>))
            .toList();
      } else {
        _conflicts = [];
      }
    } catch (e) {
      _error = 'Failed to load conflicts';
      _conflicts = [];
    }
    _loading = false;
    notifyListeners();
  }

  Future<ConflictCase?> fetchConflictDetail(String id) async {
    _loading = true;
    _selectedConflict = null;
    notifyListeners();
    try {
      final data = await _api.getSafe(ApiConfig.conflictDetail(id));
      if (data != null &&
          data['success'] == true &&
          data['conflict'] != null) {
        _selectedConflict =
            ConflictCase.fromJson(data['conflict'] as Map<String, dynamic>);
      }
    } catch (_) {
      _selectedConflict = null;
    }
    _loading = false;
    notifyListeners();
    return _selectedConflict;
  }

  /// Report a conflict for a ticket (company/personal).
  /// For maintenance: comment and imageUrls required. For QC: comment optional.
  Future<ConflictCase?> reportConflict(String ticketId,
      {String? comment, List<String>? imageUrls}) async {
    try {
      final body = <String, dynamic>{};
      if (comment != null && comment.isNotEmpty) body['comment'] = comment;
      if (imageUrls != null && imageUrls.isNotEmpty) body['imageUrls'] = imageUrls;
      final data = await _api.post(
        ApiConfig.ticketReportConflict(ticketId),
        body: body.isNotEmpty ? body : null,
      );
      if (data['success'] == true && data['conflict'] != null) {
        final conflict =
            ConflictCase.fromJson(data['conflict'] as Map<String, dynamic>);
        _conflicts = [conflict, ..._conflicts];
        notifyListeners();
        return conflict;
      }
    } catch (_) {}
    return null;
  }

  /// Resolve conflict: change result, re-inspection, or keep same.
  /// resolution: 'accepted' | 'not_accepted' | 'ncr' | 'accepted_with_comments' | 're_inspection' | 'keep_same'
  Future<bool> resolveConflict(String conflictId, String resolution,
      {String? comment}) async {
    try {
      final data = await _api.patch(
        ApiConfig.conflictDetail(conflictId),
        body: {
          'resolution': resolution,
          if (comment != null && comment.isNotEmpty) 'comment': comment,
        },
      );
      if (data['success'] == true) {
        final idx = _conflicts.indexWhere((c) => c.id == conflictId);
        if (idx >= 0 && data['conflict'] != null) {
          _conflicts[idx] =
              ConflictCase.fromJson(data['conflict'] as Map<String, dynamic>);
        } else {
          await fetchConflicts();
        }
        if (_selectedConflict?.id == conflictId && data['conflict'] != null) {
          _selectedConflict =
              ConflictCase.fromJson(data['conflict'] as Map<String, dynamic>);
        }
        notifyListeners();
        return true;
      }
    } catch (_) {}
    return false;
  }
}
