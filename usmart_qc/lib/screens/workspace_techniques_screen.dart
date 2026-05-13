import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/private_company_provider.dart';
import '../providers/provisor_techniques_provider.dart';

/// Owner-only: manage workspace-scoped ticket techniques (QC / maintenance slugs).
class WorkspaceTechniquesScreen extends StatefulWidget {
  const WorkspaceTechniquesScreen({super.key});

  @override
  State<WorkspaceTechniquesScreen> createState() => _WorkspaceTechniquesScreenState();
}

class _WorkspaceTechniquesScreenState extends State<WorkspaceTechniquesScreen> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final pc = context.read<PrivateCompanyProvider>();
    if (!pc.canManageWorkspaceTechniques) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    final list = await pc.fetchWorkspaceTechniquesManagement();
    if (mounted) {
      setState(() {
        _rows = list;
        _loading = false;
      });
    }
  }

  Future<void> _openAddSheet() async {
    final pc = context.read<PrivateCompanyProvider>();
    final ws = pc.workspace;
    if (ws == null) return;
    final l10n = AppLocalizations.of(context);
    String category = 'INSPECTION_QC';
    final slugCtrl = TextEditingController();
    final labelArCtrl = TextEditingController();
    final labelEnCtrl = TextEditingController();
    String? departmentId;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: StatefulBuilder(
            builder: (ctx, setModal) {
              return Container(
                decoration: const BoxDecoration(
                  color: Color(0xFF12122A),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        l10n.t('pc_ws_techniques_add'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        value: category,
                        dropdownColor: const Color(0xFF1E1E3A),
                        decoration: _fieldDeco(l10n.t('pc_ws_techniques_category')),
                        items: [
                          DropdownMenuItem(
                            value: 'INSPECTION_QC',
                            child: Text(
                              l10n.t('pc_ws_techniques_category_qc'),
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 'MAINTENANCE',
                            child: Text(
                              l10n.t('pc_ws_techniques_category_maint'),
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                        ],
                        onChanged: (v) {
                          if (v != null) setModal(() => category = v);
                        },
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: slugCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: _fieldDeco(l10n.t('pc_ws_techniques_slug')),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: labelArCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: _fieldDeco(l10n.t('pc_ws_techniques_label_ar')),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: labelEnCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: _fieldDeco(l10n.t('pc_ws_techniques_label_en')),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String?>(
                        value: departmentId,
                        dropdownColor: const Color(0xFF1E1E3A),
                        decoration: _fieldDeco(l10n.t('pc_ws_techniques_department')),
                        items: [
                          DropdownMenuItem<String?>(
                            value: null,
                            child: Text(
                              l10n.t('pc_ws_techniques_department_all'),
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                          ...ws.departments.map(
                            (d) => DropdownMenuItem<String?>(
                              value: d.id,
                              child: Text(
                                d.name,
                                style: const TextStyle(color: Colors.white),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (v) => setModal(() => departmentId = v),
                      ),
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: pc.submitting
                            ? null
                            : () async {
                                final slug = slugCtrl.text.trim();
                                final ar = labelArCtrl.text.trim();
                                if (slug.isEmpty || ar.isEmpty) return;
                                final techProv = ctx.read<ProvisorTechniquesProvider>();
                                final success = await pc.createWorkspaceTechnique(
                                  category: category,
                                  slug: slug,
                                  labelAr: ar,
                                  labelEn: labelEnCtrl.text.trim(),
                                  departmentId: departmentId,
                                );
                                if (!ctx.mounted) return;
                                if (success) {
                                  await techProv.fetch();
                                  if (ctx.mounted) Navigator.of(ctx).pop(true);
                                }
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6C63FF),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(l10n.t('pc_ws_techniques_add')),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
    slugCtrl.dispose();
    labelArCtrl.dispose();
    labelEnCtrl.dispose();
    if (ok == true && mounted) await _load();
  }

  static InputDecoration _fieldDeco(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withAlpha(40)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF6C63FF)),
      ),
    );
  }

  Future<void> _confirmDelete(String id) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('pc_ws_techniques_delete_confirm'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel'), style: const TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFF4757)),
            child: const Text('OK', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final pc = context.read<PrivateCompanyProvider>();
    final deleted = await pc.deleteWorkspaceTechnique(id);
    if (deleted && mounted) {
      await context.read<ProvisorTechniquesProvider>().fetch();
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          l10n.t('pc_ws_techniques_title'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      floatingActionButton: pc.canManageWorkspaceTechniques
          ? FloatingActionButton.extended(
              onPressed: pc.submitting ? null : _openAddSheet,
              backgroundColor: const Color(0xFF6C63FF),
              icon: const Icon(Icons.add),
              label: Text(l10n.t('pc_ws_techniques_add')),
            )
          : null,
      body: !pc.canManageWorkspaceTechniques
          ? Center(
              child: Text(
                l10n.t('pc_ws_techniques_subtitle'),
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withAlpha(120)),
              ),
            )
          : _loading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  children: [
                    Text(
                      l10n.t('pc_ws_techniques_subtitle'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(160),
                        fontSize: 13,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_rows.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 40),
                        child: Text(
                          l10n.t('pc_ws_techniques_add'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withAlpha(100)),
                        ),
                      )
                    else
                      ..._rows.map((r) {
                        final slug = r['slug']?.toString() ?? '';
                        final cat = r['category']?.toString() ?? '';
                        final ar = r['labelAr']?.toString() ?? '';
                        final en = r['labelEn']?.toString();
                        final dept = r['department'] as Map<String, dynamic>?;
                        final deptName = dept?['name']?.toString();
                        final id = r['id']?.toString() ?? '';
                        return Card(
                          color: const Color(0xFF12122A),
                          margin: const EdgeInsets.only(bottom: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                            side: BorderSide(color: Colors.white.withAlpha(20)),
                          ),
                          child: ListTile(
                            title: Text(
                              ar,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: Text(
                              [
                                slug,
                                cat == 'MAINTENANCE'
                                    ? l10n.t('pc_ws_techniques_category_maint')
                                    : l10n.t('pc_ws_techniques_category_qc'),
                                if (en != null && en.isNotEmpty) en,
                                if (deptName != null && deptName.isNotEmpty) deptName,
                              ].join(' · '),
                              style: TextStyle(
                                color: Colors.white.withAlpha(140),
                                fontSize: 12,
                              ),
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline, color: Color(0xFFFF4757)),
                              onPressed: id.isEmpty ? null : () => _confirmDelete(id),
                            ),
                          ),
                        );
                      }),
                  ],
                ),
    );
  }
}
