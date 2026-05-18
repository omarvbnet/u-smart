import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../providers/private_company_provider.dart';
import '../utils/workspace_checklist_pdf.dart';

class WorkspaceChecklistDetailScreen extends StatelessWidget {
  const WorkspaceChecklistDetailScreen({
    super.key,
    required this.checklist,
    required this.workspace,
    this.onEdit,
    this.onDelete,
  });

  final PrivateCompanyChecklist checklist;
  final PrivateCompanyWorkspace workspace;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  String? _departmentName() {
    if (checklist.departmentId == null) return null;
    for (final d in workspace.departments) {
      if (d.id == checklist.departmentId) return d.name;
    }
    return null;
  }

  Future<void> _printPdf(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    try {
      await previewWorkspaceChecklistPdf(
        context: context,
        checklist: checklist,
        workspaceName: workspace.name,
        departmentName: _departmentName(),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_checklist_pdf_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  Future<void> _sharePdf(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    try {
      final bytes = await buildWorkspaceChecklistPdf(
        checklist: checklist,
        workspaceName: workspace.name,
        departmentName: _departmentName(),
      );
      if (!context.mounted) return;
      await shareWorkspaceChecklistPdf(
        bytes: bytes,
        fileName: checklist.name,
        context: context,
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_checklist_pdf_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final canManage = pc.canManageChecklists;
    final color = _categoryColor(checklist.category);
    final deptName = _departmentName();

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          checklist.name,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 18,
          ),
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            tooltip: l10n.t('pc_checklist_print_pdf'),
            icon: const Icon(Icons.picture_as_pdf_outlined, color: Colors.white),
            onPressed: () => _printPdf(context),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
            color: const Color(0xFF12122A),
            onSelected: (v) {
              if (v == 'share') _sharePdf(context);
              if (v == 'edit' && canManage && onEdit != null) onEdit!();
              if (v == 'delete' && onDelete != null) onDelete!();
            },
            itemBuilder: (ctx) => [
              PopupMenuItem(
                value: 'share',
                child: Text(
                  l10n.t('pc_checklist_share_pdf'),
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              if (canManage && onEdit != null)
                PopupMenuItem(
                  value: 'edit',
                  child: Text(
                    l10n.t('pc_checklist_edit'),
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              if (onDelete != null)
                PopupMenuItem(
                  value: 'delete',
                  child: const Text(
                    'Delete',
                    style: TextStyle(color: Color(0xFFFF4757)),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Center(
            child: Column(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.asset(
                    'assets/provisor_icon.png',
                    width: 72,
                    height: 72,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Provisor',
                  style: TextStyle(
                    color: Colors.white.withAlpha(200),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  workspace.name,
                  style: TextStyle(
                    color: Colors.white.withAlpha(140),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (checklist.description != null && checklist.description!.trim().isNotEmpty)
            _section(
              child: Text(
                checklist.description!.trim(),
                style: TextStyle(
                  color: Colors.white.withAlpha(220),
                  fontSize: 14,
                  height: 1.45,
                ),
              ),
            ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (checklist.category != null)
                _chip(checklist.category!, color),
              _chip(
                '${checklist.items.length} ${l10n.t('pc_checklist_items')}',
                const Color(0xFF6C63FF),
              ),
              if (deptName != null) _chip(deptName, const Color(0xFF00D4AA)),
            ],
          ),
          if (checklist.createdByName != null) ...[
            const SizedBox(height: 12),
            Text(
              '${l10n.t('pc_checklist_created_by')}: ${checklist.createdByName}',
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            l10n.t('pc_checklist_items').toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(100),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          ...checklist.items.asMap().entries.map((entry) {
            final it = entry.value;
            final severityColor =
                it.isMajor ? const Color(0xFFFF4757) : const Color(0xFF8B83FF);
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(15)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: color.withAlpha(30),
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${entry.key + 1}',
                      style: TextStyle(
                        color: color,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      it.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: severityColor.withAlpha(28),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: severityColor.withAlpha(70)),
                    ),
                    child: Text(
                      it.isMajor ? 'MAJOR' : 'MINOR',
                      style: TextStyle(
                        color: severityColor,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
          if (canManage && onEdit != null) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_rounded),
                label: Text(l10n.t('pc_checklist_edit')),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _section({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(12)),
      ),
      child: child,
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

Color _categoryColor(String? category) {
  switch ((category ?? '').toUpperCase()) {
    case 'MAINTENANCE':
      return const Color(0xFFFBBF24);
    case 'SUPERVISION':
      return const Color(0xFF00D4AA);
    case 'QUALITY':
    default:
      return const Color(0xFF6C63FF);
  }
}
