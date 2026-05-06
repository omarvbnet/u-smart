import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/sites_provider.dart';

/// Share an owned site with another requester; optional ticket visibility for recipient.
Future<void> promptShareSite({
  required BuildContext context,
  required SitesProvider provider,
  required Site site,
  required AppLocalizations l10n,
}) async {
  final ctrl = TextEditingController();
  bool includeTickets = true;

  final result = await showDialog<({String text, bool includeTickets})?>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          l10n.t('site_share_title'),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: ctrl,
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('site_share_hint'),
                  hintStyle: TextStyle(color: Colors.white.withAlpha(120)),
                  filled: true,
                  fillColor: const Color(0xFF05051A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                l10n.t('site_share_scope_title'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: Text(l10n.t('site_share_with_tickets')),
                    selected: includeTickets,
                    onSelected: (_) => setSt(() => includeTickets = true),
                    selectedColor: const Color(0xFF6C63FF).withAlpha(180),
                    labelStyle: TextStyle(
                      color: includeTickets ? Colors.white : Colors.white.withAlpha(170),
                      fontSize: 13,
                    ),
                  ),
                  ChoiceChip(
                    label: Text(l10n.t('site_share_location_only')),
                    selected: !includeTickets,
                    onSelected: (_) => setSt(() => includeTickets = false),
                    selectedColor: const Color(0xFF6C63FF).withAlpha(180),
                    labelStyle: TextStyle(
                      color: !includeTickets ? Colors.white : Colors.white.withAlpha(170),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () {
              final text = ctrl.text.trim();
              if (text.isEmpty) return;
              Navigator.pop(ctx, (text: text, includeTickets: includeTickets));
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6C63FF)),
            child: Text(l10n.t('site_share_action')),
          ),
        ],
      ),
    ),
  );

  final text = result?.text ?? '';
  final tickets = result?.includeTickets ?? true;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    ctrl.dispose();
  });

  if (result == null || text.isEmpty || !context.mounted) return;

  final errMessage = await provider.shareSite(site.id, text, includeTickets: tickets);
  if (!context.mounted) return;
  if (errMessage == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.t('site_share_ok')),
        backgroundColor: const Color(0xFF00D4AA),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content:
          Text(errMessage.isNotEmpty ? errMessage : l10n.t('site_share_failed')),
      backgroundColor: const Color(0xFFFF4757),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}
