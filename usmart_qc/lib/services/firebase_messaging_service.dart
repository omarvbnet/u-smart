import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../config/api_config.dart';
import 'api_service.dart';
import 'notification_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class FirebaseMessagingService {
  final ApiService _api;
  final NotificationService _localNotifications;
  FirebaseMessagingService(this._api, this._localNotifications);

  Future<void> init() async {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      await _registerToken(token);
    }
    FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      await _registerToken(token);
    });
    FirebaseMessaging.onMessage.listen((message) async {
      final title = message.notification?.title ?? 'Provisor';
      final body = message.notification?.body ?? 'You have a new notification';
      await _localNotifications.show(
        id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title: title,
        body: body,
      );
    });
  }

  Future<void> _registerToken(String token) async {
    try {
      await _api.post(ApiConfig.requesterPushToken, body: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown'),
      });
    } catch (_) {}
  }
}
