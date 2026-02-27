import 'dart:async';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/ticket.dart';
import '../models/stats.dart';
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
  bool _loading = false;
  String? _error;
  Timer? _pollTimer;
  int _lastTicketCount = 0;

  String? _currentUserId;

  TicketsProvider(this._api, this._notifications);

  void setCurrentUserId(String? id) => _currentUserId = id;

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

  // Engineer-specific: available tickets (PENDING + not assigned)
  List<Ticket> get availableTickets =>
      _tickets.where((t) => t.isPending && !t.isAssigned).toList();

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

  TicketStats? get stats => _stats;
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
      final data = await _api.get(ApiConfig.tickets, query: {
        'serviceSlug': ApiConfig.serviceSlug,
      });
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
      final data = await _api.get(ApiConfig.ticketStats, query: {
        'serviceSlug': ApiConfig.serviceSlug,
      });
      if (data['success'] == true && data['stats'] != null) {
        _stats =
            TicketStats.fromJson(data['stats'] as Map<String, dynamic>);
        notifyListeners();
      }
    } catch (_) {}
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
  }) async {
    try {
      final data = await _api.post(ApiConfig.tickets, body: {
        'siteName': siteName,
        'siteCoordinator': siteCoordinator,
        'technique': technique,
        'slaHours': slaHours,
        'province': province ?? 'N/A',
      });
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
      String ticketId, Map<String, dynamic>? checklistResponse) async {
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
  Future<String?> uploadFile(String filePath) async {
    try {
      final url = await _api.uploadFile(
          ApiConfig.uploadTicketAttachment, filePath);
      return url;
    } catch (_) {}
    return null;
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
