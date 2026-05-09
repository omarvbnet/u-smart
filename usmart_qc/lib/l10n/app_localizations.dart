import 'package:flutter/material.dart';
import 'translations.dart';

class AppLocalizations {
  final Locale locale;
  final Map<String, String> _strings;

  AppLocalizations(this.locale) : _strings = _resolveStrings(locale.languageCode);

  static Map<String, String> _resolveStrings(String code) {
    final resolved = code == 'ckb' ? 'ku' : code;
    return allTranslations[resolved] ?? allTranslations['en']!;
  }

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

  /// Success copy after [/api/auth/requester-otp/send] — aligned with JSON `otpChannel`.
  String otpDeliverySuccessMessage(String? otpChannel) {
    switch (otpChannel) {
      case 'whatsapp':
        return t('requester_otp_sent_whatsapp');
      case 'sms':
        return t('requester_otp_sent_sms');
      default:
        return t('requester_otp_sent');
    }
  }

  static const List<Locale> supportedLocales = [
    Locale('en'),
    Locale('ar'),
    Locale('ku'),
    Locale('tr'),
  ];

  static bool isRtl(String code) => code == 'ar' || code == 'ku' || code == 'ckb';
}
