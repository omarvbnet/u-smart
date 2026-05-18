import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../providers/tickets_provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../models/private_company_warehouse.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/private_company_warehouse_provider.dart';
import 'workspace_cancellations_analytics_panel.dart';
import 'workspace_expenses_analytics_panel.dart';
import 'workspace_material_budget_analytics_panel.dart';

/// Loads workspace KPIs, material requests (mine), and staff material budgets when
/// the signed-in user is an approved private-workspace engineer or technician.
Future<void> refreshWorkspaceFieldStaffAnalytics(BuildContext context) async {
  if (!context.mounted) return;
  final auth = context.read<AuthProvider>();
  final pc = context.read<PrivateCompanyProvider>();
  final wh = context.read<PrivateCompanyWarehouseProvider>();
  if (!pc.canOpenPrivateWorkspace) return;
  if (!auth.isEngineer && !auth.isTechnician && !pc.isPrivateWorkspaceFieldStaff) {
    return;
  }
  await Future.wait([
    pc.checkWorkspaceSiteArrival(),
    pc.fetchKpis(days: 365),
    () {
      final n = DateTime.now();
      final end = DateTime(n.year, n.month, n.day);
      final start = end.subtract(const Duration(days: 89));
      return pc.fetchExpenseAnalytics(from: start, to: end);
    }(),
    wh.refreshMaterialRequests('mine'),
    wh.loadStaffMaterialBudgets(),
  ]);
  if (context.mounted) {
    try {
      await context.read<TicketsProvider>().fetchTickets();
    } catch (_) {
      /* tickets provider may be absent on some screens */
    }
  }
}

/// Private-workspace engineers and technicians: performance KPIs (self),
/// material requests (mine), and material budget lines — one refresh surface.
class WorkspaceFieldStaffAnalyticsPanel extends StatefulWidget {
  const WorkspaceFieldStaffAnalyticsPanel({super.key});

  @override
  State<WorkspaceFieldStaffAnalyticsPanel> createState() =>
      _WorkspaceFieldStaffAnalyticsPanelState();
}

class _WorkspaceFieldStaffAnalyticsPanelState extends State<WorkspaceFieldStaffAnalyticsPanel> {
  bool _initialRefreshDone = false;

  static String _fmtHours(double h) {
    if (h < 1) return '${(h * 60).round()} min';
    return '${h.toStringAsFixed(1)} h';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await refreshWorkspaceFieldStaffAnalytics(context);
      if (mounted) setState(() => _initialRefreshDone = true);
    });
  }

  PrivateCompanyStaffKpi? _myKpi(PrivateCompanyKpiSnapshot? snap, String? userId) {
    if (snap == null || snap.byStaff.isEmpty) return null;
    if (userId != null && userId.isNotEmpty) {
      for (final r in snap.byStaff) {
        if (r.staffId == userId) return r;
      }
    }
    return snap.byStaff.length == 1 ? snap.byStaff.first : null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final auth = context.watch<AuthProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final wh = context.watch<PrivateCompanyWarehouseProvider>();

    final show = pc.canOpenPrivateWorkspace &&
        (auth.isEngineer || auth.isTechnician || pc.isPrivateWorkspaceFieldStaff);

    if (!show) return const SizedBox.shrink();

    final uid = auth.user?.id;
    final snap = pc.kpiSnapshot;
    final row = _myKpi(snap, uid);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              colors: [
                const Color(0xFF38BDF8).withValues(alpha: 0.2),
                const Color(0xFF6C63FF).withValues(alpha: 0.14),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.insights_rounded,
                      color: Colors.white.withValues(alpha: 0.95), size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      l10n.t('analytics_performance_insights'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                l10n.t('analytics_workspace_performance_hint'),
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.72),
                  fontSize: 11,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
        if (pc.kpiLoading || (!_initialRefreshDone && snap == null))
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6C63FF)),
              ),
            ),
          )
        else if (snap == null)
          Text(
            l10n.t('analytics_kpi_unavailable'),
            style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
          )
        else ...[
          Text(
            l10n.t('analytics_kpi_period', {
              'days': '${snap.days}',
              'n': '${snap.ticketSampleSize}',
            }),
            style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
          ),
          const SizedBox(height: 10),
          if (row == null)
            Text(
              l10n.t('analytics_kpi_empty'),
              style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(14)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      _miniStat(l10n.t('pc_kpi_avg_assignments_per_day'),
                          row.avgTicketAssignmentsPerDay.toStringAsFixed(2)),
                      _miniStat(l10n.t('analytics_kpi_assigned'), '${row.ticketsAssigned}'),
                      _miniStat(l10n.t('analytics_kpi_completed'), '${row.completedTickets}'),
                      _miniStat(l10n.t('analytics_kpi_task_hours'), _fmtHours(row.totalTaskHours)),
                      _miniStat(
                        l10n.t('analytics_kpi_avg_task'),
                        row.avgTaskHours != null ? _fmtHours(row.avgTaskHours!) : '—',
                      ),
                      _miniStat(l10n.t('analytics_kpi_arrival_hours'), _fmtHours(row.totalArrivalHours)),
                      _miniStat(
                        l10n.t('analytics_kpi_resubmission_hours'),
                        _fmtHours(row.totalResubmissionHours),
                      ),
                      _miniStat(
                        l10n.t('analytics_kpi_avg_arrival'),
                        row.avgArrivalHours != null ? _fmtHours(row.avgArrivalHours!) : '—',
                      ),
                      _miniStat(l10n.t('analytics_kpi_crew_joins'), '${row.crewJoins}'),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      l10n.t('pc_kpi_ticket_timeline_hint'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withAlpha(120),
                        fontSize: 10,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (snap.byDepartment.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(
              l10n.t('pc_kpi_your_department'),
              style: TextStyle(
                color: Colors.white.withAlpha(200),
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            ...snap.byDepartment.map((d) {
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
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
                      d.departmentName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 10,
                      runSpacing: 8,
                      children: [
                        _miniStat(l10n.t('analytics_kpi_assigned'), '${d.ticketsAssigned}'),
                        _miniStat(l10n.t('analytics_kpi_completed'), '${d.completedTickets}'),
                        _miniStat(
                          l10n.t('pc_kpi_avg_assignments_per_day'),
                          d.avgTicketAssignmentsPerDay.toStringAsFixed(2),
                        ),
                        _miniStat(
                          l10n.t('analytics_kpi_task_hours'),
                          _fmtHours(d.totalTaskHours),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
        const SizedBox(height: 22),
        Text(
          l10n.t('analytics_material_requests'),
          style: TextStyle(
            color: Colors.white.withAlpha(200),
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('analytics_material_requests_hint'),
          style: TextStyle(
            color: Colors.white.withAlpha(120),
            fontSize: 11,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 10),
        if (wh.requestsLoading && wh.materialRequests.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
              ),
            ),
          )
        else if (wh.materialRequests.isEmpty)
          Text(
            l10n.t('analytics_material_requests_empty'),
            style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
          )
        else
          ...wh.materialRequests.take(25).map((r) {
            final dateStr = r.createdAt != null
                ? DateFormat('yyyy-MM-dd HH:mm').format(r.createdAt!.toLocal())
                : '—';
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
                      r.summaryLine,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${materialRequestStatusLabel(r.status)} · $dateStr',
                      style: TextStyle(
                        color: Colors.white.withAlpha(140),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        const WorkspaceMaterialBudgetAnalyticsPanel(skipInitialLoad: true),
        const WorkspaceExpensesAnalyticsPanel(compact: true),
        const WorkspaceCancellationsAnalyticsPanel(compact: true),
      ],
    );
  }

  Widget _miniStat(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withAlpha(12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withAlpha(130),
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
