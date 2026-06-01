import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'l10n/app_localizations.dart';
import 'l10n/app_localizations_delegate.dart';
import 'utils/location_permissions.dart';
import 'providers/auth_provider.dart';
import 'providers/locale_provider.dart';
import 'screens/login_screen.dart';
import 'screens/company_dashboard_screen.dart';
import 'screens/engineer_dashboard_screen.dart';
import 'screens/splash_screen.dart';

class ProvisrApp extends StatelessWidget {
  const ProvisrApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthProvider, LocaleProvider>(
      builder: (context, auth, localeProv, _) {
        final locale = localeProv.effectiveLocale;
        final isRtl = localeProv.isRtl;
        return Directionality(
          textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
          child: MaterialApp(
            title: 'Provisor',
            debugShowCheckedModeBanner: false,
            navigatorKey: LocationPermissions.navigatorKey,
            locale: locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: const [
              AppLocalizationsDelegate(),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF05051A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF6C63FF),
          secondary: Color(0xFF00D4AA),
          surface: Color(0xFF12122A),
          error: Color(0xFFFF4757),
        ),
        useMaterial3: true,
        fontFamily: isRtl ? null : 'Inter',
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: CupertinoPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),
            ),
            home: auth.loading
          ? const SplashScreen()
          : auth.isLoggedIn
              ? (auth.isEngineer
                  ? const EngineerDashboardScreen()
                  : const CompanyDashboardScreen()) // COMPANY, PERSONAL, TECHNICIAN, WORKER
              : const LoginScreen(),
          ),
        );
      },
    );
  }
}
