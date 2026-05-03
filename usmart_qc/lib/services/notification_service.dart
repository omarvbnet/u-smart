import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Local notifications (tickets, geofence, notification polling).
/// Android channel `provisor_channel` matches AndroidManifest.xml.
class NotificationService {
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  Future<void> init() async {
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );
    await _plugin.initialize(settings: initSettings);

    const channel = AndroidNotificationChannel(
      'provisor_channel',
      'Provisor',
      description: 'Ticket updates and site alerts',
      importance: Importance.high,
    );
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
  }) async {
    const android = AndroidNotificationDetails(
      'provisor_channel',
      'Provisor',
      channelDescription: 'Ticket updates and site alerts',
      importance: Importance.high,
      priority: Priority.high,
    );
    const ios = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    const details = NotificationDetails(android: android, iOS: ios);
    await _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: details,
    );
  }
}
