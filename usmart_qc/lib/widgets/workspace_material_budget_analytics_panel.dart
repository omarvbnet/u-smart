import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/private_company_warehouse_provider.dart';

/// Shown on engineer / technician analytics when the user is in an approved
/// private workspace — mirrors warehouse budget lines for self-tracking.
///
/// When [skipInitialLoad] is true, the parent is responsible for calling
/// [PrivateCompanyWarehouseProvider.loadStaffMaterialBudgets] (e.g. combined field-staff panel).
class WorkspaceMaterialBudgetAnalyticsPanel extends StatefulWidget {
  const WorkspaceMaterialBudgetAnalyticsPanel({super.key, this.skipInitialLoad = false});

  final bool skipInitialLoad;

  @override
  State<WorkspaceMaterialBudgetAnalyticsPanel> createState() =>
      _WorkspaceMaterialBudgetAnalyticsPanelState();
}

class _WorkspaceMaterialBudgetAnalyticsPanelState
    extends State<WorkspaceMaterialBudgetAnalyticsPanel> {
  @override
  void initState() {
    super.initState();
    if (widget.skipInitialLoad) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    final pc = context.read<PrivateCompanyProvider>();
    if (!pc.hasWorkspace || !pc.isApproved) return;
    await context.read<PrivateCompanyWarehouseProvider>().loadStaffMaterialBudgets();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final auth = context.watch<AuthProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final wh = context.watch<PrivateCompanyWarehouseProvider>();

    final show = pc.hasWorkspace &&
        pc.isApproved &&
        (auth.isEngineer || auth.isTechnician);

    if (!show) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Text(
          l10n.t('analytics_material_budget'),
          style: TextStyle(
            color: Colors.white.withAlpha(200),
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('analytics_material_budget_hint'),
          style: TextStyle(
            color: Colors.white.withAlpha(120),
            fontSize: 11,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 12),
        if (wh.staffMaterialBudgetLines.isEmpty)
          Text(
            l10n.t('analytics_material_budget_empty'),
            style: TextStyle(
              color: Colors.white.withAlpha(100),
              fontSize: 12,
            ),
          )
        else
          ...wh.staffMaterialBudgetLines.map((row) {
            final mat = row['material'] as Map<String, dynamic>?;
            final name = mat?['name'] as String? ?? '—';
            final unit = (mat?['unit'] as String?)?.trim();
            final title = unit != null && unit.isNotEmpty ? '$name ($unit)' : name;
            final cap = (row['budgetQuantity'] as num?)?.toInt() ?? 0;
            final assigned = (row['assignedQuantity'] as num?)?.toInt() ?? 0;
            final avail = (row['availableToAssign'] as num?)?.toInt() ?? 0;
            final used = (row['usedLifetimeQuantity'] as num?)?.toInt() ?? 0;
            final dmg = (row['damagedLifetime'] as num?)?.toInt() ?? 0;
            final lost = (row['lostLifetime'] as num?)?.toInt() ?? 0;
            final ret = (row['returnedLifetime'] as num?)?.toInt() ?? 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withAlpha(14)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      l10n.t('analytics_material_budget_stats', {
                        'cap': '$cap',
                        'asg': '$assigned',
                        'av': '$avail',
                        'us': '$used',
                        'dm': '$dmg',
                        'ls': '$lost',
                        'rt': '$ret',
                      }),
                      style: TextStyle(
                        color: Colors.white.withAlpha(150),
                        fontSize: 11,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}
