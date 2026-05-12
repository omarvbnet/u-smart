import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'create_ticket_screen.dart';
import 'create_maintenance_ticket_screen.dart';

/// Shows ticket type options: Supervision & QC, and Maintenance.
/// When [maintenanceOnly] is true (e.g. private-workspace technician), only
/// maintenance is offered.
void showNewTicketTypePicker(BuildContext context, {bool maintenanceOnly = false}) {
  final l10n = AppLocalizations.of(context);

  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A1F),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('ticket_type_choose'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              if (!maintenanceOnly) ...[
                _OptionTile(
                  icon: Icons.verified_outlined,
                  label: l10n.t('ticket_type_supervision_qc'),
                  hint: l10n.t('ticket_type_supervision_qc_hint'),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const CreateTicketScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 12),
              ],
              _OptionTile(
                icon: Icons.build_circle_outlined,
                label: l10n.t('ticket_type_maintenance'),
                hint: l10n.t('ticket_type_maintenance_hint'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const CreateMaintenanceTicketScreen(),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _OptionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String hint;
  final VoidCallback onTap;

  const _OptionTile({
    required this.icon,
    required this.label,
    required this.hint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withAlpha(8),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF6C63FF).withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: const Color(0xFF6C63FF), size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hint,
                      style: TextStyle(
                        color: Colors.white.withAlpha(140),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 14,
                color: Colors.white.withAlpha(100),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
