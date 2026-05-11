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
import 'providers/provisor_techniques_provider.dart';
import 'providers/private_company_provider.dart';
import 'providers/private_company_warehouse_provider.dart';
import 'config/api_config.dart';

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
  final techniquesProvider = ProvisorTechniquesProvider(apiService);

  geofenceService.onTicketStatusChanged = () {
    ticketsProvider.fetchTickets();
  };

  authProvider.addListener(() {
    if (authProvider.isLoggedIn) {
      notificationsProvider.resetSession();
      firebaseMessaging.init();
      ticketsProvider.setCurrentUserId(authProvider.user?.id);
      techniquesProvider.fetch();
      geofenceService.updateData(
          sitesProvider.sites, ticketsProvider.tickets);
      geofenceService.start();
      ticketsProvider.startPolling();
      notificationsProvider.startPolling();
      Future.microtask(() async {
        await ticketsProvider.refreshAnalyticsForSession(
          hasCoordinatorCompany: authProvider.hasCoordinatorCompany,
        );
      });
    } else {
      ticketsProvider.setCurrentUserId(null);
      geofenceService.stop();
      ticketsProvider.stopPolling();
      notificationsProvider.stopPolling();
      notificationsProvider.resetSession();
    }
  });

  ticketsProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });
  sitesProvider.addListener(() {
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
  });

  final localeProvider = LocaleProvider();
  apiService.setRequestLocale(localeProvider.locale.languageCode);
  localeProvider.addListener(() {
    apiService.setRequestLocale(localeProvider.locale.languageCode);
  });
  localeProvider.setLocaleCommitHandler(() async {
    if (!authProvider.isLoggedIn) return;
    try {
      await apiService.patch(ApiConfig.requesterUpdate, body: {
        'preferredLocale': localeProvider.locale.languageCode,
      });
    } catch (_) {}
  });

  final conflictsProvider = ConflictsProvider(apiService);
  final registrationRequestProvider = RegistrationRequestProvider(apiService);
  final privateCompanyProvider = PrivateCompanyProvider(apiService);
  final privateCompanyWarehouseProvider =
      PrivateCompanyWarehouseProvider(apiService);

  authProvider.addListener(() {
    privateCompanyProvider.setCurrentRequesterId(authProvider.user?.id);
    if (authProvider.isLoggedIn) {
      privateCompanyProvider.refresh();
    } else {
      privateCompanyProvider.reset();
      privateCompanyWarehouseProvider.reset();
    }
  });

  // Keep warehouse data fresh once the workspace is approved.
  privateCompanyProvider.addListener(() {
    if (privateCompanyProvider.isApproved &&
        authProvider.isLoggedIn &&
        privateCompanyWarehouseProvider.dashboard == null &&
        !privateCompanyWarehouseProvider.loading) {
      privateCompanyWarehouseProvider.refreshAll();
    }
  });

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
        ChangeNotifierProvider.value(value: techniquesProvider),
        ChangeNotifierProvider.value(value: privateCompanyProvider),
        ChangeNotifierProvider.value(value: privateCompanyWarehouseProvider),
      ],
      child: const ProvisrApp(),
    ),
  );

  _bootstrapAfterLaunch(
    authProvider: authProvider,
    ticketsProvider: ticketsProvider,
    sitesProvider: sitesProvider,
    notificationsProvider: notificationsProvider,
    firebaseMessaging: firebaseMessaging,
    geofenceService: geofenceService,
    techniquesProvider: techniquesProvider,
  );
}

/// Runs after [runApp] so [SplashScreen] can show during cold start instead of
/// only the native splash while auth and session restore complete.
Future<void> _bootstrapAfterLaunch({
  required AuthProvider authProvider,
  required TicketsProvider ticketsProvider,
  required SitesProvider sitesProvider,
  required NotificationsProvider notificationsProvider,
  required FirebaseMessagingService firebaseMessaging,
  required GeofenceService geofenceService,
  required ProvisorTechniquesProvider techniquesProvider,
}) async {
  await authProvider.tryAutoLogin();
  if (authProvider.isLoggedIn) {
    notificationsProvider.resetSession();
    await firebaseMessaging.init();
    ticketsProvider.setCurrentUserId(authProvider.user?.id);
    await ticketsProvider.fetchTickets();
    await sitesProvider.fetchSites();
    await techniquesProvider.fetch();
    geofenceService.updateData(sitesProvider.sites, ticketsProvider.tickets);
    geofenceService.start();
    ticketsProvider.startPolling();
    notificationsProvider.startPolling();
  }
}
