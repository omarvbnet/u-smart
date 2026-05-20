import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../providers/private_company_provider.dart';

/// Owner / manager / coordinator: add or remove maintenance completion reasons for a department.
class DepartmentMaintenanceReasonsSheet extends StatefulWidget {
  const DepartmentMaintenanceReasonsSheet({super.key, required this.department});

  final PrivateCompanyDepartment department;

  static Future<void> show(BuildContext context, PrivateCompanyDepartment department) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DepartmentMaintenanceReasonsSheet(department: department),
    );
  }

  @override
  State<DepartmentMaintenanceReasonsSheet> createState() =>
      _DepartmentMaintenanceReasonsSheetState();
}

class _DepartmentMaintenanceReasonsSheetState extends State<DepartmentMaintenanceReasonsSheet> {
  final _addCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PrivateCompanyProvider>().fetchMaintenanceReasons(
            departmentId: widget.department.id,
          );
    });
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

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.t('maint_reasons_manage_title'),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.department.name,
                            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded, color: Colors.white54),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  l10n.t('maint_reasons_manage_hint'),
                  style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12, height: 1.35),
                ),
              ),
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _addCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: l10n.t('maint_reasons_add_hint'),
                          hintStyle: TextStyle(color: Colors.white.withAlpha(90)),
                          filled: true,
                          fillColor: const Color(0xFF12122A),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onSubmitted: (_) => _add(l10n, pc),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: pc.submitting ? null : () => _add(l10n, pc),
                      icon: const Icon(Icons.add_rounded),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: pc.maintenanceReasonsLoading
                    ? const Center(
                        child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
                      )
                    : reasons.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              l10n.t('maint_completion_reason_none'),
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                            itemCount: reasons.length,
                            itemBuilder: (context, i) {
                              final r = reasons[i];
                              return Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF12122A),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.white.withAlpha(20)),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        r.label,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w600,
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
                                      icon: const Icon(
                                        Icons.delete_outline_rounded,
                                        color: Color(0xFFFF4757),
                                        size: 20,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
