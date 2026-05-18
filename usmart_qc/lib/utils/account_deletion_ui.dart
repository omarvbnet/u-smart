import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';

/// Shows confirmation, schedules deletion (7-day grace), and signs the user out.
Future<void> confirmScheduleAccountDeletion(
  BuildContext context,
  AuthProvider auth,
) async {
  final l10n = AppLocalizations.of(context);
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: Text(
        l10n.t('delete_account_title'),
        style: const TextStyle(color: Colors.white),
      ),
      content: Text(
        l10n.t('delete_account_grace_body'),
        style: const TextStyle(color: Colors.white70, height: 1.45),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(l10n.t('cancel')),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(
            l10n.t('delete_account_confirm'),
            style: const TextStyle(color: Color(0xFFFF6B6B)),
          ),
        ),
      ],
    ),
  );

  if (confirmed != true || !context.mounted) return;

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const Center(child: CircularProgressIndicator()),
  );

  final result = await auth.scheduleAccountDeletion();
  if (!context.mounted) return;
  Navigator.of(context, rootNavigator: true).pop();

  if (result.ok) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result.message ?? l10n.t('delete_account_scheduled')),
        backgroundColor: const Color(0xFF00D4AA),
        duration: const Duration(seconds: 6),
      ),
    );
  } else {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result.error ?? l10n.t('delete_account_failed')),
        backgroundColor: const Color(0xFFFF4757),
      ),
    );
  }
}
