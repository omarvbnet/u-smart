import 'dart:async';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/ticket.dart';
import '../models/stats.dart';
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

  TicketsProvider(this._api, this._notifications);

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

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
