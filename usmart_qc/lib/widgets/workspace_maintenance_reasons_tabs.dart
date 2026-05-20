import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../providers/private_company_provider.dart';
import 'workspace_maintenance_reasons_analytics_panel.dart';

/// Inline editor for one department's completion reasons (shared by sheet + manage tab).
class MaintenanceReasonsDepartmentEditor extends StatefulWidget {
  const MaintenanceReasonsDepartmentEditor({
    super.key,
    required this.department,
    this.dense = false,
  });

  final PrivateCompanyDepartment department;
  final bool dense;

  @override
  State<MaintenanceReasonsDepartmentEditor> createState() =>
      _MaintenanceReasonsDepartmentEditorState();
}

class _MaintenanceReasonsDepartmentEditorState extends State<MaintenanceReasonsDepartmentEditor> {
  final _addCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  void didUpdateWidget(covariant MaintenanceReasonsDepartmentEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.department.id != widget.department.id) {
      _refresh();
    }
  }

  void _refresh() {
    context.read<PrivateCompanyProvider>().fetchMaintenanceReasons(
          departmentId: widget.department.id,
        );
  }

  @override
  void dispose() {
    _addCtrl.dispose();
    super.dispose();
  }

  Future<void> _add(AppLocalizations l10n, PrivateCompanyProvider pc) async {
    final label = _addCtrl.text.trim();
    if (label.isEmpty) return;
    final ok = await pc.addMaintenanceReason(
      departmentId: widget.department.id,
      label: label,
    );
    if (ok && mounted) _addCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final reasons = pc.maintenanceReasons
        .where((r) => r.departmentId == widget.department.id && r.active)
        .toList();
    final deptColor = widget.department.colorValue;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.dense) ...[
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: deptColor, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.department.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
              Text(
                '${reasons.length}',
                style: TextStyle(
                  color: Colors.white.withAlpha(140),
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _addCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: l10n.t('maint_reasons_add_hint'),
                  hintStyle: TextStyle(color: Colors.white.withAlpha(90), fontSize: 13),
                  filled: true,
                  fillColor: const Color(0xFF0A0A18),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.white.withAlpha(25)),
                  ),
                ),
                onSubmitted: (_) => _add(l10n, pc),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: pc.submitting ? null : () => _add(l10n, pc),
              style: IconButton.styleFrom(backgroundColor: const Color(0xFF6C63FF)),
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (pc.maintenanceReasonsLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6C63FF)),
              ),
            ),
          )
        else if (reasons.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              l10n.t('maint_completion_reason_none'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
            ),
          )
        else
          ...reasons.map((r) {
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: deptColor.withAlpha(60)),
              ),
              child: Row(
                children: [
                  Icon(Icons.label_outline_rounded, color: deptColor.withAlpha(200), size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      r.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: pc.submitting
                        ? null
                        : () => pc.removeMaintenanceReason(
                              r.id,
                              departmentId: widget.department.id,
                            ),
                    icon: const Icon(Icons.delete_outline_rounded, color: Color(0xFFFF4757), size: 20),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}

/// Workspace tab: configure completion reasons per department.
class MaintenanceReasonsManageTab extends StatefulWidget {
  const MaintenanceReasonsManageTab({super.key, required this.workspace});

  final PrivateCompanyWorkspace workspace;

  @override
  State<MaintenanceReasonsManageTab> createState() => _MaintenanceReasonsManageTabState();
}

class _MaintenanceReasonsManageTabState extends State<MaintenanceReasonsManageTab> {
  String? _selectedDeptId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  void _bootstrap() {
    final pc = context.read<PrivateCompanyProvider>();
    final depts = _editableDepartments(pc);
    if (depts.isEmpty) return;
    setState(() {
      _selectedDeptId ??= depts.first.id;
    });
    pc.fetchMaintenanceReasons(
      departmentId: pc.isOwner ? null : _selectedDeptId,
      includeInactive: false,
    );
  }

  List<PrivateCompanyDepartment> _editableDepartments(PrivateCompanyProvider pc) {
    if (pc.isOwner) return widget.workspace.departments;
    final myId = pc.myDepartmentId;
    if (myId == null) return [];
    return widget.workspace.departments.where((d) => d.id == myId).toList();
  }

  PrivateCompanyDepartment? _selectedDept(PrivateCompanyProvider pc) {
    final id = _selectedDeptId;
    if (id == null) return null;
    for (final d in widget.workspace.departments) {
      if (d.id == id) return d;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final depts = _editableDepartments(pc);
    final selected = _selectedDept(pc);

    if (!pc.canManageMaintenanceReasons) {
      return const SizedBox.shrink();
    }

    return RefreshIndicator(
      onRefresh: () async {
        await pc.fetchMaintenanceReasons(
          departmentId: pc.isOwner ? null : _selectedDeptId,
        );
      },
      color: const Color(0xFF6C63FF),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          Text(
            l10n.t('maint_reasons_manage_title'),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.t('pc_maint_reasons_tab_manage_intro'),
            style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (depts.isEmpty)
            _emptyCard(l10n.t('pc_maint_reasons_no_department'))
          else ...[
            if (pc.isOwner && depts.length > 1) ...[
              Text(
                l10n.t('pc_maint_reasons_pick_department'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: depts.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final d = depts[i];
                    final sel = d.id == _selectedDeptId;
                    return FilterChip(
                      selected: sel,
                      label: Text(d.name),
                      labelStyle: TextStyle(
                        color: sel ? Colors.white : Colors.white70,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                      selectedColor: d.colorValue.withAlpha(90),
                      backgroundColor: const Color(0xFF12122A),
                      side: BorderSide(
                        color: sel ? d.colorValue : Colors.white.withAlpha(30),
                      ),
                      onSelected: (_) {
                        setState(() => _selectedDeptId = d.id);
                        pc.fetchMaintenanceReasons(departmentId: d.id);
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
            ],
            if (selected != null)
              _glassCard(
                child: MaintenanceReasonsDepartmentEditor(department: selected),
              )
            else
              _emptyCard(l10n.t('pc_maint_reasons_pick_department')),
            if (pc.isOwner) ...[
              const SizedBox(height: 20),
              Text(
                l10n.t('pc_maint_reasons_all_departments'),
                style: TextStyle(
                  color: Colors.white.withAlpha(200),
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              ..._groupedByDepartment(pc, depts, l10n),
            ],
          ],
        ],
      ),
    );
  }

  List<Widget> _groupedByDepartment(
    PrivateCompanyProvider pc,
    List<PrivateCompanyDepartment> depts,
    AppLocalizations l10n,
  ) {
    final out = <Widget>[];
    for (final d in depts) {
      final items = pc.maintenanceReasons.where((r) => r.departmentId == d.id && r.active);
      if (items.isEmpty) continue;
      out.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _glassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.name,
                  style: TextStyle(
                    color: d.colorValue,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: items
                      .map(
                        (r) => Chip(
                          label: Text(r.label, style: const TextStyle(fontSize: 11)),
                          backgroundColor: const Color(0xFF0A0A18),
                          side: BorderSide(color: Colors.white.withAlpha(25)),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),
      );
    }
    if (out.isEmpty && !pc.maintenanceReasonsLoading) {
      out.add(_emptyCard(l10n.t('maint_completion_reason_none')));
    }
    return out;
  }

  Widget _glassCard({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A).withAlpha(220),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(18)),
      ),
      child: child,
    );
  }

  Widget _emptyCard(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A).withAlpha(180),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withAlpha(12)),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 13),
      ),
    );
  }
}

/// Workspace tab: completion-reason usage analytics.
class MaintenanceReasonsAnalyticsTab extends StatelessWidget {
  const MaintenanceReasonsAnalyticsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    if (!pc.canViewMaintenanceReasonAnalytics) {
      return const SizedBox.shrink();
    }

    return RefreshIndicator(
      onRefresh: () async {
        final n = DateTime.now();
        final end = DateTime(n.year, n.month, n.day);
        final start = end.subtract(const Duration(days: 89));
        await pc.fetchMaintenanceReasonAnalytics(from: start, to: end);
      },
      color: const Color(0xFF6C63FF),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          Text(
            l10n.t('maint_reasons_analytics_title'),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.t('pc_maint_reasons_tab_analytics_intro'),
            style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 16),
          const WorkspaceMaintenanceReasonsAnalyticsPanel(),
        ],
      ),
    );
  }
}
