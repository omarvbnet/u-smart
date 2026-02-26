import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../config/api_config.dart';
import '../models/site.dart';
import '../models/ticket.dart';
import 'api_service.dart';
import 'notification_service.dart';

class GeofenceService {
  final ApiService _api;
  final NotificationService _notifications;
  StreamSubscription<Position>? _positionSub;
  final Map<String, Timer> _inProgressTimers = {};
  List<Site> _sites = [];
  List<Ticket> _tickets = [];
  bool _running = false;

  void Function()? onTicketStatusChanged;

  GeofenceService(this._api, this._notifications);

  bool get isRunning => _running;

  void updateData(List<Site> sites, List<Ticket> tickets) {
    _sites = sites.where((s) => s.hasCoordinates).toList();
    _tickets = tickets;
  }

  Future<bool> _ensurePermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) return false;
    }
    if (perm == LocationPermission.deniedForever) return false;
    return true;
  }

  Future<void> start() async {
    if (_running) return;
    final ok = await _ensurePermission();
    if (!ok) return;
    _running = true;

    const settings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 50,
    );

    _positionSub = Geolocator.getPositionStream(locationSettings: settings)
        .listen(_onPosition);
  }

  void stop() {
    _running = false;
    _positionSub?.cancel();
    _positionSub = null;
    for (final timer in _inProgressTimers.values) {
      timer.cancel();
    }
    _inProgressTimers.clear();
  }

  void _onPosition(Position pos) {
    for (final site in _sites) {
      if (!site.hasCoordinates) continue;

      final distance = Geolocator.distanceBetween(
        pos.latitude,
        pos.longitude,
        site.latitude!,
        site.longitude!,
      );

      if (distance <= ApiConfig.geofenceRadiusMeters) {
        _onEnteredSite(site);
      }
    }
  }

  Future<void> _onEnteredSite(Site site) async {
    final pendingTickets = _tickets
        .where((t) =>
            t.isPending &&
            t.siteName != null &&
            t.siteName!.toLowerCase() == site.siteId.toLowerCase())
        .toList();

    for (final ticket in pendingTickets) {
      await _updateStatus(ticket.id, 'ON_SITE', site.siteId);
    }
  }

  Future<void> _updateStatus(
      String ticketId, String newStatus, String siteName) async {
    try {
      final data = await _api.patch(
        ApiConfig.ticketStatus(ticketId),
        body: {'status': newStatus},
      );

      if (data['success'] == true) {
        if (newStatus == 'ON_SITE') {
          _notifications.show(
            id: ticketId.hashCode,
            title: 'Arrived at $siteName',
            body: 'Status changed to On Site',
          );
          _startInProgressTimer(ticketId, siteName);
        } else if (newStatus == 'IN_PROGRESS') {
          _notifications.show(
            id: ticketId.hashCode + 1,
            title: siteName,
            body: 'Ticket now In Progress',
          );
        }
        onTicketStatusChanged?.call();
      }
    } catch (e) {
      // Silently fail; will retry on next position update
    }
  }

  void _startInProgressTimer(String ticketId, String siteName) {
    _inProgressTimers[ticketId]?.cancel();
    _inProgressTimers[ticketId] = Timer(
      Duration(minutes: ApiConfig.autoInProgressMinutes),
      () => _updateStatus(ticketId, 'IN_PROGRESS', siteName),
    );
  }
}
