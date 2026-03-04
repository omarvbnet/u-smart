import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/app_localizations.dart';

const String _localeKey = 'provisor_locale';

/// User's chosen language code. Used by AppLocalizationsDelegate when
/// Flutter's Material uses a fallback locale (e.g. 'ar' for 'ku').
String? appLanguageCodeOverride;

class LocaleProvider extends ChangeNotifier {
  Locale _locale = const Locale('en');

  Locale get locale => _locale;

  /// Locale to pass to MaterialApp. Uses 'ar' for 'ku' since Flutter's
  /// MaterialLocalizations doesn't support Kurdish.
  Locale get effectiveLocale =>
      _locale.languageCode == 'ku' ? const Locale('ar') : _locale;

  bool get isRtl => AppLocalizations.isRtl(_locale.languageCode);

  LocaleProvider() {
    _loadLocale();
  }

  Future<void> _loadLocale() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final code = prefs.getString(_localeKey);
      if (code != null && AppLocalizations.supportedLocales.any((l) => l.languageCode == code)) {
        _locale = Locale(code);
        appLanguageCodeOverride = code;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> setLocale(Locale locale) async {
    if (_locale == locale) return;
    _locale = locale;
    appLanguageCodeOverride = locale.languageCode;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_localeKey, locale.languageCode);
    } catch (_) {}
  }

  Future<void> setLocaleFromCode(String code) async {
    final locale = AppLocalizations.supportedLocales.firstWhere(
      (l) => l.languageCode == code,
      orElse: () => const Locale('en'),
    );
    await setLocale(locale);
  }
}
