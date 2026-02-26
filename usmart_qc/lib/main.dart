import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'services/geofence_service.dart';
import 'providers/auth_provider.dart';
import 'providers/tickets_provider.dart';
import 'providers/sites_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0A0A0F),
  ));

  final apiService = ApiService();
  final authService = AuthService(apiService);
  final notifications = NotificationService();
  await notifications.init();
  final geofenceService = GeofenceService(apiService, notifications);

  final authProvider = AuthProvider(authService, apiService);
  final ticketsProvider = TicketsProvider(apiService, notifications);
  final sitesProvider = SitesProvider(apiService);

  geofenceService.onTicketStatusChanged = () {
    ticketsProvider.fetchTickets();
  };

  await authProvider.tryAutoLogin();
  if (authProvider.isLoggedIn) {
    ticketsProvider.setCurrentUserId(authProvider.user?.id);
    await ticketsProvider.fetchTickets();
    await sitesProvider.fetchSites();
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
    geofenceService.start();
    ticketsProvider.startPolling();
  }

  authProvider.addListener(() {
    if (authProvider.isLoggedIn) {
      ticketsProvider.setCurrentUserId(authProvider.user?.id);
      geofenceService.updateData(
          sitesProvider.sites, ticketsProvider.tickets);
      geofenceService.start();
      ticketsProvider.startPolling();
    } else {
      ticketsProvider.setCurrentUserId(null);
      geofenceService.stop();
      ticketsProvider.stopPolling();
    }
  });

  ticketsProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });
  sitesProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider.value(value: ticketsProvider),
        ChangeNotifierProvider.value(value: sitesProvider),
      ],
      child: const ProvisrApp(),
    ),
  );
}
