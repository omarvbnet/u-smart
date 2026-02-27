import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/locale_provider.dart';

/// Shows a bottom sheet to pick language (en, ar, ku, tr).
void showLanguageSelector(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  final localeProv = context.read<LocaleProvider>();

  final codes = ['en', 'ar', 'ku', 'tr'];
  final keys = ['lang_en', 'lang_ar', 'lang_ku', 'lang_tr'];

  showModalBottomSheet(
    context: context,
    backgroundColor: const Color(0xFF12122A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('change_language'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              ...List.generate(codes.length, (i) {
                final code = codes[i];
                final isSelected = localeProv.locale.languageCode == code;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: isSelected
                        ? const Color(0xFF6C63FF).withAlpha(25)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      onTap: () {
                        localeProv.setLocaleFromCode(code);
                        Navigator.pop(ctx);
                      },
                      borderRadius: BorderRadius.circular(14),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        child: Row(
                          children: [
                            Text(
                              l10n.t(keys[i]),
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight:
                                    isSelected ? FontWeight.w600 : FontWeight.w500,
                              ),
                            ),
                            if (isSelected) ...[
                              const Spacer(),
                              const Icon(
                                Icons.check_circle_rounded,
                                color: Color(0xFF6C63FF),
                                size: 22,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      );
    },
  );
}
