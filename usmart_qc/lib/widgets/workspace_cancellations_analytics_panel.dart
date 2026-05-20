import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../models/private_company_cancellation.dart';
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
  late DateTime _rangeStart;
  late DateTime _rangeEnd;
  bool _bootstrapped = false;
  String? _provinceFilter;
  String? _departmentFilter;
  final _reasonAddCtrl = TextEditingController();
  List<String> _reasons = [];
  bool _reasonsLoaded = false;
  bool _reasonsSaving = false;

  @override
  void dispose() {
    _reasonAddCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadReasons() async {
    final pc = context.read<PrivateCompanyProvider>();
    final fromWorkspace = pc.workspace?.ticketCancellationReasons ?? const [];
    if (fromWorkspace.isNotEmpty) {
      if (mounted) {
        setState(() {
          _reasons = List<String>.from(fromWorkspace);
          _reasonsLoaded = true;
        });
      }
      return;
    }
    final snap = await pc.fetchCancellationSettings();
    if (!mounted) return;
    final settings = snap?['settings'];
    final list = settings is Map
        ? (settings['reasons'] as List<dynamic>?)
                ?.map((e) => e.toString().trim())
                .where((s) => s.isNotEmpty)
                .toList() ??
            <String>[]
        : <String>[];
    setState(() {
      _reasons = list;
      _reasonsLoaded = true;
    });
  }

  Future<void> _saveReasons() async {
    setState(() => _reasonsSaving = true);
    final pc = context.read<PrivateCompanyProvider>();
    final ok = await pc.patchCancellationSettings(reasons: _reasons);
    if (mounted) {
      setState(() => _reasonsSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? AppLocalizations.of(context).t('pc_ws_cancellation_reasons_saved')
                : (pc.error ?? AppLocalizations.of(context).t('action_failed')),
          ),
          backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        ),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    final today = DateTime(n.year, n.month, n.day);
    _rangeEnd = today;
    _rangeStart = today.subtract(const Duration(days: 89));
  }

  Future<void> _pickDateRange(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1, 12, 31),
      initialDateRange: DateTimeRange(start: _rangeStart, end: _rangeEnd),
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(ctx).copyWith(
            colorScheme: ThemeData.dark().colorScheme.copyWith(
                  primary: const Color(0xFFFF6B81),
                  onPrimary: Colors.white,
                  surface: const Color(0xFF12122A),
                  onSurface: Colors.white,
                ),
          ),
          child: child!,
        );
      },
    );
    if (picked == null || !mounted) return;
    setState(() {
      _rangeStart = DateTime(picked.start.year, picked.start.month, picked.start.day);
      _rangeEnd = DateTime(picked.end.year, picked.end.month, picked.end.day);
    });
    await _refresh();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _refresh();
    _loadReasons();
  }

  Future<void> _refresh() {
    final pc = context.read<PrivateCompanyProvider>();
    return pc.fetchCancellationAnalytics(
      from: _rangeStart,
      to: _rangeEnd,
      province: _provinceFilter,
      departmentId: pc.isOwner ? _departmentFilter : null,
    );
  }

  List<String> _provinceOptions(CancellationAnalyticsSnapshot? snap) {
    final fromSnap = snap?.byProvince.map((p) => p.province).where((p) => p.isNotEmpty) ?? const Iterable<String>.empty();
    if (fromSnap.isNotEmpty) return fromSnap.toSet().toList()..sort();
    return const [];
  }

  List<PrivateCompanyDepartment> _departmentOptions(PrivateCompanyProvider pc) {
    return pc.workspace?.departments ?? const <PrivateCompanyDepartment>[];
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
                      l10n.t('pc_cancellation_workspace_reasons_hint'),
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
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => _pickDateRange(context),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        Icon(Icons.date_range_rounded, size: 18, color: Colors.white.withValues(alpha: 0.7)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.t('pc_analytics_date_range_label'),
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 10),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${DateFormat.yMMMd().format(_rangeStart)} – ${DateFormat.yMMMd().format(_rangeEnd)}',
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.edit_calendar_rounded, size: 20, color: Colors.white.withValues(alpha: 0.45)),
                      ],
                    ),
                  ),
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
        if (pc.canManageCancellationReasons && _reasonsLoaded) ...[
          _glass(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    l10n.t('pc_cancellation_settings'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _reasonAddCtrl,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: l10n.t('pc_cancellation_reason_add_hint'),
                      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.45)),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.add_circle_outline_rounded, color: Color(0xFFFF6B81)),
                        onPressed: () {
                          final s = _reasonAddCtrl.text.trim();
                          if (s.isEmpty || _reasons.contains(s)) return;
                          setState(() {
                            _reasons = [..._reasons, s];
                            _reasonAddCtrl.clear();
                          });
                        },
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  if (_reasons.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _reasons
                          .map(
                            (r) => InputChip(
                              label: Text(r, style: const TextStyle(color: Colors.white, fontSize: 12)),
                              deleteIconColor: Colors.white70,
                              backgroundColor: const Color(0xFFFF6B81).withValues(alpha: 0.15),
                              side: BorderSide(color: const Color(0xFFFF6B81).withValues(alpha: 0.35)),
                              onDeleted: () => setState(() => _reasons = _reasons.where((x) => x != r).toList()),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      onPressed: _reasonsSaving ? null : _saveReasons,
                      style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6B81)),
                      child: Text(_reasonsSaving ? '…' : l10n.t('submit')),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (pc.isOwner || pc.isDepartmentManager)
          _cancellationFilterSection(context, l10n, pc, snap),
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
          if (snap.cases.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              l10n.t('pc_cancellation_cases'),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 8),
            ...snap.cases.take(widget.compact ? 5 : 15).map(
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

  Widget _cancellationFilterSection(
    BuildContext context,
    AppLocalizations l10n,
    PrivateCompanyProvider pc,
    CancellationAnalyticsSnapshot? snap,
  ) {
    final provinces = _provinceOptions(snap);
    final departments = pc.isOwner ? _departmentOptions(pc) : const <PrivateCompanyDepartment>[];
    if (provinces.isEmpty && departments.isEmpty && !pc.isDepartmentManager) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: _glass(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('pc_expenses_filters_title'),
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (pc.isDepartmentManager && !pc.isOwner) ...[
                const SizedBox(height: 8),
                Text(
                  l10n.t('pc_expenses_filter_department_scoped'),
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11, height: 1.35),
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
                    labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
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
                  onChanged: pc.cancellationAnalyticsLoading
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
                    labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
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
                  onChanged: pc.cancellationAnalyticsLoading
                      ? null
                      : (v) {
                          setState(() => _departmentFilter = v);
                          _refresh();
                        },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
