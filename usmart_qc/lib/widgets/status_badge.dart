import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final double fontSize;
  final AppLocalizations? localizations;

  const StatusBadge({super.key, required this.status, this.fontSize = 11, this.localizations});

  @override
  Widget build(BuildContext context) {
    final l10n = localizations ?? AppLocalizations.of(context);
    final config = _statusConfig(status, l10n);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [config.bg, config.bg.withAlpha(40)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: config.border, width: 1),
        boxShadow: [
          BoxShadow(
            color: config.text.withAlpha(30),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: config.text,
              boxShadow: [
                BoxShadow(
                  color: config.text.withAlpha(120),
                  blurRadius: 4,
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            config.label,
            style: TextStyle(
              color: config.text,
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }

  static _StatusConfig _statusConfig(String status, AppLocalizations l10n) {
    switch (status.toUpperCase()) {
      case 'ASSIGNED':
        return _StatusConfig(
          label: l10n.t('status_assigned'),
          bg: const Color(0x408B83FF),
          border: const Color(0x608B83FF),
          text: const Color(0xFF8B83FF),
        );
      case 'PENDING':
        return _StatusConfig(
          label: l10n.t('section_pending'),
          bg: const Color(0x40F59E0B),
          border: const Color(0x60F59E0B),
          text: const Color(0xFFFBBF24),
        );
      case 'ON_SITE':
        return _StatusConfig(
          label: l10n.t('section_on_site'),
          bg: const Color(0x406C63FF),
          border: const Color(0x606C63FF),
          text: const Color(0xFF8B83FF),
        );
      case 'IN_PROGRESS':
        return _StatusConfig(
          label: l10n.t('section_in_progress'),
          bg: const Color(0x4000D4AA),
          border: const Color(0x6000D4AA),
          text: const Color(0xFF00D4AA),
        );
      case 'COMPLETED':
        return _StatusConfig(
          label: l10n.t('section_completed'),
          bg: const Color(0x4022C55E),
          border: const Color(0x6022C55E),
          text: const Color(0xFF4ADE80),
        );
      case 'RESUBMISSION':
        return _StatusConfig(
          label: l10n.t('ticket_status_resubmission'),
          bg: const Color(0x40F59E0B),
          border: const Color(0x60F59E0B),
          text: const Color(0xFFFBBF24),
        );
      case 'REQUESTER_CONFIRMED':
        return _StatusConfig(
          label: l10n.t('ticket_status_requester_confirmed'),
          bg: const Color(0x4006B6D4),
          border: const Color(0x6006B6D4),
          text: const Color(0xFF22D3EE),
        );
      case 'CANCELLED':
        return _StatusConfig(
          label: l10n.t('section_cancelled'),
          bg: const Color(0x40F87171),
          border: const Color(0x60F87171),
          text: const Color(0xFFF87171),
        );
      default:
        return _StatusConfig(
          label: status,
          bg: const Color(0x406B7280),
          border: const Color(0x606B7280),
          text: const Color(0xFF9CA3AF),
        );
    }
  }
}

class _StatusConfig {
  final String label;
  final Color bg;
  final Color border;
  final Color text;
  _StatusConfig(
      {required this.label,
      required this.bg,
      required this.border,
      required this.text});
}
