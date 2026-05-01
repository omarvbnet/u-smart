import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'services/geofence_service.dart';
import 'services/firebase_messaging_service.dart';
import 'providers/auth_provider.dart';
import 'providers/tickets_provider.dart';
import 'providers/sites_provider.dart';
import 'providers/notifications_provider.dart';
import 'providers/locale_provider.dart';
import 'providers/conflicts_provider.dart';
import 'providers/registration_request_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0A0A0F),
  ));

  final apiService = ApiService();
  final authService = AuthService(apiService);
  final notifications = NotificationService();
  await notifications.init();
  final firebaseMessaging = FirebaseMessagingService(apiService, notifications);
  final geofenceService = GeofenceService(apiService, notifications);

  final authProvider = AuthProvider(authService, apiService);
  final ticketsProvider = TicketsProvider(apiService, notifications);
  final sitesProvider = SitesProvider(apiService);
  final notificationsProvider = NotificationsProvider(apiService, notifications);

  geofenceService.onTicketStatusChanged = () {
    ticketsProvider.fetchTickets();
  };

  await authProvider.tryAutoLogin();
  if (authProvider.isLoggedIn) {
    await firebaseMessaging.init();
    ticketsProvider.setCurrentUserId(authProvider.user?.id);
    await ticketsProvider.fetchTickets();
    await sitesProvider.fetchSites();
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
    geofenceService.start();
    ticketsProvider.startPolling();
    notificationsProvider.startPolling();
  }

  authProvider.addListener(() {
    if (authProvider.isLoggedIn) {
      firebaseMessaging.init();
      ticketsProvider.setCurrentUserId(authProvider.user?.id);
      geofenceService.updateData(
          sitesProvider.sites, ticketsProvider.tickets);
      geofenceService.start();
      ticketsProvider.startPolling();
      notificationsProvider.startPolling();
    } else {
      ticketsProvider.setCurrentUserId(null);
      geofenceService.stop();
      ticketsProvider.stopPolling();
      notificationsProvider.stopPolling();
    }
  });

  ticketsProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });
  sitesProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });

  final localeProvider = LocaleProvider();
  final conflictsProvider = ConflictsProvider(apiService);
  final registrationRequestProvider = RegistrationRequestProvider(apiService);

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider.value(value: ticketsProvider),
        ChangeNotifierProvider.value(value: sitesProvider),
        ChangeNotifierProvider.value(value: notificationsProvider),
        ChangeNotifierProvider.value(value: localeProvider),
        ChangeNotifierProvider.value(value: conflictsProvider),
        ChangeNotifierProvider.value(value: registrationRequestProvider),
      ],
      child: const ProvisrApp(),
    ),
  );
}
