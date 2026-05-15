import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../providers/private_company_provider.dart';
import '../screens/ticket_detail_screen.dart';

class WorkspaceCancellationsAnalyticsPanel extends StatefulWidget {
  const WorkspaceCancellationsAnalyticsPanel({super.key, this.compact = false});

  final bool compact;

  @override
  State<WorkspaceCancellationsAnalyticsPanel> createState() =>
      _WorkspaceCancellationsAnalyticsPanelState();
}

class _WorkspaceCancellationsAnalyticsPanelState
    extends State<WorkspaceCancellationsAnalyticsPanel> {
  int _days = 90;
  bool _bootstrapped = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _refresh();
  }

  Future<void> _refresh() {
    return context.read<PrivateCompanyProvider>().fetchCancellationAnalytics(days: _days);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    if (!pc.canManageStaff) return const SizedBox.shrink();

    final snap = pc.cancellationAnalytics;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Text(
          l10n.t('pc_cancellation_analytics_title'),
          style: TextStyle(
            color: Colors.white.withAlpha(200),
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('pc_cancellation_analytics_hint'),
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11, height: 1.35),
        ),
        const SizedBox(height: 4),
        Text(
          l10n.t('pc_cancellation_admin_reasons_hint'),
          style: TextStyle(color: Colors.white.withAlpha(90), fontSize: 10, height: 1.3),
        ),
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
            IconButton(
              onPressed: pc.cancellationAnalyticsLoading ? null : _refresh,
              icon: pc.cancellationAnalyticsLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh_rounded, color: Colors.white70),
            ),
          ],
        ),
        if (snap == null && pc.cancellationAnalyticsLoading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else if (snap != null) ...[
          const SizedBox(height: 12),
          Text(
            '${l10n.t('pc_cancellation_total')}: ${snap.totalCancelled}',
            style: const TextStyle(
              color: Color(0xFFFF6B81),
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
          if (snap.byReason.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              l10n.t('pc_cancellation_by_reason'),
              style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
            ),
            ...snap.byReason.take(widget.compact ? 5 : 20).map(
                  (r) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(r.reason, style: const TextStyle(color: Colors.white, fontSize: 13)),
                    trailing: Text(
                      '${r.ticketCount}',
                      style: const TextStyle(color: Color(0xFFFF6B81), fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
          ],
          if (!widget.compact && snap.byDepartment.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              l10n.t('pc_cancellation_by_department'),
              style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
            ),
            ...snap.byDepartment.map(
              (d) => Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${d.departmentName}: ${d.totalCancelled}',
                  style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
                ),
              ),
            ),
          ],
          if (!widget.compact && snap.cases.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              l10n.t('pc_cancellation_cases'),
              style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
            ),
            ...snap.cases.take(15).map(
                  (c) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      c.siteName ?? c.ticketId,
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                    subtitle: Text(
                      '${c.reason} · ${c.departmentName ?? c.province ?? ''}',
                      style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 10),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: Colors.white38, size: 18),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TicketDetailScreen(ticketId: c.ticketId),
                      ),
                    ),
                  ),
                ),
          ],
        ],
      ],
    );
  }
}
