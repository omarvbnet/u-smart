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
    if (!pc.canManageStaff) return const SizedBox.shrink();

    final snap = pc.cancellationAnalytics;

    final hero = Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            const Color(0xFFFF6B81).withValues(alpha: 0.22),
            const Color(0xFF6C63FF).withValues(alpha: 0.1),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.cancel_schedule_send_rounded, color: Color(0xFFFF6B81), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('pc_cancellation_analytics_title'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.t('pc_cancellation_analytics_hint'),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 11,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      l10n.t('pc_cancellation_admin_reasons_hint'),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5),
                        fontSize: 10,
                        height: 1.3,
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
      padding: const EdgeInsets.only(bottom: 12),
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
              onPressed: pc.cancellationAnalyticsLoading ? null : _refresh,
              icon: pc.cancellationAnalyticsLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
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
        periodRow,
        if (snap == null && pc.cancellationAnalyticsLoading)
          const Padding(
            padding: EdgeInsets.all(20),
            child: Center(
              child: SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFFF6B81)),
              ),
            ),
          )
        else if (snap != null) ...[
          _glass(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Row(
                children: [
                  Icon(Icons.highlight_off_rounded,
                      size: 20, color: const Color(0xFFFF6B81).withValues(alpha: 0.9)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.t('pc_cancellation_total'),
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 10, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${snap.totalCancelled}',
                          style: const TextStyle(color: Color(0xFFFF6B81), fontWeight: FontWeight.w900, fontSize: 22),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (snap.byReason.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              l10n.t('pc_cancellation_by_reason'),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 8),
            ...snap.byReason.take(widget.compact ? 5 : 20).map(
                  (r) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _glass(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                        title: Text(r.reason, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFF6B81).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '${r.ticketCount}',
                            style: const TextStyle(color: Color(0xFFFF6B81), fontWeight: FontWeight.w800, fontSize: 13),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
          ],
          if (!widget.compact && snap.byDepartment.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              l10n.t('pc_cancellation_by_department'),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 8),
            ...snap.byDepartment.map(
              (d) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _glass(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                    title: Text(
                      d.departmentName,
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    trailing: Text(
                      '${d.totalCancelled}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (!widget.compact && snap.cases.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              l10n.t('pc_cancellation_cases'),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 8),
            ...snap.cases.take(15).map(
                  (c) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _glass(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                        title: Text(
                          c.siteName ?? c.ticketId,
                          style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          '${c.reason} · ${c.departmentName ?? c.province ?? ''}',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11),
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38, size: 22),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => TicketDetailScreen(ticketId: c.ticketId),
                          ),
                        ),
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
