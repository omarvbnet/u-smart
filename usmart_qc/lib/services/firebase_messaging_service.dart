import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';

import '../config/api_config.dart';
import 'api_service.dart';
import 'notification_service.dart';

/// Registers FCM token with the backend and shows foreground notifications.
class FirebaseMessagingService {
  FirebaseMessagingService(this._api, this._notifications);

  final ApiService _api;
  final NotificationService _notifications;

  Future<void> init() async {
    final messaging = FirebaseMessaging.instance;
    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    if (Platform.isIOS) {
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    await _registerToken();
    FirebaseMessaging.instance.onTokenRefresh.listen((_) => _registerToken());

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final n = message.notification;
      final title =
          n?.title ?? message.data['title']?.toString() ?? 'Provisor';
      final body = n?.body ?? message.data['body']?.toString() ?? '';
      if (body.isEmpty) return;
      _notifications.show(
        id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title: title,
        body: body,
      );
    });
  }

  Future<void> _registerToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      final platform = Platform.isIOS
          ? 'ios'
          : (Platform.isAndroid ? 'android' : 'unknown');
      await _api.post(ApiConfig.requesterPushToken, body: {
        'token': token,
        'platform': platform,
      });
    } catch (_) {}
  }
}
