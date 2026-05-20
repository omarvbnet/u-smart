import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../providers/private_company_provider.dart';
import 'workspace_maintenance_reasons_tabs.dart';

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
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

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
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: MaintenanceReasonsDepartmentEditor(
                    department: widget.department,
                    dense: true,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
