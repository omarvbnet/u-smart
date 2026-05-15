import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company_expense.dart';
import '../providers/private_company_provider.dart';
import '../screens/ticket_detail_screen.dart';

/// Expense rollups for owners/managers (province, department, staff) or field staff self-view.
class WorkspaceExpensesAnalyticsPanel extends StatefulWidget {
  const WorkspaceExpensesAnalyticsPanel({super.key, this.compact = false});

  final bool compact;

  @override
  State<WorkspaceExpensesAnalyticsPanel> createState() =>
      _WorkspaceExpensesAnalyticsPanelState();
}

class _WorkspaceExpensesAnalyticsPanelState extends State<WorkspaceExpensesAnalyticsPanel> {
  int _days = 90;
  String? _provinceFilter;
  String? _departmentFilter;
  bool _bootstrapped = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _refresh();
  }

  Future<void> _refresh() {
    final pc = context.read<PrivateCompanyProvider>();
    return pc.fetchExpenseAnalytics(
      days: _days,
      province: _provinceFilter,
      departmentId: _departmentFilter,
    );
  }

  static Widget _glass({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF12122A).withValues(alpha: 0.55),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final snap = pc.expenseAnalytics;
    final enabled = pc.workspace?.ticketExpensesEnabled == true;

    if (!pc.hasWorkspace || !pc.isApproved) return const SizedBox.shrink();
    if (!enabled && !pc.canManageStaff) return const SizedBox.shrink();

    final hero = Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            const Color(0xFF00D4AA).withValues(alpha: 0.2),
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
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.payments_rounded, color: Color(0xFF00D4AA), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('pc_expenses_analytics_title'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.t('pc_expenses_analytics_hint'),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 11,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );

    final periodRow = Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: _glass(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: Row(
                  children: [
                    Icon(Icons.date_range_rounded, size: 18, color: Colors.white.withValues(alpha: 0.7)),
                    const SizedBox(width: 8),
                    Text(
                      l10n.t('pc_expenses_days'),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.65), fontSize: 11),
                    ),
                    const Spacer(),
                    DropdownButtonHideUnderline(
                      child: DropdownButton<int>(
                        value: _days,
                        dropdownColor: const Color(0xFF12122A),
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                        items: [30, 90, 180, 365]
                            .map(
                              (d) => DropdownMenuItem(
                                value: d,
                                child: Text(l10n.t('pc_kpi_days_short', {'n': '$d'})),
                              ),
                            )
                            .toList(),
                        onChanged: (v) {
                          if (v == null) return;
                          setState(() => _days = v);
                          _refresh();
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            child: IconButton(
              onPressed: pc.expenseAnalyticsLoading ? null : _refresh,
              icon: pc.expenseAnalyticsLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6C63FF)),
                    )
                  : Icon(Icons.refresh_rounded, color: Colors.white.withValues(alpha: 0.85)),
            ),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        hero,
        if (!enabled) ...[
          _glass(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                l10n.t('pc_expenses_not_enabled'),
                style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 12, height: 1.4),
              ),
            ),
          ),
        ] else ...[
          periodRow,
          if (pc.isOwner || pc.isDepartmentManager) ...[
            if (pc.isOwner && snap != null && snap.byProvince.isNotEmpty) ...[
              _glass(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: DropdownButtonFormField<String?>(
                    value: _provinceFilter,
                    dropdownColor: const Color(0xFF12122A),
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: l10n.t('pc_expenses_filter_province'),
                      labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    items: [
                      DropdownMenuItem<String?>(
                        value: null,
                        child: Text(l10n.t('pc_expenses_all_provinces')),
                      ),
                      ...snap.byProvince.map(
                        (p) => DropdownMenuItem(value: p.province, child: Text(p.province)),
                      ),
                    ],
                    onChanged: (v) {
                      setState(() => _provinceFilter = v);
                      _refresh();
                    },
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (pc.isOwner && snap != null && snap.byDepartment.isNotEmpty) ...[
              _glass(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: DropdownButtonFormField<String?>(
                    value: _departmentFilter,
                    dropdownColor: const Color(0xFF12122A),
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: l10n.t('pc_expenses_filter_department'),
                      labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    items: [
                      DropdownMenuItem<String?>(
                        value: null,
                        child: Text(l10n.t('pc_expenses_all_departments')),
                      ),
                      ...snap.byDepartment.map(
                        (d) => DropdownMenuItem(
                          value: d.departmentId,
                          child: Text(d.departmentName),
                        ),
                      ),
                    ],
                    onChanged: (v) {
                      setState(() => _departmentFilter = v);
                      _refresh();
                    },
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
          ],
          if (pc.expenseAnalyticsLoading && snap == null)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6C63FF)),
                ),
              ),
            )
          else if (snap == null)
            _glass(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  l10n.t('analytics_kpi_unavailable'),
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.65), fontSize: 12),
                ),
              ),
            )
          else ...[
            LayoutBuilder(
              builder: (context, c) {
                final narrow = c.maxWidth < 340;
                final children = <Widget>[
                  _metricTile(
                    context,
                    l10n.t('pc_expenses_total'),
                    '${snap.summaryTotalAmount.toStringAsFixed(2)} IQD',
                    const Color(0xFF00D4AA),
                    Icons.account_balance_wallet_outlined,
                  ),
                  _metricTile(
                    context,
                    l10n.t('pc_expenses_lines'),
                    '${snap.summaryExpenseCount}',
                    const Color(0xFF38BDF8),
                    Icons.receipt_long_rounded,
                  ),
                  _metricTile(
                    context,
                    l10n.t('pc_expenses_tickets'),
                    '${snap.summaryTicketCount}',
                    const Color(0xFFC9A227),
                    Icons.confirmation_number_outlined,
                  ),
                ];
                if (narrow) {
                  return Column(
                    children: [
                      for (var i = 0; i < children.length; i++) ...[
                        if (i > 0) const SizedBox(height: 8),
                        children[i],
                      ],
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: children[0]),
                    const SizedBox(width: 8),
                    Expanded(child: children[1]),
                    const SizedBox(width: 8),
                    Expanded(child: children[2]),
                  ],
                );
              },
            ),
            if (!widget.compact && snap.byStaff.isNotEmpty) ...[
              const SizedBox(height: 18),
              _sectionLabel(l10n.t('pc_expenses_by_staff')),
              const SizedBox(height: 8),
              ...snap.byStaff.take(12).map((s) => _staffCard(context, l10n, s)),
            ],
            if (snap.tickets.isNotEmpty) ...[
              const SizedBox(height: 18),
              _sectionLabel(l10n.t('pc_expenses_related_tickets')),
              const SizedBox(height: 8),
              ...snap.tickets.take(15).map((t) => _ticketCard(context, l10n, t)),
            ],
          ],
        ],
      ],
    );
  }

  Widget _metricTile(
    BuildContext context,
    String label,
    String value,
    Color accent,
    IconData icon,
  ) {
    return _glass(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: accent.withValues(alpha: 0.95)),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 10, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: accent, fontSize: 13, fontWeight: FontWeight.w800, height: 1.2),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: TextStyle(
        color: Colors.white.withValues(alpha: 0.9),
        fontWeight: FontWeight.w800,
        fontSize: 12,
        letterSpacing: 0.4,
      ),
    );
  }

  Widget _staffCard(BuildContext context, AppLocalizations l10n, ExpenseStaffRollup s) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: _glass(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          title: Text(s.name, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
          subtitle: Text(
            l10n.t('pc_expenses_staff_rollup_subtitle', {
              'lines': '${s.expenseCount}',
              'tickets': '${s.ticketCount}',
            }),
            style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11),
          ),
          trailing: Text(
            s.totalAmount.toStringAsFixed(2),
            style: const TextStyle(color: Color(0xFF00D4AA), fontWeight: FontWeight.w800, fontSize: 14),
          ),
        ),
      ),
    );
  }

  Widget _ticketCard(BuildContext context, AppLocalizations l10n, ExpenseTicketRollup t) {
    final label = t.siteName?.trim().isNotEmpty == true ? t.siteName! : (t.technique ?? t.ticketId);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: _glass(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
          subtitle: Text(
            l10n.t('pc_expenses_ticket_rollup_subtitle', {
              'status': t.status,
              'lines': '${t.expenseCount}',
            }),
            style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                t.totalAmount.toStringAsFixed(2),
                style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.w800, fontSize: 14),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right_rounded, color: Colors.white38, size: 22),
            ],
          ),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => TicketDetailScreen(ticketId: t.ticketId),
              ),
            );
          },
        ),
      ),
    );
  }
}
