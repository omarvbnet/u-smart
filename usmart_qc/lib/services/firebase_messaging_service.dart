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
  bool _initialized = false;
  FirebaseMessagingService(this._api, this._localNotifications);

  Future<void> init() async {
    if (_initialized) return;

    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    final messaging = FirebaseMessaging.instance;
    await messaging.setAutoInitEnabled(true);
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    if (Platform.isIOS) {
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    await _registerTokenWithRetry(messaging);
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

    _initialized = true;
  }

  Future<String?> _getSafeToken(FirebaseMessaging messaging) async {
    if (!Platform.isIOS) {
      try {
        return await messaging.getToken();
      } catch (_) {
        return null;
      }
    }

    // On iOS, APNS token can appear slightly later than app startup.
    for (var i = 0; i < 10; i++) {
      try {
        final apns = await messaging.getAPNSToken();
        if (apns != null && apns.isNotEmpty) {
          return await messaging.getToken();
        }
      } on FirebaseException catch (e) {
        if (e.code != 'apns-token-not-set') return null;
      } catch (_) {
        return null;
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }

    return null;
  }

  Future<void> _registerTokenWithRetry(FirebaseMessaging messaging) async {
    // iOS can provide APNS/FCM token after startup, so keep retrying for a while.
    for (var i = 0; i < 24; i++) {
      final token = await _getSafeToken(messaging);
      if (token != null && token.isNotEmpty) {
        await _registerToken(token);
        return;
      }
      await Future<void>.delayed(const Duration(seconds: 5));
    }
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
