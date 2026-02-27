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
  bool _initialized = false;

  NotificationsProvider(this._api, this._localNotifications);

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

  Future<void> _fetchNotifications() async {
    try {
      Map<String, dynamic> data;
      try {
        data = await _api.get('${ApiConfig.notifications}?for=requester');
      } catch (_) {
        return;
      }
      if (data['success'] == true) {
        final list = (data['notifications'] as List? ?? [])
            .map((e) =>
                AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        _unreadCount = (data['unreadCount'] as int?) ?? 0;

        for (final n in list) {
          if (!n.read && !_shownIds.contains(n.id) && _initialized) {
            _shownIds.add(n.id);
            _localNotifications.show(
              id: n.id.hashCode,
              title: n.title,
              body: n.message,
            );
          }
        }

        if (!_initialized) {
          for (final n in list) {
            _shownIds.add(n.id);
          }
          _initialized = true;
        }

        _notifications = list;
        notifyListeners();
      }
    } catch (_) {
      // Silently handle errors (e.g. backend not redeployed yet)
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
