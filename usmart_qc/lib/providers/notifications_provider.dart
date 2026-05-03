import 'dart:async';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';

class AppNotification {
  final String id;
  final String type;
  final String title;
  final String message;
  final String? ticketId;
  final bool read;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    this.ticketId,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      message: json['message'] as String? ?? '',
      ticketId: json['ticketId'] as String?,
      read: json['read'] as bool? ?? false,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
    );
  }
}

class NotificationsProvider extends ChangeNotifier {
  final ApiService _api;
  final NotificationService _localNotifications;

  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  Timer? _pollTimer;
  final Set<String> _shownIds = {};
  /// After the first successful fetch, new unread rows trigger local toasts.
  bool _baselineSynced = false;

  NotificationsProvider(this._api, this._localNotifications);

  /// Call on login and logout so polling dedupe matches the current session.
  void resetSession() {
    _shownIds.clear();
    _baselineSynced = false;
    _notifications = [];
    _unreadCount = 0;
    notifyListeners();
  }

  static int stableNotificationId(String id) {
    var h = id.hashCode;
    if (h == 0) h = 1;
    final u = h & 0x7fffffff;
    return u == 0 ? 1 : u;
  }

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;

  void startPolling() {
    _pollTimer?.cancel();
    _fetchNotifications();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _fetchNotifications(),
    );
  }

  void stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  void _applySuccessfulFetch(List<AppNotification> list, int unreadCount) {
    _unreadCount = unreadCount;

    if (!_baselineSynced) {
      for (final n in list) {
        _shownIds.add(n.id);
      }
      _baselineSynced = true;
    } else {
      for (final n in list) {
        if (!n.read && !_shownIds.contains(n.id)) {
          _shownIds.add(n.id);
          _localNotifications.show(
            id: stableNotificationId(n.id),
            title: n.title,
            body: n.message,
          );
        }
      }
    }

    _notifications = list;
    notifyListeners();
  }

  Future<void> _fetchNotifications() async {
    try {
      final data = await _api.get(
        ApiConfig.notifications,
        query: {'for': 'requester'},
      );
      if (data['success'] != true) return;

      final list = (data['notifications'] as List? ?? [])
          .map((e) =>
              AppNotification.fromJson(e as Map<String, dynamic>))
          .toList();
      final unreadCount = (data['unreadCount'] as int?) ?? 0;
      _applySuccessfulFetch(list, unreadCount);
    } catch (_) {
      try {
        final data = await _api.getSafe(
          ApiConfig.notifications,
          query: {'for': 'requester'},
        );
        if (data == null || data['success'] != true) return;
        final list = (data['notifications'] as List? ?? [])
            .map((e) =>
                AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        final unreadCount = (data['unreadCount'] as int?) ?? 0;
        _applySuccessfulFetch(list, unreadCount);
      } catch (_) {}
    }
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _api.patch(
        ApiConfig.notificationMarkRead(notificationId),
        body: {'read': true},
      );
      final idx = _notifications.indexWhere((n) => n.id == notificationId);
      if (idx >= 0 && !_notifications[idx].read) {
        _notifications[idx] = AppNotification(
          id: _notifications[idx].id,
          type: _notifications[idx].type,
          title: _notifications[idx].title,
          message: _notifications[idx].message,
          ticketId: _notifications[idx].ticketId,
          read: true,
          createdAt: _notifications[idx].createdAt,
        );
        _unreadCount = (_unreadCount - 1).clamp(0, 999);
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> refresh() async => _fetchNotifications();

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
