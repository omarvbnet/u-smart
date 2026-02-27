import 'package:flutter/material.dart';
import 'translations.dart';

class AppLocalizations {
  final Locale locale;
  final Map<String, String> _strings;

  AppLocalizations(this.locale) : _strings = allTranslations[locale.languageCode] ?? allTranslations['en']!;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  String t(String key, [Map<String, String>? params]) {
    String s = _strings[key] ?? key;
    if (params != null) {
      for (final e in params.entries) {
        s = s.replaceAll('{{${e.key}}}', e.value);
      }
    }
    return s;
  }

  static const List<Locale> supportedLocales = [
    Locale('en'),
    Locale('ar'),
    Locale('ku'),
    Locale('tr'),
  ];

  static bool isRtl(String code) => code == 'ar' || code == 'ku';
}
