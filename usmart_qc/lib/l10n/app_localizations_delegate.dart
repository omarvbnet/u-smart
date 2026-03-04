import 'package:flutter/material.dart';
import '../providers/locale_provider.dart';
import 'app_localizations.dart';

class AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) {
    return AppLocalizations.supportedLocales
        .any((l) => l.languageCode == locale.languageCode);
  }

  @override
  Future<AppLocalizations> load(Locale locale) async {
    // When user chose Kurdish (ku), MaterialApp uses 'ar' for system widgets.
    // Use override so our app strings come from Kurdish.
    final code = appLanguageCodeOverride ?? locale.languageCode;
    return AppLocalizations(Locale(code));
  }

  @override
  bool shouldReload(AppLocalizationsDelegate old) => false;
}
