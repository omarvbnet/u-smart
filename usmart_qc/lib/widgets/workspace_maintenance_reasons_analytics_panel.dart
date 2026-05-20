import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../providers/private_company_provider.dart';

/// Completion-reason usage counters for owners / managers / coordinators.
class WorkspaceMaintenanceReasonsAnalyticsPanel extends StatefulWidget {
  const WorkspaceMaintenanceReasonsAnalyticsPanel({super.key, this.compact = false});

  final bool compact;

  @override
  State<WorkspaceMaintenanceReasonsAnalyticsPanel> createState() =>
      _WorkspaceMaintenanceReasonsAnalyticsPanelState();
}

class _WorkspaceMaintenanceReasonsAnalyticsPanelState
    extends State<WorkspaceMaintenanceReasonsAnalyticsPanel> {
  late DateTime _rangeStart;
  late DateTime _rangeEnd;

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    final today = DateTime(n.year, n.month, n.day);
    _rangeEnd = today;
    _rangeStart = today.subtract(const Duration(days: 89));
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    final pc = context.read<PrivateCompanyProvider>();
    await pc.fetchMaintenanceReasonAnalytics(from: _rangeStart, to: _rangeEnd);
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1, 12, 31),
      initialDateRange: DateTimeRange(start: _rangeStart, end: _rangeEnd),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _rangeStart = DateTime(picked.start.year, picked.start.month, picked.start.day);
      _rangeEnd = DateTime(picked.end.year, picked.end.month, picked.end.day);
    });
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    if (!pc.canViewMaintenanceReasonAnalytics) return const SizedBox.shrink();

    final snap = pc.maintenanceReasonAnalytics;
    final fmt = DateFormat.yMMMd();
    final rows = snap?.byReason ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.compact) const SizedBox(height: 18),
        Text(
          l10n.t('maint_reasons_analytics_title'),
          style: TextStyle(
            color: Colors.white.withAlpha(220),
            fontSize: widget.compact ? 13 : 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('maint_reasons_analytics_hint'),
          style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11, height: 1.35),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _pickRange,
          icon: const Icon(Icons.date_range_rounded, size: 18),
          label: Text('${fmt.format(_rangeStart)} – ${fmt.format(_rangeEnd)}'),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white70,
            side: BorderSide(color: Colors.white.withAlpha(40)),
          ),
        ),
        const SizedBox(height: 12),
        if (pc.maintenanceReasonAnalyticsLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
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
            l10n.t('maint_reasons_total', {'count': '${snap.totalWithReason}'}),
            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
          ),
          const SizedBox(height: 10),
          if (rows.isEmpty)
            Text(
              l10n.t('analytics_kpi_empty'),
              style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
            )
          else
            ...rows.map((r) {
              final max = rows.first.count > 0 ? rows.first.count : 1;
              final frac = r.count / max;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withAlpha(14)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            r.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        Text(
                          '${r.count}',
                          style: const TextStyle(
                            color: Color(0xFF00D4AA),
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: frac.clamp(0.05, 1.0),
                        minHeight: 6,
                        backgroundColor: Colors.white.withAlpha(20),
                        color: const Color(0xFF6C63FF),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ],
    );
  }
}
