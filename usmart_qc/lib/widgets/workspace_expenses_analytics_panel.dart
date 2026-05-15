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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final snap = pc.expenseAnalytics;
    final enabled = pc.workspace?.ticketExpensesEnabled == true;

    if (!pc.hasWorkspace || !pc.isApproved) return const SizedBox.shrink();
    if (!enabled && !pc.canManageStaff) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Text(
          l10n.t('pc_expenses_analytics_title'),
          style: TextStyle(
            color: Colors.white.withAlpha(200),
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('pc_expenses_analytics_hint'),
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11, height: 1.35),
        ),
        if (!enabled) ...[
          const SizedBox(height: 8),
          Text(
            l10n.t('pc_expenses_not_enabled'),
            style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
          ),
        ] else ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  value: _days,
                  dropdownColor: const Color(0xFF12122A),
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  decoration: InputDecoration(
                    labelText: l10n.t('pc_expenses_days'),
                    labelStyle: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  items: const [30, 90, 180, 365]
                      .map((d) => DropdownMenuItem(value: d, child: Text('$d days')))
                      .toList(),
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => _days = v);
                    _refresh();
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: pc.expenseAnalyticsLoading ? null : _refresh,
                icon: pc.expenseAnalyticsLoading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded, color: Colors.white70),
              ),
            ],
          ),
          if (pc.isOwner || pc.isDepartmentManager) ...[
            const SizedBox(height: 8),
            if (pc.isOwner && snap != null && snap.byProvince.isNotEmpty)
              DropdownButtonFormField<String?>(
                value: _provinceFilter,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white, fontSize: 12),
                decoration: InputDecoration(
                  labelText: l10n.t('pc_expenses_filter_province'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
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
            if (pc.isOwner && snap != null && snap.byDepartment.isNotEmpty) ...[
              const SizedBox(height: 8),
              DropdownButtonFormField<String?>(
                value: _departmentFilter,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white, fontSize: 12),
                decoration: InputDecoration(
                  labelText: l10n.t('pc_expenses_filter_department'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
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
            ],
          ],
          const SizedBox(height: 10),
          if (pc.expenseAnalyticsLoading && snap == null)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(12),
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
            _summaryRow(
              l10n.t('pc_expenses_total'),
              '${snap.summaryTotalAmount.toStringAsFixed(2)} IQD',
            ),
            _summaryRow(l10n.t('pc_expenses_lines'), '${snap.summaryExpenseCount}'),
            _summaryRow(l10n.t('pc_expenses_tickets'), '${snap.summaryTicketCount}'),
            if (!widget.compact && snap.byStaff.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                l10n.t('pc_expenses_by_staff'),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 6),
              ...snap.byStaff.take(12).map((s) => _staffRow(context, s)),
            ],
            if (snap.tickets.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                l10n.t('pc_expenses_related_tickets'),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 6),
              ...snap.tickets.take(15).map((t) => _ticketRow(context, t)),
            ],
          ],
        ],
      ],
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12)),
          ),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _staffRow(BuildContext context, ExpenseStaffRollup s) {
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(s.name, style: const TextStyle(color: Colors.white, fontSize: 13)),
      subtitle: Text(
        '${s.expenseCount} lines · ${s.ticketCount} tickets',
        style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
      ),
      trailing: Text(
        '${s.totalAmount.toStringAsFixed(2)}',
        style: const TextStyle(color: Color(0xFF00D4AA), fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _ticketRow(BuildContext context, ExpenseTicketRollup t) {
    final label = t.siteName?.trim().isNotEmpty == true
        ? t.siteName!
        : (t.technique ?? t.ticketId);
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 13)),
      subtitle: Text(
        '${t.status} · ${t.expenseCount} lines',
        style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
      ),
      trailing: Text(
        t.totalAmount.toStringAsFixed(2),
        style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.w700),
      ),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => TicketDetailScreen(ticketId: t.ticketId),
          ),
        );
      },
    );
  }
}
