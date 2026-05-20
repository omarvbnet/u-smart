import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../models/maintenance_completion_reason.dart';
import '../providers/private_company_provider.dart';
import '../screens/ticket_detail_screen.dart';
import '../utils/share_position_origin.dart';

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
  String? _provinceFilter;
  String? _departmentFilter;
  bool _exporting = false;

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
    await pc.fetchMaintenanceReasonAnalytics(
      from: _rangeStart,
      to: _rangeEnd,
      province: _provinceFilter,
      departmentId: pc.isOwner ? _departmentFilter : null,
    );
  }

  List<String> _provinceOptions(MaintenanceReasonAnalyticsSnapshot? snap) {
    final fromSnap =
        snap?.byProvince.map((p) => p.province).where((p) => p.isNotEmpty) ??
            const Iterable<String>.empty();
    if (fromSnap.isNotEmpty) return fromSnap.toSet().toList()..sort();
    return const [];
  }

  List<PrivateCompanyDepartment> _departmentOptions(PrivateCompanyProvider pc) {
    return pc.workspace?.departments ?? const <PrivateCompanyDepartment>[];
  }

  Future<void> _runExport(
    BuildContext context,
    AppLocalizations l10n,
    PrivateCompanyProvider pc,
  ) async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      final bytes = await pc.downloadMaintenanceReasonsExport(
        from: _rangeStart,
        to: _rangeEnd,
        province: _provinceFilter,
        departmentId: _departmentFilter,
      );
      if (!mounted) return;
      if (bytes == null || bytes.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.t('pc_expenses_export_failed'))),
        );
        return;
      }
      final dir = await getTemporaryDirectory();
      final from = DateFormat('yyyyMMdd').format(_rangeStart);
      final to = DateFormat('yyyyMMdd').format(_rangeEnd);
      final file = File('${dir.path}/maintenance_reasons_${from}_to_$to.xlsx');
      await file.writeAsBytes(bytes, flush: true);
      final origin = sharePositionOriginForShareSheet(context);
      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'Maintenance reasons analytics ($from-$to)',
        subject: l10n.t('export_excel'),
        sharePositionOrigin: origin,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('pc_expenses_export_failed'))),
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
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
    final rows = snap?.byReason ?? const <MaintenanceReasonCount>[];

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
        if (pc.isOwner || pc.isDepartmentManager) ...[
          _filtersCard(context, l10n, pc, snap),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _pickRange,
                icon: const Icon(Icons.date_range_rounded, size: 18),
                label: Text('${fmt.format(_rangeStart)} – ${fmt.format(_rangeEnd)}'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white70,
                  side: BorderSide(color: Colors.white.withAlpha(40)),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: _exporting || pc.maintenanceReasonAnalyticsLoading
                  ? null
                  : () => _runExport(context, l10n, pc),
              icon: _exporting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_rounded, color: Color(0xFF00D4AA)),
              tooltip: l10n.t('export_excel'),
            ),
          ],
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
          else ...[
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
            if (snap.byProvince.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                l10n.t('pc_kpi_by_province'),
                style: TextStyle(
                  color: Colors.white.withAlpha(190),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              ...snap.byProvince.map(
                (p) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF12122A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withAlpha(14)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          p.province,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      Text(
                        '${p.count}',
                        style: const TextStyle(
                          color: Color(0xFF38BDF8),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (snap.cases.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                l10n.t('pc_cancellation_cases'),
                style: TextStyle(
                  color: Colors.white.withAlpha(190),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              ...snap.cases.take(widget.compact ? 5 : 20).map(
                (c) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF12122A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withAlpha(14)),
                  ),
                  child: ListTile(
                    title: Text(
                      c.siteName?.trim().isNotEmpty == true ? c.siteName! : c.ticketId,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      '${c.reasonLabel} · ${c.departmentName ?? c.province ?? ''}',
                      style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TicketDetailScreen(ticketId: c.ticketId),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ],
    );
  }

  Widget _filtersCard(
    BuildContext context,
    AppLocalizations l10n,
    PrivateCompanyProvider pc,
    MaintenanceReasonAnalyticsSnapshot? snap,
  ) {
    final provinces = _provinceOptions(snap);
    final departments = pc.isOwner ? _departmentOptions(pc) : const <PrivateCompanyDepartment>[];
    if (provinces.isEmpty && departments.isEmpty && !pc.isDepartmentManager) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withAlpha(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.t('pc_expenses_filters_title'),
            style: TextStyle(
              color: Colors.white.withAlpha(220),
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (pc.isDepartmentManager && !pc.isOwner) ...[
            const SizedBox(height: 8),
            Text(
              l10n.t('pc_expenses_filter_department_scoped'),
              style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
            ),
          ],
          if (provinces.isNotEmpty) ...[
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              value: _provinceFilter,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                labelText: l10n.t('pc_expenses_filter_province'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                border: InputBorder.none,
                isDense: true,
              ),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(l10n.t('pc_expenses_all_provinces')),
                ),
                ...provinces.map((p) => DropdownMenuItem(value: p, child: Text(p))),
              ],
              onChanged: pc.maintenanceReasonAnalyticsLoading
                  ? null
                  : (v) {
                      setState(() => _provinceFilter = v);
                      _refresh();
                    },
            ),
          ],
          if (departments.isNotEmpty) ...[
            const SizedBox(height: 4),
            DropdownButtonFormField<String?>(
              value: _departmentFilter,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                labelText: l10n.t('pc_expenses_filter_department'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                border: InputBorder.none,
                isDense: true,
              ),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(l10n.t('pc_expenses_all_departments')),
                ),
                ...departments.map(
                  (d) => DropdownMenuItem(value: d.id, child: Text(d.name)),
                ),
              ],
              onChanged: pc.maintenanceReasonAnalyticsLoading
                  ? null
                  : (v) {
                      setState(() => _departmentFilter = v);
                      _refresh();
                    },
            ),
          ],
        ],
      ),
    );
  }
}
