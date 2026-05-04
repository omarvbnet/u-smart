import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../config/api_config.dart';
import '../models/ticket.dart';
import '../models/stats.dart';
import '../models/company_dashboard_summary.dart';
import '../models/comment.dart';
import '../models/evidence.dart';
import '../models/inspection_checklist.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';

class TicketsProvider extends ChangeNotifier {
  final ApiService _api;
  final NotificationService _notifications;
  List<Ticket> _tickets = [];
  TicketStats? _stats;
  CompanyDashboardSummary? _companyDashboard;
  bool _loading = false;
  String? _error;
  Timer? _pollTimer;
  int _lastTicketCount = 0;

  String? _currentUserId;
  String? _province;
  bool _provinceFilterActive = true;

  DateTime? _dateFrom;
  DateTime? _dateTo;
  bool _exporting = false;

  TicketsProvider(this._api, this._notifications);

  DateTime? get dateFrom => _dateFrom;
  DateTime? get dateTo => _dateTo;
  bool get exporting => _exporting;

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void setDateRange(DateTime? from, DateTime? to) {
    _dateFrom = from;
    _dateTo = to;
    notifyListeners();
  }

  void clearDateRange() {
    _dateFrom = null;
    _dateTo = null;
    notifyListeners();
  }

  void setCurrentUserId(String? id) => _currentUserId = id;

  String? get province => _province;
  bool get provinceFilterActive => _provinceFilterActive;

  Future<void> loadProvinceFilter() async {
    try {
      final data = await _api.get(ApiConfig.provinceFilter);
      if (data['success'] == true) {
        _province = data['province'] as String?;
        _provinceFilterActive = data['provinceFilterActive'] as bool? ?? true;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<bool> toggleProvinceFilter() async {
    final newValue = !_provinceFilterActive;
    try {
      final data = await _api.patch(
        ApiConfig.provinceFilter,
        body: {'provinceFilterActive': newValue},
      );
      if (data['success'] == true) {
        _provinceFilterActive = newValue;
        notifyListeners();
        await fetchTickets();
        return true;
      }
    } catch (_) {}
    return false;
  }

  List<Ticket> get tickets => _tickets;
  List<Ticket> get pendingTickets =>
      _tickets.where((t) => t.isPending).toList();
  List<Ticket> get onSiteTickets =>
      _tickets.where((t) => t.isOnSite).toList();
  List<Ticket> get inProgressTickets =>
      _tickets.where((t) => t.isInProgress).toList();
  List<Ticket> get completedTickets =>
      _tickets.where((t) => t.isCompleted).toList();
  List<Ticket> get ncrTickets => _tickets.where((t) => t.isNcr).toList();
  List<Ticket> get unassignedTickets =>
      _tickets.where((t) => t.canBeAssigned).toList();

  // Stats-card filtered lists (for tap-to-view related tickets)
  List<Ticket> get ticketsWithinSla {
    return _tickets.where((t) {
      final sla = t.slaHours ?? 24;
      if (t.isCompleted && t.completedAt != null) {
        final completed = DateTime.tryParse(t.completedAt!);
        if (completed == null) return false;
        final hours = completed.difference(t.createdAt).inMilliseconds / (1000 * 60 * 60);
        return hours <= sla;
      }
      return false;
    }).toList();
  }

  List<Ticket> get ticketsOutOfSla {
    final now = DateTime.now();
    return _tickets.where((t) {
      final sla = t.slaHours ?? 24;
      if (t.isCompleted && t.completedAt != null) {
        final completed = DateTime.tryParse(t.completedAt!);
        if (completed == null) return false;
        final hours = completed.difference(t.createdAt).inMilliseconds / (1000 * 60 * 60);
        return hours > sla;
      }
      final hoursSince = now.difference(t.createdAt).inMilliseconds / (1000 * 60 * 60);
      return hoursSince > sla;
    }).toList();
  }

  List<Ticket> get ticketsAccepted =>
      _tickets.where((t) => (t.inspectionResult ?? '').toLowerCase() == 'accepted').toList();

  List<Ticket> get ticketsAcceptedWithComments =>
      _tickets.where((t) => (t.inspectionResult ?? '').toLowerCase() == 'accepted_with_comments').toList();

  List<Ticket> get ticketsNotAccepted =>
      _tickets.where((t) => (t.inspectionResult ?? '').toLowerCase() == 'not_accepted').toList();

  List<Ticket> get activeTickets =>
      _tickets.where((t) => t.isOnSite || t.isInProgress).toList();

  /// Total inspection time in hours across all completed tickets (respects date filter from fetch).
  double get totalInspectionHours {
    double sum = 0;
    for (final t in completedTickets) {
      final h = t.inspectionHours;
      if (h != null && h > 0) sum += h;
    }
    return sum;
  }

  // Engineer-specific: available tickets (PENDING + not assigned), excluding own submissions
  List<Ticket> get availableTickets => _tickets.where((t) {
        if (!t.isPending || t.isAssigned) return false;
        if (_currentUserId != null &&
            t.requesterId != null &&
            t.requesterId == _currentUserId) {
          return false;
        }
        return true;
      }).toList();

  // Engineer-specific: tickets assigned to me (any status)
  List<Ticket> get myAssignedTickets => _currentUserId == null
      ? []
      : _tickets
          .where((t) => t.assignedEngineerId == _currentUserId)
          .toList();

  // Engineer-specific: my completed tickets
  List<Ticket> get myCompletedTickets => _currentUserId == null
      ? []
      : _tickets
          .where((t) =>
              t.isCompleted && t.assignedEngineerId == _currentUserId)
          .toList();

  // Engineer-specific: my active tickets (assigned to me, not completed)
  List<Ticket> get myActiveTickets => _currentUserId == null
      ? []
      : _tickets
          .where((t) =>
              !t.isCompleted &&
              !t.isPending &&
              t.assignedEngineerId == _currentUserId)
          .toList();

  bool get hasActiveTicket => myActiveTickets.isNotEmpty;

  /// Engineer inbox: tickets where requester resubmitted NCR, pending engineer response
  List<Ticket> get ticketsPendingNcrResponse => _currentUserId == null
      ? []
      : _tickets
          .where((t) =>
              t.assignedEngineerId == _currentUserId &&
              t.isNcr &&
              t.hasPendingEngineerNcrResponse)
          .toList();

  TicketStats? get stats => _stats;
  CompanyDashboardSummary? get companyDashboard => _companyDashboard;
  bool get loading => _loading;
  String? get error => _error;

  void startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      Duration(seconds: ApiConfig.pollIntervalSeconds),
      (_) => _pollForNewTickets(),
    );
  }

  void stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _pollForNewTickets() async {
    try {
      final data = await _api.get(ApiConfig.tickets, query: {
        'serviceSlug': ApiConfig.serviceSlug,
      });
      if (data['success'] == true && data['tickets'] is List) {
        final newTickets = (data['tickets'] as List)
            .map((e) => Ticket.fromJson(e as Map<String, dynamic>))
            .toList();

        if (_lastTicketCount > 0 && newTickets.length > _lastTicketCount) {
          final diff = newTickets.length - _lastTicketCount;
          _notifications.show(
            id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
            title: 'New Tickets',
            body: '$diff new ticket${diff > 1 ? 's' : ''} received',
          );
        }

        _lastTicketCount = newTickets.length;
        _tickets = newTickets;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> fetchTickets() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final query = <String, String>{'serviceSlug': ApiConfig.serviceSlug};
      if (_dateFrom != null) query['from'] = _formatDate(_dateFrom!);
      if (_dateTo != null) query['to'] = _formatDate(_dateTo!);
      final data = await _api.get(ApiConfig.tickets, query: query);
      if (data['success'] == true && data['tickets'] is List) {
        _tickets = (data['tickets'] as List)
            .map((e) => Ticket.fromJson(e as Map<String, dynamic>))
            .toList();
        _lastTicketCount = _tickets.length;
      }
    } catch (e) {
      _error = 'Failed to load tickets';
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> fetchStats() async {
    try {
      final query = <String, String>{'serviceSlug': ApiConfig.serviceSlug};
      if (_dateFrom != null) query['from'] = _formatDate(_dateFrom!);
      if (_dateTo != null) query['to'] = _formatDate(_dateTo!);
      final data = await _api.get(ApiConfig.ticketStats, query: query);
      if (data['success'] == true && data['stats'] != null) {
        _stats =
            TicketStats.fromJson(data['stats'] as Map<String, dynamic>);
        notifyListeners();
      }
    } catch (_) {}
  }

  /// Coordinator / company-owner JWT only; others receive 401 — state cleared.
  Future<void> fetchCompanyDashboard() async {
    try {
      final data = await _api.get(ApiConfig.companyDashboard);
      if (data['success'] == true && data['dashboard'] is Map<String, dynamic>) {
        _companyDashboard = CompanyDashboardSummary.fromJson(
          data['dashboard'] as Map<String, dynamic>,
        );
        notifyListeners();
      } else {
        _companyDashboard = null;
        notifyListeners();
      }
    } catch (_) {
      _companyDashboard = null;
      notifyListeners();
    }
  }

  Future<Ticket?> fetchTicketDetail(String id) async {
    try {
      final data = await _api.get(ApiConfig.ticketDetail(id));
      if (data['success'] == true && data['ticket'] != null) {
        return Ticket.fromJson(data['ticket'] as Map<String, dynamic>);
      }
    } catch (_) {}
    return null;
  }

  Future<bool> createTicket({
    required String siteName,
    required String siteCoordinator,
    required String technique,
    int slaHours = 24,
    String? province,
    String? designSpecifications,
    List<String>? attachmentUrls,
    String? maintenanceReason,
    List<String>? beforeImageUrls,
  }) async {
    try {
      final body = <String, dynamic>{
        'siteName': siteName,
        'siteCoordinator': siteCoordinator,
        'technique': technique,
        'slaHours': slaHours,
        'province': province ?? 'N/A',
      };
      if (designSpecifications != null && designSpecifications.trim().isNotEmpty) {
        body['designSpecifications'] = designSpecifications.trim();
      }
      if (attachmentUrls != null && attachmentUrls.isNotEmpty) {
        body['attachmentUrls'] = attachmentUrls;
      }
      if (maintenanceReason != null && maintenanceReason.trim().isNotEmpty) {
        body['maintenanceReason'] = maintenanceReason.trim();
      }
      if (beforeImageUrls != null && beforeImageUrls.isNotEmpty) {
        body['beforeImageUrls'] = beforeImageUrls;
      }
      final data = await _api.post(ApiConfig.tickets, body: body);
      if (data['success'] == true) {
        await fetchTickets();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> updateTicketStatus(String id, String status) async {
    try {
      final data = await _api.patch(
        ApiConfig.ticketStatus(id),
        body: {'status': status},
      );
      if (data['success'] == true) {
        await fetchTickets();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> assignTicketToMe(String id) async {
    try {
      final data = await _api.patch(ApiConfig.ticketAssign(id));
      if (data['success'] == true) {
        await fetchTickets();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> submitNcrResubmission(
      String id, String comment, List<String> imageUrls) async {
    try {
      final data = await _api.post(
        ApiConfig.ncrResubmit(id),
        body: {'comment': comment, 'imageUrls': imageUrls},
      );
      return data['success'] == true;
    } catch (_) {}
    return false;
  }

  /// Engineer responds to requester NCR resubmission: 'approved' or 'rework'
  Future<bool> submitNcrEngineerResponse(
      String id, String action, {String? comment}) async {
    try {
      final data = await _api.post(
        ApiConfig.ncrEngineerResponse(id),
        body: {'action': action, if (comment != null && comment.isNotEmpty) 'comment': comment},
      );
      return data['success'] == true;
    } catch (_) {}
    return false;
  }

  /// Export tickets as Excel (CSV) for the current date range.
  /// Shares file via system share sheet.
  Future<String?> exportTicketsExcel() async {
    _exporting = true;
    notifyListeners();
    try {
      final query = <String, String>{
        'serviceSlug': ApiConfig.serviceSlug,
        'export': '1',
        'format': 'csv',
      };
      if (_dateFrom != null) query['from'] = _formatDate(_dateFrom!);
      if (_dateTo != null) query['to'] = _formatDate(_dateTo!);
      final bytes = await _api.getBytes(ApiConfig.tickets, query: query);
      if (bytes == null || bytes.isEmpty) return null;
      final dir = await getTemporaryDirectory();
      final dateStr = _dateFrom != null && _dateTo != null
          ? '${_formatDate(_dateFrom!)}_to_${_formatDate(_dateTo!)}'
          : DateTime.now().toIso8601String().split('T')[0];
      final file = File('${dir.path}/dashboard-export-$dateStr.csv');
      await file.writeAsBytes(bytes);
      await Share.shareXFiles([XFile(file.path)], text: 'Dashboard export');
      return file.path;
    } catch (_) {
      return null;
    } finally {
      _exporting = false;
      notifyListeners();
    }
  }

  // ─── Comments ───
  Future<List<TicketComment>> fetchComments(String ticketId) async {
    try {
      final data = await _api.get(ApiConfig.ticketComments(ticketId));
      if (data['success'] == true && data['comments'] is List) {
        return (data['comments'] as List)
            .map((e) => TicketComment.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Future<TicketComment?> addComment(String ticketId, String body) async {
    try {
      final data = await _api.post(
        ApiConfig.ticketComments(ticketId),
        body: {'body': body},
      );
      if (data['success'] == true && data['comment'] != null) {
        return TicketComment.fromJson(
            data['comment'] as Map<String, dynamic>);
      }
    } catch (_) {}
    return null;
  }

  // ─── Evidence ───
  Future<List<TicketEvidence>> fetchEvidence(String ticketId) async {
    try {
      final data = await _api.get(ApiConfig.ticketEvidence(ticketId));
      if (data['success'] == true && data['evidence'] is List) {
        return (data['evidence'] as List)
            .map((e) => TicketEvidence.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Future<TicketEvidence?> addEvidence(
      String ticketId, String fileUrl, String fileType,
      [String? description]) async {
    try {
      final data = await _api.post(
        ApiConfig.ticketEvidence(ticketId),
        body: {
          'fileUrl': fileUrl,
          'fileType': fileType,
          if (description != null) 'description': description,
        },
      );
      if (data['success'] == true && data['evidence'] != null) {
        return TicketEvidence.fromJson(
            data['evidence'] as Map<String, dynamic>);
      }
    } catch (_) {}
    return null;
  }

  // ─── Checklists ───
  Future<List<InspectionChecklist>> fetchChecklists() async {
    try {
      final data = await _api.get(ApiConfig.inspectionChecklists);
      if (data['success'] == true && data['checklists'] is List) {
        return (data['checklists'] as List)
            .map((e) =>
                InspectionChecklist.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  // ─── Complete Ticket ───
  Future<bool> completeTicket(
    String ticketId,
    Map<String, dynamic>? checklistResponse, {
    List<String>? beforeImageUrls,
    List<String>? finishingImageUrls,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (checklistResponse != null) {
        final inspectionResult = checklistResponse.remove('inspectionResult');
        final inspectionComments = checklistResponse.remove('inspectionComments');
        body['checklistResponse'] = checklistResponse;
        if (inspectionResult != null) {
          body['inspectionResult'] = inspectionResult;
        }
        if (inspectionComments != null &&
            (inspectionComments as String).isNotEmpty) {
          body['inspectionComments'] = inspectionComments;
        }
      }
      if (beforeImageUrls != null && beforeImageUrls.isNotEmpty) {
        body['beforeImageUrls'] = beforeImageUrls;
      }
      if (finishingImageUrls != null && finishingImageUrls.isNotEmpty) {
        body['finishingImageUrls'] = finishingImageUrls;
      }
      final data = await _api.patch(
        ApiConfig.ticketComplete(ticketId),
        body: body,
      );
      if (data['success'] == true) {
        await fetchTickets();
        return true;
      }
    } catch (_) {}
    return false;
  }

  // ─── Upload file ───
  /// Returns URL on success, or null on failure.
  Future<String?> uploadFile(String filePath) async {
    return _api.uploadFile(ApiConfig.uploadTicketAttachment, filePath);
  }

  /// Upload from bytes (e.g. when file_picker returns null path on web).
  Future<String?> uploadFileFromBytes(List<int> bytes, String filename) async {
    return _api.uploadFileFromBytes(
      ApiConfig.uploadTicketAttachment,
      bytes,
      filename,
    );
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
