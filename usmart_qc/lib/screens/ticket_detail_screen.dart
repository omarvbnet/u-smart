import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:share_plus/share_plus.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import '../models/private_company.dart';
import '../models/private_company_warehouse.dart';
import '../models/comment.dart';
import '../models/evidence.dart';
import '../models/inspection_checklist.dart';
import '../providers/auth_provider.dart';
import '../providers/conflicts_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/private_company_warehouse_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/tickets_provider.dart';
import '../widgets/status_badge.dart';
import '../widgets/workspace_ticket_expenses_section.dart';
import '../widgets/comments_widget.dart';
import '../widgets/checklist_widget.dart';
import '../widgets/evidence_upload_widget.dart';
import 'ncr_resubmit_screen.dart';
import 'conflict_detail_screen.dart';
import 'attachment_viewer_screen.dart';
import 'ticket_qfield_workspace_screen.dart';

class TicketDetailScreen extends StatefulWidget {
  final String ticketId;
  const TicketDetailScreen({super.key, required this.ticketId});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Ticket? _ticket;
  bool _loading = true;
  bool _assigning = false;
  bool _assigningTechnician = false;
  bool _updatingStatus = false;

  List<TicketComment> _comments = [];
  List<TicketEvidence> _evidence = [];
  List<InspectionChecklist> _checklists = [];
  List<InspectionChecklist> _archivedChecklists = [];
  bool _loadingComments = false;
  bool _loadingEvidence = false;
  bool _loadingChecklists = false;
  bool _loadingArchivedChecklists = false;
  String? _attachTemplateChoice;
  bool _uploading = false;
  bool _completingMaintenance = false;
  bool _confirmingMaintenance = false;
  bool _maintenanceCrewBusy = false;
  bool _cancellationBusy = false;
  final _cancellationReasonCtrl = TextEditingController();
  String? _selectedCancellationReason;

  /// Maintenance: before (4–6) and after (4–6) image URLs for completion
  List<String> _maintenanceBeforeUrls = [];
  List<String> _maintenanceAfterUrls = [];

  Map<String, dynamic>? _ticketMaterialsSummary;

  final _picker = ImagePicker();

  bool get _isEngineer => context.read<AuthProvider>().isEngineer;
  bool get _isTechnician => context.read<AuthProvider>().isTechnician;

  bool _userOnMaintenanceTicket(Ticket t) {
    final uid = context.read<AuthProvider>().user?.id;
    if (uid == null || !t.isMaintenance) return false;
    if (t.assignedEngineerId == uid) return true;
    return t.maintenanceCrewIds.contains(uid);
  }

  bool _isTicketRequester(Ticket t) {
    final uid = context.read<AuthProvider>().user?.id;
    return uid != null && t.requesterId == uid;
  }

  bool _isAssignedFieldStaff(Ticket t) {
    final uid = context.read<AuthProvider>().user?.id;
    if (uid == null) return false;
    if (t.assignedEngineerId == uid) return true;
    return t.maintenanceCrewIds.contains(uid);
  }

  bool _canManageQField(Ticket t) {
    final auth = context.read<AuthProvider>();
    final uid = auth.user?.id;
    if (uid == null) return false;
    if (t.requesterId == uid) return true;
    if (t.assignedEngineerId == uid) return true;
    if (t.maintenanceCrewIds.contains(uid)) return true;
    final role = auth.user!.role.toUpperCase();
    final wsId = context.read<PrivateCompanyProvider>().workspace?.id;
    final isWsTicket =
        t.assignmentScope == 'PRIVATE_COMPANY_STAFF' && t.privateCompanyId != null;
    if (isWsTicket) {
      if (wsId == null || wsId != t.privateCompanyId) return false;
      return role == 'ENGINEER' ||
          role == 'QUALITY_ENGINEER' ||
          role == 'SUPERVISION_ENGINEER' ||
          role == 'TECHNICIAN' ||
          role == 'MANAGER' ||
          role == 'COORDINATOR';
    }
    if (role == 'ENGINEER' ||
        role == 'QUALITY_ENGINEER' ||
        role == 'SUPERVISION_ENGINEER') {
      return true;
    }
    return false;
  }

  bool _canSubmitMaintenanceCompletion() {
    final r = (context.read<AuthProvider>().user?.role ?? '').toUpperCase();
    return r == 'TECHNICIAN' || r == 'WORKER';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cancellationReasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final provider = context.read<TicketsProvider>();
    final t = await provider.fetchTicketDetail(widget.ticketId);
    if (mounted) {
      setState(() {
        _ticket = t;
        _loading = false;
        if (t != null && t.isMaintenance) {
          final uid = context.read<AuthProvider>().user?.id;
          final role = (context.read<AuthProvider>().user?.role ?? '').toUpperCase();
          final onTicket =
              uid != null && (uid == t.assignedEngineerId || t.maintenanceCrewIds.contains(uid));
          if (onTicket && (role == 'TECHNICIAN' || role == 'WORKER') && t.isInProgress) {
            _maintenanceBeforeUrls = List.from(t.beforeImageUrls);
            _maintenanceAfterUrls = List.from(t.finishingImageUrls);
          } else if (t.isMaintenance) {
            _maintenanceBeforeUrls = [];
            _maintenanceAfterUrls = [];
          }
        }
      });
      // Load comments & evidence for both company and engineer (both can view/reply/upload)
      _loadCommentsAndEvidence();
      if (_isEngineer && t != null) {
        _attachTemplateChoice = t.checklistTemplateId;
        _loadChecklistsForTicket(t);
        _loadArchivedChecklists();
      }
      context.read<SitesProvider>().fetchSites();
      Future.microtask(() => _loadTicketWarehouseSummary());
    }
  }

  Future<void> _loadTicketWarehouseSummary() async {
    final pc = context.read<PrivateCompanyProvider>();
    if (!pc.hasWorkspace || !pc.isApproved) return;
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final res = await wh.fetchTicketMaterialSummary(widget.ticketId);
    if (!mounted) return;
    setState(() => _ticketMaterialsSummary = res);
  }

  Future<void> _loadCommentsAndEvidence() async {
    final provider = context.read<TicketsProvider>();
    setState(() {
      _loadingComments = true;
      _loadingEvidence = true;
    });
    final results = await Future.wait([
      provider.fetchComments(widget.ticketId),
      provider.fetchEvidence(widget.ticketId),
    ]);
    if (mounted) {
      setState(() {
        _comments = results[0] as List<TicketComment>;
        _evidence = results[1] as List<TicketEvidence>;
        _loadingComments = false;
        _loadingEvidence = false;
      });
    }
  }

  Future<void> _loadChecklistsForTicket(Ticket t) async {
    final provider = context.read<TicketsProvider>();
    setState(() => _loadingChecklists = true);
    var checklists = await provider.fetchChecklists(technique: t.technique);
    final tid = t.checklistTemplateId?.trim();
    final preview = t.checklistTemplate;
    if (tid != null && tid.isNotEmpty && preview != null && preview.isNotEmpty) {
      final has = checklists.any((c) => c.id == tid);
      if (!has) {
        try {
          final itemsRaw = preview['items'];
          final synthetic = InspectionChecklist.fromJson({
            'id': preview['id'] ?? tid,
            'name': (preview['name'] as String?)?.trim().isNotEmpty == true
                ? preview['name']
                : 'Checklist',
            'items': itemsRaw is List ? itemsRaw : <dynamic>[],
            'archived': false,
          });
          checklists = [synthetic, ...checklists];
        } catch (_) {}
      }
    }
    if (mounted) {
      setState(() {
        _checklists = checklists;
        _loadingChecklists = false;
      });
    }
  }

  Future<void> _loadArchivedChecklists() async {
    final provider = context.read<TicketsProvider>();
    setState(() => _loadingArchivedChecklists = true);
    final list = await provider.fetchChecklists(archiveScope: 'mine');
    if (mounted) {
      setState(() {
        _archivedChecklists = list;
        _loadingArchivedChecklists = false;
      });
    }
  }

  Future<void> _applyChecklistTemplateToTicket(Ticket t, AppLocalizations l10n) async {
    final id = (_attachTemplateChoice ?? t.checklistTemplateId)?.trim();
    if (id == null || id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('engineer_cl_apply_failed'))),
      );
      return;
    }
    final ok = await context.read<TicketsProvider>().setTicketChecklistTemplate(t.id, id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? l10n.t('site_save') : l10n.t('engineer_cl_apply_failed')),
        backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
      ),
    );
    if (ok) await _load();
  }

  Future<void> _archiveTemplate(InspectionChecklist c, AppLocalizations l10n) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(l10n.t('engineer_cl_archive'), style: const TextStyle(color: Colors.white)),
        content: Text(l10n.t('engineer_cl_archive_confirm'),
            style: TextStyle(color: Colors.white.withAlpha(200))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.t('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l10n.t('engineer_cl_archive'))),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final ok = await context.read<TicketsProvider>().updateInspectionChecklist(c.id, archived: true);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? l10n.t('site_save') : l10n.t('engineer_cl_create_failed'))),
    );
    if (ok) {
      if (_ticket != null) await _loadChecklistsForTicket(_ticket!);
      await _loadArchivedChecklists();
    }
  }

  Future<void> _unarchiveTemplate(InspectionChecklist c, AppLocalizations l10n) async {
    final ok = await context.read<TicketsProvider>().updateInspectionChecklist(c.id, archived: false);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? l10n.t('site_save') : l10n.t('engineer_cl_create_failed'))),
    );
    if (ok) {
      if (_ticket != null) await _loadChecklistsForTicket(_ticket!);
      await _loadArchivedChecklists();
    }
  }

  Future<void> _showCreateChecklistDialog(Ticket t, AppLocalizations l10n) async {
    final result = await showDialog<_CreateChecklistDialogResult>(
      context: context,
      builder: (ctx) => _CreateChecklistTemplateDialog(l10n: l10n),
    );
    if (result == null || !mounted) return;
    final name = result.name;
    final items = result.items;
    if (name.isEmpty || items.isEmpty) return;
    final created = await context.read<TicketsProvider>().createInspectionChecklist(
      name: name,
      items: items,
      techniqueTypes: [t.technique],
    );
    if (!mounted) return;
    if (created == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('engineer_cl_create_failed'))),
      );
      return;
    }
    final attached = await context.read<TicketsProvider>().setTicketChecklistTemplate(t.id, created.id);
    if (!mounted) return;
    if (attached) {
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('engineer_cl_apply_failed'))),
      );
    }
  }

  List<Widget> _engineerChecklistTemplateControls(Ticket t, AppLocalizations l10n) {
    final me = context.read<AuthProvider>().user?.id;
    return [
      const SizedBox(height: 12),
      _glassContainer(
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('engineer_cl_attach'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 12),
              if (_loadingChecklists)
                const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2)))
              else ...[
                Builder(
                  builder: (ctx) {
                    final ids = _checklists.map((c) => c.id).toSet();
                    final chosen = (_attachTemplateChoice ?? t.checklistTemplateId)?.trim();
                    final dropdownValue =
                        chosen != null && chosen.isNotEmpty && ids.contains(chosen) ? chosen : null;
                    return DropdownButtonFormField<String>(
                      value: dropdownValue,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: Colors.white.withAlpha(8),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      dropdownColor: const Color(0xFF1A1A35),
                      hint: Text(l10n.t('no_checklist_selected'),
                          style: TextStyle(color: Colors.white.withAlpha(120))),
                      items: [
                        ..._checklists.map(
                          (c) => DropdownMenuItem(
                            value: c.id,
                            child: Text(c.name, style: const TextStyle(color: Colors.white, fontSize: 14)),
                          ),
                        ),
                      ],
                      onChanged: (v) => setState(() => _attachTemplateChoice = v),
                    );
                  },
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        onPressed: () => _applyChecklistTemplateToTicket(t, l10n),
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF6C63FF)),
                        child: Text(l10n.t('engineer_cl_apply')),
                      ),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton(
                      onPressed: () => _showCreateChecklistDialog(t, l10n),
                      child: Text(l10n.t('engineer_cl_create')),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ..._checklists.where((c) => c.createdByRequesterId != null && c.createdByRequesterId == me).map(
                  (c) => ListTile(
                    dense: true,
                    title: Text(c.name, style: const TextStyle(color: Colors.white, fontSize: 13)),
                    trailing: IconButton(
                      icon: const Icon(Icons.archive_outlined, color: Color(0xFF8B83FF), size: 20),
                      onPressed: () => _archiveTemplate(c, l10n),
                      tooltip: l10n.t('engineer_cl_archive'),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.white12),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text(
                    l10n.t('engineer_cl_archived'),
                    style: const TextStyle(color: Color(0xFF00D4AA), fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  children: [
                    if (_loadingArchivedChecklists)
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    else if (_archivedChecklists.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          l10n.t('engineer_cl_archived_empty'),
                          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
                        ),
                      )
                    else
                      ..._archivedChecklists.map(
                        (c) => ListTile(
                          dense: true,
                          title: Text(c.name, style: const TextStyle(color: Colors.white, fontSize: 13)),
                          trailing: TextButton(
                            onPressed: () => _unarchiveTemplate(c, l10n),
                            child: Text(l10n.t('engineer_cl_unarchive')),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  bool _maintenanceEngineerDispatchPending(Ticket t, PrivateCompanyProvider pc) {
    if (!t.canBeAssigned || !t.isMaintenance) return false;
    if ((t.assignmentScope ?? '').toUpperCase() != 'PRIVATE_COMPANY_STAFF') return false;
    final did = t.privateCompanyTargetDepartmentId;
    if (did == null || did.isEmpty) return false;
    if (!pc.hasWorkspace || !pc.isApproved) return false;
    return pc.departmentUsesEngineerMaintenanceDispatch(did);
  }

  bool _maintenanceDispatchAssignEligible(Ticket t, PrivateCompanyProvider pc) =>
      _maintenanceEngineerDispatchPending(t, pc) &&
      pc.canDispatchMaintenanceForDepartment(t.privateCompanyTargetDepartmentId);

  List<PrivateCompanyStaff> _technicianAssignCandidates(Ticket t, PrivateCompanyProvider pc) {
    final ws = pc.workspace;
    final did = t.privateCompanyTargetDepartmentId;
    if (ws == null || did == null || did.isEmpty) return [];
    final out = <PrivateCompanyStaff>[];
    for (final s in ws.staff) {
      if (s.status.toUpperCase() != 'ACTIVE') continue;
      if (s.role.toUpperCase() != 'TECHNICIAN') continue;
      if (s.departmentId != did) continue;
      out.add(s);
    }
    out.sort((a, b) {
      final na = (a.name?.trim().isNotEmpty == true) ? a.name!.trim() : a.username;
      final nb = (b.name?.trim().isNotEmpty == true) ? b.name!.trim() : b.username;
      return na.toLowerCase().compareTo(nb.toLowerCase());
    });
    return out;
  }

  List<Widget> _maintenanceDispatcherAssignWidgets(Ticket t, AppLocalizations l10n) {
    final hasActive = context.read<TicketsProvider>().hasActiveTicket;
    if (hasActive) {
      return [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          decoration: BoxDecoration(
            color: const Color(0xFFFBBF24).withAlpha(15),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFFBBF24).withAlpha(40)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline_rounded,
                  color: Color(0xFFFBBF24), size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('complete_before_assign'),
                  style: TextStyle(
                    color: const Color(0xFFFBBF24).withAlpha(220),
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
      ];
    }
    return [
      _actionButton(
        icon: Icons.group_add_rounded,
        label: l10n.t('maint_assign_technician'),
        gradient: const [Color(0xFF6C63FF), Color(0xFF5A52E0)],
        loading: _assigningTechnician,
        onTap: () => _openAssignTechnicianPicker(t),
      ),
      const SizedBox(height: 12),
    ];
  }

  Future<void> _openAssignTechnicianPicker(Ticket t) async {
    final l10n = AppLocalizations.of(context);
    final pc = context.read<PrivateCompanyProvider>();
    final candidates = _technicianAssignCandidates(t, pc);
    if (!mounted) return;
    if (candidates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('maint_assign_technician_empty')),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }
    final maxH = MediaQuery.of(context).size.height * 0.5;
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxH),
            child: Column(
              mainAxisSize: MainAxisSize.max,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: Text(
                    l10n.t('maint_assign_technician'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: candidates.length,
                    itemBuilder: (_, i) {
                      final s = candidates[i];
                      final label =
                          (s.name?.trim().isNotEmpty == true) ? s.name!.trim() : s.username;
                      final sub = (s.province ?? '').trim();
                      return ListTile(
                        leading:
                            const Icon(Icons.person_rounded, color: Color(0xFF6C63FF)),
                        title: Text(label, style: const TextStyle(color: Colors.white)),
                        subtitle: sub.isNotEmpty
                            ? Text(sub,
                                style: TextStyle(
                                    color: Colors.white.withAlpha(160), fontSize: 12))
                            : null,
                        onTap: () => Navigator.pop(ctx, s.id),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    await _assignTicketToTechnician(picked);
  }

  Future<void> _assignTicketToTechnician(String assigneeRequesterId) async {
    setState(() => _assigningTechnician = true);
    final ok = await context
        .read<TicketsProvider>()
        .assignTicketToRequester(widget.ticketId, assigneeRequesterId);
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? l10n.t('assign_success') : l10n.t('assign_failed')),
        backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    if (ok) await _load();
    setState(() => _assigningTechnician = false);
  }

  Future<void> _assignToMe() async {
    setState(() => _assigning = true);
    final ok =
        await context.read<TicketsProvider>().assignTicketToMe(widget.ticketId);
    if (mounted) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? l10n.t('assign_success') : l10n.t('assign_failed')),
          backgroundColor:
              ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      if (ok) await _load();
      setState(() => _assigning = false);
    }
  }

  Future<void> _updateStatus(String newStatus) async {
    setState(() => _updatingStatus = true);
    final ok = await context
        .read<TicketsProvider>()
        .updateTicketStatus(widget.ticketId, newStatus);
    if (mounted) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok
              ? l10n.t('status_updated', {'status': _statusLabel(newStatus, l10n)})
              : l10n.t('status_failed')),
          backgroundColor:
              ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      if (ok) await _load();
      setState(() => _updatingStatus = false);
    }
  }

  Future<void> _addComment(String body) async {
    final provider = context.read<TicketsProvider>();
    final comment = await provider.addComment(widget.ticketId, body);
    if (comment != null && mounted) {
      setState(() => _comments = [..._comments, comment]);
    }
  }

  void _showImageSourceChoice() {
    final l10n = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF6C63FF)),
                title: Text(l10n.t('pick_from_gallery'), style: const TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndUploadFromGallery();
                },
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_rounded, color: Color(0xFF6C63FF)),
                title: Text(l10n.t('take_photo'), style: const TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndUploadFromCamera();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickAndUploadFromGallery() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 72,
      maxWidth: 1920,
      maxHeight: 1920,
    );
    if (picked != null) await _uploadImageFromXFile(picked);
  }

  Future<void> _pickAndUploadFromCamera() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 72,
      maxWidth: 1920,
      maxHeight: 1920,
    );
    if (picked != null) await _uploadImageFromXFile(picked);
  }

  Future<void> _uploadImageFromXFile(XFile xFile) async {
    if (!mounted) return;
    final provider = context.read<TicketsProvider>();
    final bytes = await xFile.readAsBytes();
    if (bytes.isEmpty) return;
    final path = xFile.path;
    final ext = (path.split('.').lastOrNull ?? 'jpg').toLowerCase();
    final filename = 'image_${DateTime.now().millisecondsSinceEpoch}.$ext';
    if (!mounted) return;
    setState(() => _uploading = true);
    try {
      final url = await provider.uploadFileFromBytes(bytes, filename);
      if (url != null) {
        final evidence = await provider.addEvidence(widget.ticketId, url, 'image');
        if (evidence != null && mounted) {
          setState(() => _evidence = [evidence, ..._evidence]);
        }
      } else if (mounted) {
        _showUploadError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (e) {
      if (mounted) {
        final msg = e is Exception ? e.toString().replaceFirst('Exception: ', '') : AppLocalizations.of(context).t('upload_failed');
        _showUploadError(msg);
      }
    }
    if (mounted) setState(() => _uploading = false);
  }

  Future<void> _pickAndUploadImage() async {
    _showImageSourceChoice();
  }

  Future<void> _pickAndUploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'],
      allowMultiple: false,
      withData: true, // for web when path is null
    );
    if (!mounted) return;
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final path = file.path;
    final bytes = file.bytes;
    final filename = file.name;
    final ext = (file.extension ?? filename.split('.').lastOrNull ?? '').toLowerCase();
    final fileType = ext == 'pdf' ? 'file' : 'image';

    setState(() => _uploading = true);
    final provider = context.read<TicketsProvider>();
    try {
      String? url;
      // Prefer bytes over path - iOS paths can be inaccessible after picker dismisses
      if (bytes != null && bytes.isNotEmpty && filename.isNotEmpty) {
        url = await provider.uploadFileFromBytes(bytes, filename);
      } else if (path != null && path.isNotEmpty) {
        url = await provider.uploadFile(path);
      }
      if (url != null) {
        final evidence = await provider.addEvidence(widget.ticketId, url, fileType);
        if (evidence != null && mounted) {
          setState(() => _evidence = [evidence, ..._evidence]);
        }
      } else if (mounted) {
        _showUploadError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (e) {
      if (mounted) {
        final msg = e is Exception ? e.toString().replaceFirst('Exception: ', '') : AppLocalizations.of(context).t('upload_failed');
        _showUploadError(msg);
      }
    }
    if (mounted) setState(() => _uploading = false);
  }

  void _showUploadError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
        action: SnackBarAction(
          label: AppLocalizations.of(context).t('ok'),
          textColor: Colors.white,
          onPressed: () {},
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _completeWithChecklist(
      Map<String, dynamic> checklistResponse) async {
    final items = (checklistResponse['items'] as List?) ?? [];
    final allAccepted = items.every((i) =>
        (i is Map && (i['result'] ?? i['checked']) == 'accepted') ||
        (i is Map && i['checked'] == true && i['result'] != 'rejected'));
    final defaultResult = allAccepted ? 'accepted' : 'not_accepted';

    final resultCtrl = TextEditingController(text: defaultResult);
    final commentsCtrl = TextEditingController();

    final l10n = AppLocalizations.of(context);
    final data = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('complete_ticket'),
            style:
                TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.t('inspection_result_label'),
                style: TextStyle(color: Colors.white.withAlpha(180)),
              ),
              const SizedBox(height: 16),
              _dialogDropdown(resultCtrl, l10n),
              const SizedBox(height: 12),
              TextField(
                controller: commentsCtrl,
                maxLines: 3,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: l10n.t('inspection_comments_hint'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF0A0A1F),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, {
              'result': resultCtrl.text.isEmpty ? 'pass' : resultCtrl.text,
              'comments': commentsCtrl.text,
            }),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00D4AA),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child:
                Text(l10n.t('complete'), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    resultCtrl.dispose();
    commentsCtrl.dispose();

    if (data == null || !mounted) return;

    final ok = await context.read<TicketsProvider>().completeTicket(
          widget.ticketId,
          {
            ...checklistResponse,
            'inspectionResult': data['result'],
            'inspectionComments': data['comments'],
          },
        );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok.success ? l10n.t('ticket_completed') : l10n.t('complete_failed')),
          backgroundColor:
              ok.success ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      if (ok.success) await _load();
    }
  }

  Widget _dialogDropdown(TextEditingController ctrl, AppLocalizations l10n) {
    final options = {
      'accepted': l10n.t('accepted'),
      'accepted_with_comments': l10n.t('accepted_with_comments'),
      'not_accepted': l10n.t('not_accepted'),
      'ncr': l10n.t('ncr'),
    };
    if (ctrl.text.isEmpty) ctrl.text = 'accepted';
    return StatefulBuilder(
      builder: (ctx, setDropState) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: const Color(0xFF0A0A1F),
          borderRadius: BorderRadius.circular(14),
        ),
        child: DropdownButton<String>(
          value: ctrl.text,
          isExpanded: true,
          dropdownColor: const Color(0xFF12122A),
          underline: const SizedBox.shrink(),
          style: const TextStyle(color: Colors.white, fontSize: 14),
          items: options.entries.map((e) {
            return DropdownMenuItem(
                value: e.key, child: Text(e.value));
          }).toList(),
          onChanged: (v) {
            if (v != null) {
              setDropState(() => ctrl.text = v);
            }
          },
        ),
      ),
    );
  }

  Color get _accentColor {
    final s = _ticket?.status ?? 'PENDING';
    switch (s.toUpperCase()) {
      case 'PENDING':
        return const Color(0xFFFBBF24);
      case 'ON_SITE':
        return const Color(0xFF6C63FF);
      case 'IN_PROGRESS':
        return const Color(0xFF00D4AA);
      case 'COMPLETED':
        return const Color(0xFF4ADE80);
      default:
        return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: _loading
          ? const Center(
              child:
                  CircularProgressIndicator(color: Color(0xFF6C63FF)))
          : _ticket == null
              ? Center(
                  child: Text(AppLocalizations.of(context).t('ticket_not_found'),
                      style: TextStyle(color: Color(0xFF6B7280))))
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF6C63FF),
                  child: CustomScrollView(
                    slivers: [
                      _buildAppBar(),
                      SliverPadding(
                        padding: const EdgeInsets.all(16),
                        sliver: SliverList(
                          delegate:
                              SliverChildListDelegate(_buildContent()),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Future<void> _shareTicket() async {
    final t = _ticket!;
    // Share public web page route (not JSON API endpoint).
    final url = '${ApiConfig.baseUrl}${ApiConfig.publicTicketPage(t.id)}';
    final text = 'Ticket: ${t.siteName ?? t.id}\n$url';
    try {
      final box = context.findRenderObject() as RenderBox?;
      await Share.share(
        text,
        subject: 'Ticket ${t.siteName ?? t.id}',
        sharePositionOrigin: box == null
            ? null
            : Rect.fromLTWH(
                box.localToGlobal(Offset.zero).dx,
                box.localToGlobal(Offset.zero).dy,
                box.size.width,
                box.size.height,
              ),
      );
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: text));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Share sheet unavailable. Link copied to clipboard.'),
          backgroundColor: Color(0xFF6C63FF),
        ),
      );
    }
  }

  SliverAppBar _buildAppBar() {
    final t = _ticket!;
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: const Color(0xFF05051A),
      foregroundColor: Colors.white,
      actions: [
        IconButton(
          icon: const Icon(Icons.share_rounded),
          onPressed: _shareTicket,
          tooltip: AppLocalizations.of(context).t('share'),
        ),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _accentColor.withAlpha(40),
                    const Color(0xFF05051A),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
            Positioned(
              top: -30,
              right: -30,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      _accentColor.withAlpha(30),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          t.siteName ?? AppLocalizations.of(context).t('unknown_site'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      StatusBadge(status: t.status, fontSize: 13, localizations: AppLocalizations.of(context)),
                    ],
                  ),
                  if (t.isAssigned) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.person, size: 14, color: _accentColor),
                        const SizedBox(width: 4),
                        Text(
                          AppLocalizations.of(context).t('assigned_to', {'name': t.assignedEngineerName ?? ''}),
                          style: TextStyle(
                            color: _accentColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (t.allowWorkspaceCrewJoin &&
                      t.assignmentScope == 'PRIVATE_COMPANY_STAFF' &&
                      t.isAssigned &&
                      !t.isCompleted) ...[
                    const SizedBox(height: 10),
                    _maintenanceCrewBanner(context, t),
                  ],
                  if (t.assignmentScope == 'PRIVATE_COMPANY_STAFF' &&
                      t.workspaceTicketExpensesEnabled) ...[
                    WorkspaceTicketExpensesSection(
                      ticket: t,
                      onChanged: () {
                        if (mounted) setState(() {});
                      },
                    ),
                  ],
                  if (t.isCompleted && _effectiveInspectionResult(t) != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: _resultColor(_effectiveInspectionResult(t)!).withAlpha(35),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: _resultColor(_effectiveInspectionResult(t)!).withAlpha(80)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.assignment_turned_in_rounded, size: 16, color: _resultColor(_effectiveInspectionResult(t)!)),
                          const SizedBox(width: 6),
                          Text(
                            _statusLabel(_effectiveInspectionResult(t)!, AppLocalizations.of(context)),
                            style: TextStyle(
                              color: _resultColor(_effectiveInspectionResult(t)!),
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _technicianHasAnotherActiveFieldTicket(String uid, Ticket current, List<Ticket> all) {
    for (final o in all) {
      if (o.id == current.id) continue;
      if (!o.isOnSite && !o.isInProgress) continue;
      if (o.assignedEngineerId == uid) return true;
      if (o.maintenanceCrewIds.contains(uid)) return true;
    }
    return false;
  }

  Widget _maintenanceCrewBanner(BuildContext context, Ticket t) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final auth = context.watch<AuthProvider>();
    final ticketsProv = context.watch<TicketsProvider>();
    final uid = auth.user?.id;
    String labelFor(String id) {
      if (id == t.assignedEngineerId) {
        final n = t.assignedEngineerName?.trim();
        return (n != null && n.isNotEmpty) ? n : id;
      }
      for (final s in pc.workspace?.staff ?? const <PrivateCompanyStaff>[]) {
        if (s.id == id) {
          final n = s.name?.trim();
          return (n != null && n.isNotEmpty) ? n : s.username;
        }
      }
      return id;
    }

    final leadId = t.assignedEngineerId;
    final chips = <Widget>[
      if (leadId != null && leadId.isNotEmpty)
        Chip(
          label: Text('Lead: ${labelFor(leadId)}'),
          backgroundColor: const Color(0xFF12122A),
          labelStyle: const TextStyle(color: Colors.white, fontSize: 11),
          side: BorderSide(color: _accentColor.withAlpha(100)),
        ),
      ...t.maintenanceCrewIds.map(
        (id) => Chip(
          label: Text(labelFor(id)),
          backgroundColor: const Color(0xFF12122A),
          labelStyle: TextStyle(color: Colors.white.withAlpha(230), fontSize: 11),
          side: BorderSide(color: Colors.white.withAlpha(40)),
        ),
      ),
    ];

    final isLead = uid != null && uid == t.assignedEngineerId;
    final onCrew = uid != null && t.maintenanceCrewIds.contains(uid);
    final blockedFromJoin = uid != null &&
        !isLead &&
        !onCrew &&
        _technicianHasAnotherActiveFieldTicket(uid, t, ticketsProv.tickets);
    final canTap = auth.canJoinWorkspaceTicketCrew && uid != null && !isLead;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('workspace_crew_section_title'),
          style: TextStyle(
            color: Colors.white.withAlpha(200),
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: chips),
        if (canTap) ...[
          const SizedBox(height: 8),
          if (!onCrew)
            if (blockedFromJoin)
              Text(
                l10n.t('maint_crew_join_blocked_active'),
                style: TextStyle(
                  color: Colors.white.withAlpha(160),
                  fontSize: 12,
                  height: 1.35,
                ),
              )
            else
              TextButton(
                onPressed: _maintenanceCrewBusy ? null : () => _postMaintenanceCrewAction('join'),
                child: Text(
                  _maintenanceCrewBusy ? '…' : l10n.t('workspace_crew_join'),
                  style: TextStyle(color: _accentColor, fontWeight: FontWeight.w700),
                ),
              )
          else
            TextButton(
              onPressed: _maintenanceCrewBusy ? null : () => _postMaintenanceCrewAction('leave'),
              child: Text(
                _maintenanceCrewBusy ? '…' : l10n.t('workspace_crew_leave'),
                style: const TextStyle(color: Color(0xFFFF9F43), fontWeight: FontWeight.w700),
              ),
            ),
        ],
      ],
    );
  }

  Future<({double lat, double lng})?> _tryGetCurrentPositionForCrew() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return null;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      final la = pos.latitude;
      final lo = pos.longitude;
      if (!la.isFinite || !lo.isFinite) return null;
      return (lat: la, lng: lo);
    } catch (_) {
      return null;
    }
  }

  Future<void> _postMaintenanceCrewAction(String action) async {
    if (_maintenanceCrewBusy) return;
    setState(() => _maintenanceCrewBusy = true);
    try {
      double? joinLat;
      double? joinLng;
      if (action == 'join') {
        final pos = await _tryGetCurrentPositionForCrew();
        if (!mounted) return;
        if (pos == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                AppLocalizations.of(context).t('maint_crew_join_location_required'),
              ),
            ),
          );
          return;
        }
        joinLat = pos.lat;
        joinLng = pos.lng;
      }
      final tp = context.read<TicketsProvider>();
      final result = await tp.postMaintenanceCrewAction(
        widget.ticketId,
        action,
        latitude: joinLat,
        longitude: joinLng,
      );
      if (!mounted) return;
      if (result.crew != null) {
        final refreshed = await tp.fetchTicketDetail(widget.ticketId);
        if (mounted) {
          setState(() {
            if (refreshed != null) _ticket = refreshed;
          });
        }
      } else if (mounted) {
        final l10n = AppLocalizations.of(context);
        final serverMsg = result.message?.trim();
        final text = (serverMsg != null && serverMsg.isNotEmpty)
            ? serverMsg
            : l10n.t('maint_crew_join_failed_generic');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(text)),
        );
      }
    } finally {
      if (mounted) setState(() => _maintenanceCrewBusy = false);
    }
  }

  DateTime? get _siteLastUpdated {
    final t = _ticket;
    if (t?.siteName == null) return null;
    try {
      for (final s in context.read<SitesProvider>().sites) {
        if (s.siteId == t!.siteName) return s.updatedAt;
        if (t.siteName!.trim().isNotEmpty &&
            s.location.trim() == t.siteName!.trim()) {
          return s.updatedAt;
        }
      }
    } catch (_) {}
    return null;
  }

  /// NCR is resolved when engineer has approved the last resubmission (checklist reopened for re-inspection)
  bool _isNcrResolved(Ticket t) {
    if (!t.isNcr || t.ncrResubmissions.isEmpty) return false;
    return t.ncrResubmissions.last.action == 'approved';
  }

  /// Site coordinates: server-provided first, then SitesProvider (siteId or location match).
  ({double lat, double lng})? get _effectiveSiteCoordinates {
    final t = _ticket;
    if (t == null) return null;
    if (t.siteLatitude != null && t.siteLongitude != null) {
      return (lat: t.siteLatitude!, lng: t.siteLongitude!);
    }
    return _siteCoordinatesFromProvider;
  }

  ({double lat, double lng})? get _siteCoordinatesFromProvider {
    final t = _ticket;
    if (t?.siteName == null) return null;
    try {
      for (final s in context.read<SitesProvider>().sites) {
        if (s.siteId == t!.siteName && s.hasCoordinates) {
          return (lat: s.latitude!, lng: s.longitude!);
        }
        if (t.siteName!.trim().isNotEmpty &&
            s.location.trim() == t.siteName!.trim() &&
            s.hasCoordinates) {
          return (lat: s.latitude!, lng: s.longitude!);
        }
      }
    } catch (_) {}
    return null;
  }

  String _formatDateShort(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _formatInspectionHoursDisplay(double h, AppLocalizations l10n) {
    if (h < 1) {
      final mins = (h * 60).round();
      return l10n.t('inspection_minutes', {'m': '$mins'});
    }
    return l10n.t('inspection_hours', {'h': h.toStringAsFixed(1)});
  }

  Future<void> _openWazeToSite(
    double lat,
    double lng,
    AppLocalizations l10n,
  ) async {
    final dLat = lat.toStringAsFixed(6);
    final dLng = lng.toStringAsFixed(6);
    final dest = '$dLat,$dLng';

    Position? pos;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm != LocationPermission.denied &&
          perm != LocationPermission.deniedForever) {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 14),
          ),
        );
      }
    } catch (_) {}

    Future<bool> tryLaunch(Uri u) async {
      try {
        if (await canLaunchUrl(u)) {
          return launchUrl(u, mode: LaunchMode.externalApplication);
        }
      } catch (_) {}
      return false;
    }

    // Waze officially documents destination + navigate=yes; routing starts from the device's current GPS position.
    // The undocumented `from=` parameter often prevents proper handoff to the app on iOS.
    final wazeWebDest = Uri.parse(
      'https://www.waze.com/ul?ll=$dest&navigate=yes&zoom=17',
    );
    final wazeAppDest = Uri.parse('waze://?ll=$dest&navigate=yes');

    if (await tryLaunch(wazeAppDest)) return;
    if (await tryLaunch(wazeWebDest)) return;

    if (pos != null) {
      final oLat = pos.latitude.toStringAsFixed(6);
      final oLng = pos.longitude.toStringAsFixed(6);
      final googleDir = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&origin=$oLat,$oLng&destination=$dLat,$dLng&travelmode=driving',
      );
      if (await tryLaunch(googleDir)) return;
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('site_navigate_failed'))),
      );
    }
  }

  List<Widget> _attachedChecklistSection(Ticket t, AppLocalizations l10n) {
    final tid = t.checklistTemplateId;
    final preview = t.checklistTemplate;
    if (preview == null && (tid == null || tid.isEmpty)) return [];

    final name = preview?['name'] as String?;
    final rawItems = preview?['items'];

    return [
      const SizedBox(height: 16),
      _glassSection(l10n.t('ticket_attached_checklist'), [
        if (name != null && name.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(
              name.trim(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          )
        else if (tid != null && tid.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(
              l10n.t('ticket_checklist_template_unavailable', {'id': tid}),
              style: TextStyle(
                color: Colors.white.withAlpha(160),
                fontSize: 13,
              ),
            ),
          ),
        if (rawItems is List && rawItems.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              l10n.t('ticket_checklist_items_count', {'count': '${rawItems.length}'}),
              style: TextStyle(
                color: Colors.white.withAlpha(100),
                fontSize: 12,
              ),
            ),
          ),
          ...rawItems.map((raw) {
            if (raw is! Map) return const SizedBox.shrink();
            final m = Map<String, dynamic>.from(raw);
            final label = m['label'] as String? ?? '';
            if (label.isEmpty) return const SizedBox.shrink();
            final w = (m['weight'] as String?)?.toLowerCase();
            final isMajor = w == 'major';
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.radio_button_unchecked_rounded,
                    size: 16,
                    color: Colors.white.withAlpha(120),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        color: Colors.white.withAlpha(200),
                        fontSize: 13,
                      ),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: (isMajor ? const Color(0xFFFF4757) : const Color(0xFF818CF8))
                          .withAlpha(36),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white.withAlpha(22)),
                    ),
                    child: Text(
                      isMajor ? l10n.t('checklist_weight_major') : l10n.t('checklist_weight_minor'),
                      style: TextStyle(
                        color: isMajor ? const Color(0xFFFF8A94) : const Color(0xFFB4B9FF),
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 8),
        ],
      ]),
    ];
  }

  List<Widget> _buildContent() {
    final t = _ticket!;
    final l10n = AppLocalizations.of(context);
    final fmt = DateFormat('MMM d, yyyy HH:mm');
    final isEngineer = _isEngineer;
    final isMyTicket = t.assignedEngineerId ==
        context.read<AuthProvider>().user?.id;
    final siteUpdated = _siteLastUpdated;

    final auth = context.read<AuthProvider>();
    final isCoordinatorUser = auth.hasCoordinatorCompany &&
        (auth.isCompanyOwner || auth.isCoordinator || auth.user?.role == 'ADMIN');
    final pc = context.read<PrivateCompanyProvider>();
    final maintDispatchAssignNonEngineer =
        !isEngineer && _maintenanceDispatchAssignEligible(t, pc);

    return [
      // ─── Engineer/Technician action buttons ───
      if (isEngineer) ..._buildEngineerActions(t, isMyTicket, l10n),
      if (maintDispatchAssignNonEngineer) ..._maintenanceDispatcherAssignWidgets(t, l10n),
      if (_isTechnician && t.isMaintenance) ..._buildTechnicianActions(t, isMyTicket, l10n),

      // ─── Resubmit for edit: field staff sends ticket back to coordinator ───
      if ((isEngineer || _isTechnician) &&
          isMyTicket &&
          t.workflowState != 'RESUBMITTED' &&
          !t.isCompleted &&
          t.status.toUpperCase() != 'COMPLETED' &&
          !t.isCancelled) ...[
        const SizedBox(height: 12),
        _resubmitForEditButton(t, l10n),
      ],

      if (_isTicketRequester(t) && t.awaitsRequesterResubmit) ...[
        const SizedBox(height: 12),
        _requesterResubmitBanner(t, l10n),
        const SizedBox(height: 8),
        _requesterEditAndResubmitActions(t, l10n),
      ],

      // ─── NEEDS_EDIT banner: notify field staff coordinator wants edits ───
      if ((isEngineer || _isTechnician) &&
          isMyTicket &&
          t.workflowState == 'NEEDS_EDIT') ...[
        const SizedBox(height: 12),
        _needsEditBanner(t, l10n),
      ],

      // ─── Request-edit: coordinator asks assigned staff to edit ───
      if (isCoordinatorUser &&
          t.assignedEngineerId != null &&
          t.workflowState != 'NEEDS_EDIT' &&
          !t.isCompleted) ...[
        const SizedBox(height: 12),
        _requestEditButton(t, l10n),
      ],

      // ─── RESUBMITTED banner: coordinator sees staff's resubmit reason ───
      if (isCoordinatorUser && t.workflowState == 'RESUBMITTED') ...[
        const SizedBox(height: 12),
        _resubmittedByStaffBanner(t, l10n),
      ],

      // Details
      _glassSection(l10n.t('details'), [
        _rowWithCopy(l10n.t('ticket_id'), t.id, l10n),
        if (t.assignedEngineerId != null)
          _rowWithCopy(l10n.t('assigned_engineer_id'), t.assignedEngineerId!, l10n),
        _row(l10n.t('coordinator'), t.siteCoordinator ?? '-'),
        _row(l10n.t('technique_label'), _techniqueLabel(t.technique, l10n)),
        _row(l10n.t('sla'), t.slaHours != null ? '${t.slaHours} ${l10n.t('hours')}' : '-'),
        _row(l10n.t('created'), fmt.format(t.createdAt)),
        if (t.completedAt != null) _row(l10n.t('section_completed'), t.completedAt!),
        if (t.inspectionHours != null)
          _row(l10n.t('inspection_time'), _formatInspectionHoursDisplay(t.inspectionHours!, l10n)),
        if (siteUpdated != null)
          _row(l10n.t('site_last_updated'), _formatDateShort(siteUpdated)),
        if (_effectiveSiteCoordinates != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 110,
                  child: Text(
                    l10n.t('site_coordinates'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(80),
                      fontSize: 13,
                    ),
                  ),
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => _openWazeToSite(
                      _effectiveSiteCoordinates!.lat,
                      _effectiveSiteCoordinates!.lng,
                      l10n,
                    ),
                    borderRadius: BorderRadius.circular(8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${_effectiveSiteCoordinates!.lat.toStringAsFixed(6)}, ${_effectiveSiteCoordinates!.lng.toStringAsFixed(6)}',
                            style: const TextStyle(
                              color: Color(0xFF00D4AA),
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              decoration: TextDecoration.underline,
                              decorationColor: Color(0xFF00D4AA),
                            ),
                          ),
                        ),
                        const Icon(
                          Icons.navigation_rounded,
                          color: Color(0xFF00D4AA),
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ]),

      ..._attachedChecklistSection(t, l10n),

      // Requester / POC
      if (t.requesterName != null || t.requesterPhone != null) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('requester_poc'), [
          if (t.requesterName != null)
            _row(l10n.t('requester'), t.requesterName!),
          if (t.requesterRole != null)
            _row(l10n.t('profile_role'), _roleLabel(t.requesterRole!, l10n)),
          if (t.requesterPhone != null && t.requesterPhone!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 110,
                    child: Text(
                      l10n.t('profile_phone'),
                      style: TextStyle(
                          color: Colors.white.withAlpha(80), fontSize: 13),
                    ),
                  ),
                  Expanded(
                    child: Row(
                      children: [
                        Text(
                          t.requesterPhone!,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(width: 12),
                        InkWell(
                          onTap: () => _callPhone(t.requesterPhone!),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF00D4AA).withAlpha(30),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                  color: const Color(0xFF00D4AA).withAlpha(60)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.phone_rounded,
                                    color: Color(0xFF00D4AA), size: 16),
                                const SizedBox(width: 6),
                                Text(
                                  l10n.t('call'),
                                  style: const TextStyle(
                                    color: Color(0xFF00D4AA),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ]),
      ],

      if (_effectiveInspectionResult(t) != null) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('inspection_result'), [
          _row(l10n.t('result'), _statusLabel(_effectiveInspectionResult(t)!, l10n)),
          if (t.inspectionComments != null && t.inspectionComments!.isNotEmpty)
            _row(l10n.t('comments'), t.inspectionComments!),
        ]),
      ],

      if (t.checklistHistory.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('previous_inspections'), [
          ...t.checklistHistory.asMap().entries.map((entry) {
            final i = entry.key + 1;
            final h = entry.value;
            final items = h.inspectionChecklist;
            final result = h.inspectionResult ?? 'ncr';
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        l10n.t('inspection_record', {'n': '$i'}),
                        style: TextStyle(
                          color: Colors.white.withAlpha(100),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        h.at.isNotEmpty ? _formatDateShort(DateTime.tryParse(h.at) ?? DateTime.now()) : '',
                        style: TextStyle(
                          color: Colors.white.withAlpha(80),
                          fontSize: 11,
                        ),
                      ),
                      if (result.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: _resultColor(result).withAlpha(30),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _statusLabel(result, l10n),
                            style: TextStyle(
                              color: _resultColor(result),
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (h.inspectionComments != null &&
                      h.inspectionComments!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        h.inspectionComments!,
                        style: TextStyle(
                          color: Colors.white.withAlpha(160),
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                  if (items.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    ...items.map((item) {
                      final label = item['label'] as String? ?? '';
                      final res = item['result'] as String? ?? (item['checked'] == true ? 'accepted' : 'rejected');
                      final isAccepted = res == 'accepted';
                      final comment = item['comment'] as String?;
                      return Padding(
                        padding: const EdgeInsets.only(left: 12, top: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              isAccepted ? Icons.check_circle_rounded : Icons.cancel_rounded,
                              size: 14,
                              color: isAccepted ? const Color(0xFF00D4AA) : const Color(0xFFFF6B81),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    label,
                                    style: TextStyle(
                                      color: Colors.white.withAlpha(180),
                                      fontSize: 12,
                                      decoration: isAccepted ? null : TextDecoration.lineThrough,
                                    ),
                                  ),
                                  if (comment != null && comment.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Text(
                                        comment,
                                        style: TextStyle(
                                          color: Colors.white.withAlpha(100),
                                          fontSize: 11,
                                          fontStyle: FontStyle.italic,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                  const Divider(color: Color(0x10FFFFFF), height: 16),
                ],
              ),
            );
          }),
        ]),
      ],
      if (t.inspectionChecklist != null &&
          t.inspectionChecklist!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('inspection_checklist'), [
          ...t.inspectionChecklist!.map((item) {
            final label = item['label'] as String? ?? '';
            final result = item['result'] as String? ?? (item['checked'] == true ? 'accepted' : 'rejected');
            final isAccepted = result == 'accepted';
            final comment = item['comment'] as String?;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        isAccepted
                            ? Icons.check_circle_rounded
                            : Icons.cancel_rounded,
                        size: 18,
                        color: isAccepted
                            ? const Color(0xFF00D4AA)
                            : const Color(0xFFFF4757),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          label,
                          style: TextStyle(
                            color: isAccepted
                                ? Colors.white
                                : Colors.white.withAlpha(180),
                            fontSize: 14,
                            decoration: isAccepted
                                ? null
                                : TextDecoration.lineThrough,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAccepted
                              ? const Color(0xFF00D4AA).withAlpha(30)
                              : const Color(0xFFFF4757).withAlpha(30),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          isAccepted ? l10n.t('accept') : l10n.t('reject'),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: isAccepted
                                ? const Color(0xFF00D4AA)
                                : const Color(0xFFFF6B81),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (comment != null && comment.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 28),
                      child: Text(
                        comment,
                        style: TextStyle(
                          color: Colors.white.withAlpha(140),
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            );
          }),
        ]),
      ],

      if (_isTicketRequester(t) && t.hasPendingCancellationRequest) ...[
        const SizedBox(height: 16),
        _cancellationPendingBanner(t, l10n),
      ],
      if (_isTicketRequester(t) &&
          t.canRequestCancellation &&
          !t.isCancelled) ...[
        const SizedBox(height: 16),
        _cancellationRequesterSection(t, l10n),
      ],
      if (_isAssignedFieldStaff(t) && t.hasPendingCancellationRequest) ...[
        const SizedBox(height: 16),
        _cancellationStaffSection(t, l10n),
      ],
      if (_isTicketRequester(t) &&
          t.cancellationRequestStatus == 'REJECTED' &&
          (t.cancellationRejectionReason?.trim().isNotEmpty == true)) ...[
        const SizedBox(height: 12),
        _glassSection(l10n.t('ticket_cancellation_rejected_banner'), [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              t.cancellationRejectionReason!,
              style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13),
            ),
          ),
        ]),
      ],

      // NCR Resubmit: requester only
      if (t.isNcr && !isEngineer) ...[
        const SizedBox(height: 16),
        _ncrSection(t, l10n),
      ],
      // Engineer NCR response: when requester has resubmitted, show Approved/Rework
      if (isEngineer && isMyTicket && t.isNcr && t.hasPendingEngineerNcrResponse) ...[
        const SizedBox(height: 16),
        _ncrEngineerResponseSection(t, l10n),
      ],

      // NCR resubmission records (each resubmit action as a record)
      if (t.ncrResubmissions.isNotEmpty) ...[
        const SizedBox(height: 16),
        _ncrResubmitRecordsSection(t, l10n),
      ],

      // Conflict button: QC inspection disputes only (not maintenance tickets).
      if (!isEngineer &&
          t.isCompleted &&
          !t.conflictReported &&
          t.isConflictResult &&
          !t.isMaintenance) ...[
        const SizedBox(height: 16),
        _conflictButton(t, l10n),
      ],

      // Conflict record: show when conflict was reported (engineers & company see result only)
      if (t.conflictReported) ...[
        const SizedBox(height: 16),
        _conflictRecordSection(t, l10n),
      ],

      const SizedBox(height: 16),
      _ticketWarehouseMaterialsBlock(),
      const SizedBox(height: 16),
      _timelineSection(t),

      // ─── Comments & evidence (both company and engineer can view, reply, upload) ───
      const SizedBox(height: 16),
      _glassContainer(
        CommentsWidget(
          comments: _comments,
          loading: _loadingComments,
          onAdd: _addComment,
        ),
      ),
      const SizedBox(height: 16),
      _glassContainer(
        EvidenceUploadWidget(
          evidence: _evidence,
          loading: _loadingEvidence,
          uploading: _uploading,
          onPickImage: _pickAndUploadImage,
          onPickFile: _pickAndUploadFile,
          showUploadButtons: !t.isCompleted &&
              (!t.isMaintenance || t.isInProgress),
        ),
      ),
      // QC checklists: only for engineers on QC tickets (not maintenance)
      if (isEngineer &&
          isMyTicket &&
          !t.isMaintenance &&
          !t.isCompleted &&
          (!t.isNcr || _isNcrResolved(t))) ...[
        ..._engineerChecklistTemplateControls(t, l10n),
        const SizedBox(height: 16),
        _glassContainer(
          ChecklistWidget(
            templates: _checklists,
            loading: _loadingChecklists,
            onComplete: _completeWithChecklist,
            initialTemplateId: t.checklistTemplateId,
          ),
        ),
      ],
      if (t.isMaintenance &&
          !t.isCompleted &&
          t.maintenanceAwaitingRequesterConfirmation &&
          t.requesterId == context.read<AuthProvider>().user?.id) ...[
        const SizedBox(height: 16),
        _maintenanceRequesterConfirmCard(t, l10n),
      ],
      // Maintenance complete: before/after images + send for confirmation (when requester exists)
      if (_canSubmitMaintenanceCompletion() &&
          _userOnMaintenanceTicket(t) &&
          t.isMaintenance &&
          !t.isCompleted &&
          t.isInProgress) ...[
        const SizedBox(height: 16),
        _maintenanceCompleteSection(t, l10n),
      ],

      if (t.isMaintenance &&
          t.maintenanceReason != null &&
          t.maintenanceReason!.trim().isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('maint_reason'), [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              t.maintenanceReason!,
              style: TextStyle(
                  color: Colors.white.withAlpha(180), fontSize: 14),
            ),
          ),
        ]),
      ],
      if (t.isMaintenance) ...[
        const SizedBox(height: 16),
        ..._maintenanceEvidenceSections(t, l10n),
      ],
      if (t.designSpecifications != null &&
          t.designSpecifications!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('design_specifications'), [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              t.designSpecifications!,
              style: TextStyle(
                  color: Colors.white.withAlpha(180), fontSize: 14),
            ),
          ),
        ]),
      ],
      if (t.qfieldProjects.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('ticket_qfield_card_title'), [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.t('ticket_qfield_card_subtitle'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(160),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 12),
                ...t.qfieldProjects.take(4).map(
                      (p) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.layers_outlined,
                                size: 18, color: Color(0xFF00D4AA)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                p.title,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                if (t.qfieldProjects.length > 4)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      l10n.t('ticket_qfield_n_more', {
                        'count': '${t.qfieldProjects.length - 4}',
                      }),
                      style: TextStyle(
                        color: Colors.white.withAlpha(120),
                        fontSize: 12,
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF00D4AA),
                      foregroundColor: const Color(0xFF05051A),
                    ),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => TicketQFieldWorkspaceScreen(
                            ticketId: t.id,
                            initialTicket: t,
                            canWrite: _canManageQField(t),
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.map_rounded, size: 20),
                    label: Text(l10n.t('ticket_qfield_open')),
                  ),
                ),
              ],
            ),
          ),
        ]),
      ],
      if (t.attachmentUrls.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection(l10n.t('requester_attachments'), [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: t.attachmentUrls
                  .map((url) => _buildAttachmentThumbnail(url, l10n))
                  .toList(),
            ),
          ),
        ]),
      ],
      const SizedBox(height: 40),
    ];
  }

  List<Widget> _buildEngineerActions(Ticket t, bool isMyTicket, AppLocalizations l10n) {
    final widgets = <Widget>[];
    final hasActive = context.read<TicketsProvider>().hasActiveTicket;
    final pc = context.read<PrivateCompanyProvider>();
    final maintDispatcherAssign = _maintenanceDispatchAssignEligible(t, pc);

    if (t.canBeAssigned) {
      if (maintDispatcherAssign) {
        widgets.addAll(_maintenanceDispatcherAssignWidgets(t, l10n));
      } else if (hasActive) {
        widgets.add(Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          decoration: BoxDecoration(
            color: const Color(0xFFFBBF24).withAlpha(15),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFFBBF24).withAlpha(40)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline_rounded,
                  color: Color(0xFFFBBF24), size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('complete_before_assign'),
                  style: TextStyle(
                    color: const Color(0xFFFBBF24).withAlpha(220),
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ));
        widgets.add(const SizedBox(height: 12));
      } else {
        widgets.add(_actionButton(
          icon: Icons.person_add_rounded,
          label: l10n.t('assign_to_me'),
          gradient: const [Color(0xFF6C63FF), Color(0xFF5A52E0)],
          loading: _assigning,
          onTap: _assignToMe,
        ));
        widgets.add(const SizedBox(height: 12));
      }
    }

    if (isMyTicket && !t.isCompleted) {
      // Status flow: ON_SITE -> IN_PROGRESS
      if (t.isOnSite) {
        widgets.add(_actionButton(
          icon: Icons.play_arrow_rounded,
          label: l10n.t('start_inspection'),
          gradient: const [Color(0xFF00D4AA), Color(0xFF00B894)],
          loading: _updatingStatus,
          onTap: () => _updateStatus('IN_PROGRESS'),
        ));
        widgets.add(const SizedBox(height: 12));
      }

      // Status stepper
      widgets.add(_buildStatusStepper(t, l10n));
      widgets.add(const SizedBox(height: 16));
    }

    if (t.isCompleted && isMyTicket) {
      widgets.add(Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        decoration: BoxDecoration(
          color: const Color(0xFF4ADE80).withAlpha(15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF4ADE80).withAlpha(40)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_rounded,
                color: Color(0xFF4ADE80), size: 22),
            const SizedBox(width: 10),
            Text(
              l10n.t('ticket_completed'),
              style: TextStyle(
                color: Color(0xFF4ADE80),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ));
      widgets.add(const SizedBox(height: 16));
    }

    return widgets;
  }

  List<Widget> _buildTechnicianActions(Ticket t, bool isMyTicket, AppLocalizations l10n) {
    final widgets = <Widget>[];
    final hasActive = context.read<TicketsProvider>().hasActiveTicket;
    final pc = context.read<PrivateCompanyProvider>();
    final engDispatchPending = _maintenanceEngineerDispatchPending(t, pc);

    if (t.canBeAssigned && !engDispatchPending) {
      if (hasActive) {
        widgets.add(Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          decoration: BoxDecoration(
            color: const Color(0xFFFBBF24).withAlpha(15),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFFBBF24).withAlpha(40)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline_rounded,
                  color: Color(0xFFFBBF24), size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('complete_before_assign'),
                  style: TextStyle(
                    color: const Color(0xFFFBBF24).withAlpha(220),
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ));
      } else {
        widgets.add(_actionButton(
          icon: Icons.person_add_rounded,
          label: l10n.t('assign_to_me'),
          gradient: const [Color(0xFF6C63FF), Color(0xFF5A52E0)],
          loading: _assigning,
          onTap: _assignToMe,
        ));
      }
      widgets.add(const SizedBox(height: 12));
    }

    if (isMyTicket && !t.isCompleted) {
      if (t.isOnSite) {
        widgets.add(_actionButton(
          icon: Icons.play_arrow_rounded,
          label: l10n.t('start_maintenance'),
          gradient: const [Color(0xFF00D4AA), Color(0xFF00B894)],
          loading: _updatingStatus,
          onTap: () => _updateStatus('IN_PROGRESS'),
        ));
        widgets.add(const SizedBox(height: 12));
      }
      widgets.add(_buildStatusStepper(t, l10n));
      widgets.add(const SizedBox(height: 16));
    }

    if (t.isCompleted && isMyTicket) {
      widgets.add(Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        decoration: BoxDecoration(
          color: const Color(0xFF4ADE80).withAlpha(15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF4ADE80).withAlpha(40)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_rounded,
                color: Color(0xFF4ADE80), size: 22),
            const SizedBox(width: 10),
            Text(
              l10n.t('ticket_completed'),
              style: TextStyle(
                color: Color(0xFF4ADE80),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ));
      widgets.add(const SizedBox(height: 16));
    }

    return widgets;
  }

  Widget _cancellationPendingBanner(Ticket t, AppLocalizations l10n) {
    return _glassContainer(
      Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.hourglass_top_rounded, color: Color(0xFFFBBF24), size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l10n.t('ticket_cancellation_pending'),
                    style: const TextStyle(
                      color: Color(0xFFFBBF24),
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
            if (t.cancellationReason != null && t.cancellationReason!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                t.cancellationReason!,
                style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _requesterResubmitBanner(Ticket t, AppLocalizations l10n) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF6C63FF).withAlpha(18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF6C63FF).withAlpha(100)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.t('resubmit_awaiting_requester_title'),
              style: const TextStyle(
                  color: Color(0xFF8B83FF),
                  fontWeight: FontWeight.w700,
                  fontSize: 14)),
          if (t.resubmitReason != null && t.resubmitReason!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(t.resubmitReason!,
                style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 12)),
          ],
        ],
      ),
    );
  }

  Widget _requesterEditAndResubmitActions(Ticket t, AppLocalizations l10n) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _WorkflowActionButton(
            label: l10n.t('resubmit_edit_ticket'),
            icon: Icons.edit_rounded,
            color: const Color(0xFF6C63FF),
            onTap: () => _openRequesterEditDialog(t, l10n),
          ),
          const SizedBox(height: 10),
          _WorkflowActionButton(
            label: l10n.t('resubmit_to_staff'),
            icon: Icons.send_rounded,
            color: const Color(0xFF00D4AA),
            onTap: () async {
              final ok = await context
                  .read<TicketsProvider>()
                  .resubmitTicketToStaff(t.id);
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(ok
                    ? l10n.t('resubmit_sent_to_staff')
                    : l10n.t('action_failed')),
                backgroundColor:
                    ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
              ));
              setState(() => _ticket = null);
              _load();
            },
          ),
        ],
      ),
    );
  }

  Future<void> _openRequesterEditDialog(Ticket t, AppLocalizations l10n) async {
    final siteCtrl = TextEditingController(text: t.siteName ?? '');
    final coordCtrl = TextEditingController(text: t.siteCoordinator ?? '');
    final specCtrl = TextEditingController(text: t.designSpecifications ?? '');
    final maintCtrl = TextEditingController(text: t.maintenanceReason ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(l10n.t('resubmit_edit_ticket'),
            style: const TextStyle(color: Colors.white)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: siteCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(labelText: l10n.t('site_name')),
              ),
              TextField(
                controller: coordCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(labelText: l10n.t('coordinator')),
              ),
              TextField(
                controller: specCtrl,
                style: const TextStyle(color: Colors.white),
                maxLines: 3,
                decoration: InputDecoration(labelText: l10n.t('design_specifications')),
              ),
              if (t.isMaintenance)
                TextField(
                  controller: maintCtrl,
                  style: const TextStyle(color: Colors.white),
                  maxLines: 3,
                  decoration: InputDecoration(labelText: l10n.t('maint_reason')),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(l10n.t('cancel'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.t('submit')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final saved = await context.read<TicketsProvider>().requesterEditTicket(
          t.id,
          siteName: siteCtrl.text,
          siteCoordinator: coordCtrl.text,
          designSpecifications: specCtrl.text,
          maintenanceReason: t.isMaintenance ? maintCtrl.text : null,
        );
    siteCtrl.dispose();
    coordCtrl.dispose();
    specCtrl.dispose();
    maintCtrl.dispose();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(saved ? l10n.t('submit') : l10n.t('action_failed')),
    ));
    setState(() => _ticket = null);
    _load();
  }

  Widget _cancellationRequesterSection(Ticket t, AppLocalizations l10n) {
    return _glassContainer(
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.t('ticket_request_cancellation'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              l10n.t('ticket_request_cancellation_hint'),
              style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12, height: 1.35),
            ),
            const SizedBox(height: 12),
            if (t.effectiveCancellationReasons.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                value: _selectedCancellationReason,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: l10n.t('ticket_cancellation_reason'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
                items: t.effectiveCancellationReasons
                    .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                    .toList(),
                onChanged: (v) => setState(() {
                  _selectedCancellationReason = v;
                  _cancellationReasonCtrl.text = v ?? '';
                }),
              ),
            ] else
              TextField(
                controller: _cancellationReasonCtrl,
                style: const TextStyle(color: Colors.white),
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: l10n.t('ticket_cancellation_reason'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _cancellationBusy
                  ? null
                  : () async {
                      final reason = t.effectiveCancellationReasons.isNotEmpty
                          ? (_selectedCancellationReason ?? '').trim()
                          : _cancellationReasonCtrl.text.trim();
                      if (reason.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(l10n.t('ticket_cancellation_reason'))),
                        );
                        return;
                      }
                      setState(() => _cancellationBusy = true);
                      final ok = await context
                          .read<TicketsProvider>()
                          .requestTicketCancellation(widget.ticketId, reason);
                      if (!mounted) return;
                      setState(() => _cancellationBusy = false);
                      if (ok) {
                        _cancellationReasonCtrl.clear();
                        await _load();
                      }
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            ok
                                ? l10n.t('ticket_cancellation_pending')
                                : l10n.t('complete_failed'),
                          ),
                        ),
                      );
                    },
              icon: _cancellationBusy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.cancel_schedule_send_rounded),
              label: Text(l10n.t('ticket_request_cancellation')),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF9F43),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cancellationStaffSection(Ticket t, AppLocalizations l10n) {
    return _glassContainer(
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.t('ticket_cancellation_staff_title'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (t.cancellationReason != null && t.cancellationReason!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                t.cancellationReason!,
                style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13, height: 1.35),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _cancellationBusy
                        ? null
                        : () async {
                            setState(() => _cancellationBusy = true);
                            final res = await context
                                .read<TicketsProvider>()
                                .respondTicketCancellation(widget.ticketId, 'approve');
                            if (!mounted) return;
                            setState(() => _cancellationBusy = false);
                            if (res.ok) await _load();
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  res.ok
                                      ? l10n.t('section_cancelled')
                                      : (res.message ?? l10n.t('complete_failed')),
                                ),
                              ),
                            );
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF87171),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(l10n.t('ticket_cancellation_approve')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _cancellationBusy
                        ? null
                        : () => _promptRejectCancellationRequest(t, l10n),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFFBBF24),
                      side: const BorderSide(color: Color(0xFFFBBF24)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(l10n.t('ticket_cancellation_reject')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _promptRejectCancellationRequest(Ticket t, AppLocalizations l10n) async {
    final ctrl = TextEditingController();
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('ticket_cancellation_reject'),
          style: const TextStyle(color: Colors.white),
        ),
        content: TextField(
          controller: ctrl,
          style: const TextStyle(color: Colors.white),
          maxLines: 3,
          decoration: InputDecoration(
            labelText: l10n.t('ticket_cancellation_reject_reason'),
            labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.t('ticket_cancellation_reject')),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    setState(() => _cancellationBusy = true);
    final res = await context.read<TicketsProvider>().respondTicketCancellation(
          widget.ticketId,
          'reject',
          rejectionReason: ctrl.text.trim(),
        );
    ctrl.dispose();
    if (!mounted) return;
    setState(() => _cancellationBusy = false);
    if (res.ok) await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res.ok ? l10n.t('ticket_cancellation_reject') : (res.message ?? l10n.t('complete_failed'))),
      ),
    );
  }

  Widget _maintenanceRequesterConfirmCard(Ticket t, AppLocalizations l10n) {
    return _glassContainer(
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.t('maint_await_requester_title'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.t('maint_sent_for_confirmation'),
              style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13, height: 1.35),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _confirmingMaintenance ? null : () => _confirmMaintenanceByRequester(l10n),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00D4AA),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: _confirmingMaintenance
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(l10n.t('maint_confirm_requester_btn')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _confirmingMaintenance ? null : () => _promptRejectMaintenanceByRequester(l10n),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFFF9F43),
                      side: const BorderSide(color: Color(0xFFFF9F43)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(l10n.t('maint_reject_requester_btn')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmMaintenanceByRequester(AppLocalizations l10n) async {
    setState(() => _confirmingMaintenance = true);
    final ok = await context.read<TicketsProvider>().confirmMaintenanceRequesterCompletion(widget.ticketId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? l10n.t('ticket_completed') : l10n.t('complete_failed')),
        backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    if (ok) await _load();
    setState(() => _confirmingMaintenance = false);
  }

  Future<void> _promptRejectMaintenanceByRequester(AppLocalizations l10n) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(l10n.t('maint_reject_requester_btn'), style: const TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: l10n.t('maint_reject_reason_label'),
            hintStyle: TextStyle(color: Colors.white.withAlpha(120)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.t('cancel'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: Text(l10n.t('maint_reject_requester_btn')),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (!mounted) return;
    if (reason == null || reason.length < 3) return;
    setState(() => _confirmingMaintenance = true);
    final ok = await context.read<TicketsProvider>().rejectMaintenanceRequesterCompletion(widget.ticketId, reason);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? l10n.t('site_save') : l10n.t('complete_failed')),
        backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    if (ok) await _load();
    setState(() => _confirmingMaintenance = false);
  }

  Widget _maintenanceCompleteSection(Ticket t, AppLocalizations l10n) {
    const minImages = 4;
    const maxImages = 6;
    final beforeOk = _maintenanceBeforeUrls.length >= minImages && _maintenanceBeforeUrls.length <= maxImages;
    final afterOk = _maintenanceAfterUrls.length >= minImages && _maintenanceAfterUrls.length <= maxImages;
    final canComplete = beforeOk && afterOk;
    final hasRequester = (t.requesterId ?? '').trim().isNotEmpty;
    final awaiting = t.maintenanceAwaitingRequesterConfirmation;
    final reject = (t.maintenanceRequesterRejectReason ?? '').trim();

    return _glassContainer(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Text(
              l10n.t('maint_complete_title'),
              style: TextStyle(
                color: Colors.white.withAlpha(100),
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
          ),
          if (reject.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF9F43).withAlpha(28),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFF9F43).withAlpha(90)),
                ),
                child: Text(
                  l10n.t('maint_rejection_note', {'reason': reject}),
                  style: const TextStyle(color: Color(0xFFFF9F43), fontSize: 13, height: 1.35),
                ),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              l10n.t('maint_complete_hint'),
              style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12),
            ),
          ),
          const SizedBox(height: 12),
          _maintImageRow(l10n.t('before_photos'), _maintenanceBeforeUrls, true, minImages, maxImages, locked: awaiting),
          const SizedBox(height: 12),
          _maintImageRow(l10n.t('after_photos'), _maintenanceAfterUrls, false, minImages, maxImages, locked: awaiting),
          const SizedBox(height: 16),
          if (awaiting)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                l10n.t('maint_waiting_requester'),
                style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 13, fontWeight: FontWeight.w600),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: canComplete && !_completingMaintenance ? () => _completeMaintenance(l10n) : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D4AA),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _completingMaintenance
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        hasRequester ? l10n.t('maint_complete_send_confirm') : l10n.t('complete_ticket'),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _maintImageRow(String label, List<String> urls, bool isBefore, int min, int max, {bool locked = false}) {
    final count = urls.length;
    final valid = count >= min && count <= max;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(width: 8),
            Text(
              '($count/$min–$max)',
              style: TextStyle(
                color: valid ? const Color(0xFF00D4AA) : const Color(0xFFFBBF24),
                fontSize: 12,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 90,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              ...urls.asMap().entries.map((e) => _maintThumb(e.value, isBefore, e.key, locked: locked)),
              if (count < max && !_uploading && !locked)
                GestureDetector(
                  onTap: () => _pickAndAddMaintenanceImage(isBefore),
                  child: Container(
                    width: 80,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(8),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withAlpha(20)),
                    ),
                    child: const Icon(Icons.add_photo_alternate_rounded, color: Color(0xFF6C63FF), size: 28),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _maintThumb(String url, bool isBefore, int index, {bool locked = false}) {
    return Stack(
      children: [
        Container(
          width: 80,
          margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(11),
            child: Image.network(
              url,
              fit: BoxFit.cover,
              width: 80,
              height: 90,
              errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, color: Color(0xFF4B5563)),
            ),
          ),
        ),
        if (!locked)
          Positioned(
            top: 4,
            right: 12,
            child: GestureDetector(
              onTap: () {
                setState(() {
                  if (isBefore) {
                    _maintenanceBeforeUrls.removeAt(index);
                  } else {
                    _maintenanceAfterUrls.removeAt(index);
                  }
                });
              },
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(color: Color(0xFFFF4757), shape: BoxShape.circle),
                child: const Icon(Icons.close, color: Colors.white, size: 12),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _pickAndAddMaintenanceImage(bool isBefore) async {
    setState(() => _uploading = true);
    try {
      final XFile? file = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 75,
      );
      if (file == null || !mounted) return;
      final provider = context.read<TicketsProvider>();
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) return;
      final filename = 'maint_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final url = await provider.uploadFileFromBytes(bytes, filename);
      if (url != null && mounted) {
        setState(() {
          if (isBefore) {
            if (_maintenanceBeforeUrls.length < 6) _maintenanceBeforeUrls.add(url);
          } else {
            if (_maintenanceAfterUrls.length < 6) _maintenanceAfterUrls.add(url);
          }
        });
      } else if (mounted) {
        _showUploadError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (e) {
      if (mounted) _showUploadError(AppLocalizations.of(context).t('upload_failed'));
    }
    if (mounted) setState(() => _uploading = false);
  }

  Future<void> _completeMaintenance(AppLocalizations l10n) async {
    setState(() => _completingMaintenance = true);
    try {
      final r = await context.read<TicketsProvider>().completeTicket(
        widget.ticketId,
        null,
        beforeImageUrls: _maintenanceBeforeUrls,
        finishingImageUrls: _maintenanceAfterUrls,
      );
      if (!mounted) return;
      if (r.success) {
        final msg = r.awaitingRequesterConfirmation
            ? l10n.t('maint_sent_for_confirmation')
            : l10n.t('ticket_completed');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('complete_failed')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('complete_failed')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _completingMaintenance = false);
    }
  }

  Widget _buildStatusStepper(Ticket t, AppLocalizations l10n) {
    final steps = ['PENDING', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED'];
    final currentIdx =
        steps.indexOf(t.status.toUpperCase()).clamp(0, steps.length - 1);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withAlpha(10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.t('ticket_progress'),
            style: TextStyle(
              color: Colors.white.withAlpha(100),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: List.generate(steps.length * 2 - 1, (i) {
              if (i.isOdd) {
                final stepIdx = i ~/ 2;
                final done = stepIdx < currentIdx;
                return Expanded(
                  child: Container(
                    height: 3,
                    color: done
                        ? const Color(0xFF00D4AA)
                        : Colors.white.withAlpha(15),
                  ),
                );
              }
              final stepIdx = i ~/ 2;
              final done = stepIdx <= currentIdx;
              final isCurrent = stepIdx == currentIdx;
              final color = done
                  ? _statusColorForStep(steps[stepIdx])
                  : Colors.white.withAlpha(30);

              return Container(
                width: isCurrent ? 32 : 24,
                height: isCurrent ? 32 : 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? color : Colors.transparent,
                  border: Border.all(
                    color: color,
                    width: isCurrent ? 3 : 2,
                  ),
                  boxShadow: isCurrent
                      ? [
                          BoxShadow(
                              color: color.withAlpha(80), blurRadius: 12)
                        ]
                      : null,
                ),
                child: done
                    ? Icon(
                        stepIdx < currentIdx
                            ? Icons.check
                            : _stepIcon(steps[stepIdx]),
                        color: Colors.white,
                        size: isCurrent ? 16 : 12,
                      )
                    : null,
              );
            }),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: steps.map((s) {
              final idx = steps.indexOf(s);
              final isCurrent = idx == currentIdx;
              return Text(
                _statusLabel(s, l10n),
                style: TextStyle(
                  color: isCurrent
                      ? Colors.white
                      : Colors.white.withAlpha(60),
                  fontSize: 9,
                  fontWeight:
                      isCurrent ? FontWeight.w700 : FontWeight.w500,
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  IconData _stepIcon(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return Icons.schedule;
      case 'ON_SITE':
        return Icons.location_on;
      case 'IN_PROGRESS':
        return Icons.construction;
      case 'COMPLETED':
        return Icons.check_circle;
      default:
        return Icons.circle;
    }
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required List<Color> gradient,
    required bool loading,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: gradient),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: gradient.first.withAlpha(60),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (loading)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            else ...[
              Icon(icon, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _maintenanceEvidenceSections(Ticket t, AppLocalizations l10n) {
    Widget strip(List<String> urls) {
      if (urls.isEmpty) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: Text(
            l10n.t('maint_evidence_none'),
            style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
          ),
        );
      }
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children:
              urls.map((url) => _buildAttachmentThumbnail(url, l10n)).toList(),
        ),
      );
    }

    return [
      _glassSection(l10n.t('maint_evidence_before'), [strip(t.beforeImageUrls)]),
      const SizedBox(height: 12),
      _glassSection(l10n.t('maint_evidence_after'), [strip(t.finishingImageUrls)]),
    ];
  }

  Future<void> _openUseMaterialFromMyAssignment(Ticket t) async {
    final l10n = AppLocalizations.of(context);
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final pools = await wh.fetchMyHeldMaterials();
    if (!mounted) return;
    if (pools.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('maint_no_assigned_materials'))),
      );
      return;
    }
    final maxH = MediaQuery.of(context).size.height * 0.55;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: SizedBox(
            height: maxH,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Text(
                    l10n.t('maint_use_material_title'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'Totals combine every line you hold (e.g. 4 × 1000 m = 4000 m). Enter meters used per site; the rest stays on your stock.',
                    style: TextStyle(
                      color: Colors.white.withAlpha(140),
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: pools.length,
                    itemBuilder: (_, i) {
                      final pool = pools[i];
                      final unit = pool.unit?.trim();
                      final unitSuffix =
                          unit != null && unit.isNotEmpty ? ' $unit' : '';
                      return ListTile(
                        title: Text(pool.name,
                            style: const TextStyle(color: Colors.white)),
                        subtitle: Text(
                          '${pool.lineCount} line(s) · ${pool.totalQuantity}$unitSuffix held',
                          style: TextStyle(color: Colors.white.withAlpha(140)),
                        ),
                        onTap: () {
                          Navigator.pop(ctx);
                          _promptUseMaterialOnTicket(t, pool: pool);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _promptUseMaterialOnTicket(
    Ticket t, {
    HeldMaterialPool? pool,
    WarehouseItem? item,
  }) async {
    final l10n = AppLocalizations.of(context);
    final pc = context.read<PrivateCompanyProvider>();
    final reasons = pc.workspace?.materialUseReasons ?? const <String>[];
    final noteCtrl = TextEditingController();
    final qtyCtrl = TextEditingController();
    String? picked = reasons.length == 1 ? reasons.first : null;

    final materialName =
        pool?.name ?? item?.materialName ?? 'Material';
    final unit = pool?.unit ?? item?.materialUnit;
    final unitSuffix = unit != null && unit.trim().isNotEmpty ? ' ${unit.trim()}' : '';
    final totalHeld = pool?.totalQuantity ?? item?.quantity ?? 1;
    final partial = pool?.partialConsumption ?? item?.supportsPartialConsumption ?? false;
    if (partial) {
      qtyCtrl.text = '1';
    }

    final res = await showDialog<Map<String, dynamic>?>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              backgroundColor: const Color(0xFF12122A),
              title: Text(
                l10n.t('maint_use_material_title'),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 17,
                ),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      pool != null
                          ? '$materialName — $totalHeld$unitSuffix held (${pool.lineCount} line(s))'
                          : '$materialName — ${item!.serialNumber} ×${item.quantity}$unitSuffix',
                      style:
                          TextStyle(color: Colors.white.withAlpha(200), fontSize: 14),
                    ),
                    if (partial) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: qtyCtrl,
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Quantity to use$unitSuffix',
                          helperText: 'Max $totalHeld$unitSuffix — remainder stays on your stock',
                          helperStyle: TextStyle(color: Colors.white.withAlpha(120)),
                          labelStyle:
                              TextStyle(color: Colors.white.withAlpha(180)),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide:
                                BorderSide(color: Colors.white.withAlpha(40)),
                          ),
                          focusedBorder: const OutlineInputBorder(
                            borderRadius: BorderRadius.all(Radius.circular(10)),
                            borderSide: BorderSide(color: Color(0xFF6C63FF)),
                          ),
                        ),
                      ),
                    ],
                    if (reasons.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        value: picked != null && reasons.contains(picked)
                            ? picked
                            : null,
                        decoration: InputDecoration(
                          labelText: l10n.t('maint_material_reason_label'),
                          labelStyle:
                              TextStyle(color: Colors.white.withAlpha(180)),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide:
                                BorderSide(color: Colors.white.withAlpha(40)),
                          ),
                          focusedBorder: const OutlineInputBorder(
                            borderRadius: BorderRadius.all(Radius.circular(10)),
                            borderSide: BorderSide(color: Color(0xFF6C63FF)),
                          ),
                        ),
                        dropdownColor: const Color(0xFF1e1e36),
                        style: const TextStyle(color: Colors.white),
                        items: reasons
                            .map((r) =>
                                DropdownMenuItem(value: r, child: Text(r)))
                            .toList(),
                        onChanged: (v) => setLocal(() => picked = v),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: noteCtrl,
                      style: const TextStyle(color: Colors.white),
                      maxLines: 2,
                      decoration: InputDecoration(
                        labelText: l10n.t('maint_material_optional_note'),
                        labelStyle:
                            TextStyle(color: Colors.white.withAlpha(160)),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              BorderSide(color: Colors.white.withAlpha(40)),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(10)),
                          borderSide: BorderSide(color: Color(0xFF6C63FF)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(l10n.t('cancel')),
                ),
                FilledButton(
                  onPressed: () {
                    if (reasons.isNotEmpty &&
                        (picked == null || picked!.trim().isEmpty)) {
                      return;
                    }
                    int? useQty;
                    if (partial) {
                      useQty = int.tryParse(qtyCtrl.text.trim());
                      if (useQty == null || useQty < 1 || useQty > totalHeld) {
                        return;
                      }
                    }
                    Navigator.pop(ctx, {
                      'useReason': picked?.trim(),
                      'note': noteCtrl.text.trim(),
                      if (useQty != null) 'quantity': useQty,
                    });
                  },
                  child: Text(l10n.t('submit')),
                ),
              ],
            );
          },
        );
      },
    );
    noteCtrl.dispose();
    qtyCtrl.dispose();
    if (res == null || !mounted) return;
    final useReason = res['useReason'] as String?;
    final note = res['note'] as String?;
    final useQty = res['quantity'] as int?;
    if (reasons.isNotEmpty && (useReason == null || useReason.isEmpty)) {
      return;
    }

    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final bool success;
    if (pool != null) {
      success = await wh.consumeMaterialOnTicket(
        materialId: pool.materialId,
        ticketId: t.id,
        quantity: useQty ?? totalHeld,
        useReason: useReason?.isNotEmpty == true ? useReason : null,
        note: note?.isNotEmpty == true ? note : null,
      );
    } else if (item != null) {
      success = await wh.useOnTicket(
        item.id,
        t.id,
        useReason: useReason?.isNotEmpty == true ? useReason : null,
        note: note?.isNotEmpty == true ? note : null,
        quantity: useQty,
      );
    } else {
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? l10n.t('maint_material_use_recorded')
              : (wh.error ?? l10n.t('maint_material_use_failed')),
        ),
      ),
    );
    if (success) {
      wh.resetFilters();
      await wh.refreshItems();
      await _loadTicketWarehouseSummary();
    }
  }

  Widget _glassContainer(Widget child) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withAlpha(10)),
          ),
          child: child,
        ),
      ),
    );
  }

  Widget _glassSection(String title, List<Widget> children) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withAlpha(10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Text(
                  title.toUpperCase(),
                  style: TextStyle(
                    color: Colors.white.withAlpha(100),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              ...children,
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                  color: Colors.white.withAlpha(80), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _rowWithCopy(String label, String value, AppLocalizations l10n) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                  color: Colors.white.withAlpha(80), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500),
            ),
          ),
          InkWell(
            onTap: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(l10n.t('id_copied')),
                  backgroundColor: const Color(0xFF00D4AA),
                  behavior: SnackBarBehavior.floating,
                  duration: const Duration(seconds: 1),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              );
            },
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF6C63FF).withAlpha(30),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: const Color(0xFF6C63FF).withAlpha(60)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.copy_rounded,
                      size: 16, color: Colors.white.withAlpha(200)),
                  const SizedBox(width: 6),
                  Text(
                    l10n.t('copy'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _roleLabel(String role, AppLocalizations l10n) {
    switch (role.toUpperCase()) {
      case 'ENGINEER':
        return l10n.t('role_engineer');
      case 'COMPANY':
        return l10n.t('role_company');
      case 'TECHNICIAN':
        return l10n.t('role_technician');
      case 'WORKER':
        return l10n.t('role_worker');
      default:
        return role;
    }
  }

  Future<void> _callPhone(String phone) async {
    final cleaned = phone.replaceAll(RegExp(r'[\s\-\(\)]'), '');
    final uri = Uri.parse('tel:$cleaned');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (mounted) {
      await Clipboard.setData(ClipboardData(text: phone));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).t('phone_copied')),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Widget _conflictRecordSection(Ticket t, AppLocalizations l10n) {
    final isPending = (t.conflictStatus ?? '').toLowerCase() == 'pending';
    final sectionTitle = isPending
        ? l10n.t('conflict_cases')
        : l10n.t('previous_conflict');
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ConflictDetailScreen(conflictId: t.id),
        ),
      ),
      child: _glassSection(sectionTitle, [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isPending ? Icons.schedule_rounded : Icons.check_circle_rounded,
                    size: 20,
                    color: isPending
                        ? const Color(0xFFFBBF24)
                        : const Color(0xFF00D4AA),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    isPending
                        ? l10n.t('ncr_waiting_manager')
                        : l10n.t('resolved'),
                    style: TextStyle(
                      color: isPending
                          ? const Color(0xFFFBBF24)
                          : const Color(0xFF00D4AA),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.arrow_forward_ios_rounded,
                    size: 12,
                    color: Colors.white.withAlpha(100),
                  ),
                ],
              ),
              if (t.conflictReportComment != null &&
                  t.conflictReportComment!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  t.conflictReportComment!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withAlpha(180),
                    fontSize: 13,
                  ),
                ),
              ],
              if (!isPending && t.conflictResolution != null) ...[
                const SizedBox(height: 6),
                Text(
                  _conflictResolutionLabel(t.conflictResolution!, l10n),
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Text(
                l10n.t('tap_to_view_details'),
                style: TextStyle(
                  color: Colors.white.withAlpha(100),
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }

  String _conflictResolutionLabel(String r, AppLocalizations l10n) {
    final lower = r.toLowerCase();
    if (lower == 're_inspection') return l10n.t('resolution_re_inspection');
    if (lower == 'keep_same') return l10n.t('resolution_keep_same');
    if (lower == 'accepted') return '${l10n.t('resolution_changed_to')} ${l10n.t('accepted')}';
    if (lower == 'not_accepted') return '${l10n.t('resolution_changed_to')} ${l10n.t('not_accepted')}';
    if (lower == 'ncr') return '${l10n.t('resolution_changed_to')} ${l10n.t('ncr')}';
    if (lower == 'accepted_with_comments') return '${l10n.t('resolution_changed_to')} ${l10n.t('accepted_with_comments')}';
    return r;
  }

  Widget _conflictButton(Ticket t, AppLocalizations l10n) {
    return GestureDetector(
      onTap: () => _reportConflict(t, l10n),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        decoration: BoxDecoration(
          color: const Color(0xFFFBBF24).withAlpha(15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFFBBF24).withAlpha(50)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.max,
          children: [
            const Icon(Icons.report_problem_rounded,
                color: Color(0xFFFBBF24), size: 22),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                l10n.t('report_conflict'),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFFFBBF24),
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _reportConflict(Ticket t, AppLocalizations l10n) async {
    final commentController = TextEditingController();
    final result = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('report_conflict'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('report_conflict_confirm'),
                style: TextStyle(color: Colors.white.withAlpha(200)),
              ),
              const SizedBox(height: 16),
              Text(
                l10n.t('conflict_description_hint'),
                style: TextStyle(
                  color: Colors.white.withAlpha(150),
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: commentController,
                maxLines: 4,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('conflict_description'),
                  hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
                  filled: true,
                  fillColor: Colors.white.withAlpha(8),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, commentController.text.trim()),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFBBF24),
              foregroundColor: const Color(0xFF05051A),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(l10n.t('report_conflict')),
          ),
        ],
      ),
    );
    if (result == null || !mounted) return;

    final conflictProv = context.read<ConflictsProvider>();
    final conflict = await conflictProv.reportConflict(t.id,
        comment: result.isEmpty ? null : result);
    if (mounted) {
      if (conflict != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('conflict_reported')),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ConflictDetailScreen(conflictId: conflict.id),
        ));
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('conflict_report_failed')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Widget _ncrResubmitRecordsSection(Ticket t, AppLocalizations l10n) {
    return _glassSection(l10n.t('ncr_resubmit_records'), [
      ...t.ncrResubmissions.asMap().entries.map((entry) {
        final i = entry.key + 1;
        final r = entry.value;
        final roleLabel = r.by == 'requester'
            ? l10n.t('requester')
            : (r.by == 'engineer' ? l10n.t('engineer') : r.by);
        final actionLabel = r.action == 'resubmit'
            ? l10n.t('resubmit')
            : (r.action == 'resubmit_for_edit'
                ? l10n.t('admin_resubmit_for_edit')
                : (r.action == 'approved'
                    ? l10n.t('ncr_approved')
                    : (r.action == 'rework' ? l10n.t('ncr_rework') : r.action)));
        final dateStr = r.at.isNotEmpty
            ? _formatDateShort(DateTime.tryParse(r.at) ?? DateTime.now())
            : '';
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(5),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withAlpha(10)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6C63FF).withAlpha(25),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '#$i',
                        style: const TextStyle(
                          color: Color(0xFF8B83FF),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      dateStr,
                      style: TextStyle(
                        color: Colors.white.withAlpha(120),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: (r.action == 'approved'
                                ? const Color(0xFF00D4AA)
                                : r.action == 'rework'
                                    ? const Color(0xFFFBBF24)
                                    : const Color(0xFF6C63FF))
                            .withAlpha(30),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        actionLabel,
                        style: TextStyle(
                          color: r.action == 'approved'
                              ? const Color(0xFF00D4AA)
                              : r.action == 'rework'
                                  ? const Color(0xFFFBBF24)
                                  : const Color(0xFF8B83FF),
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.t('ncr_record_by', {'role': roleLabel}),
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 12,
                  ),
                ),
                if (r.comment != null && r.comment!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    r.comment!,
                    style: TextStyle(
                      color: Colors.white.withAlpha(180),
                      fontSize: 13,
                    ),
                  ),
                ],
                if (r.imageUrls.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: r.imageUrls
                        .map((url) => _buildAttachmentThumbnail(url, l10n))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        );
      }),
    ]);
  }

  Widget _ncrSection(Ticket t, AppLocalizations l10n) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x30FF4757)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF4757).withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.warning_rounded,
                      color: Color(0xFFFF6B81), size: 16),
                ),
                const SizedBox(width: 8),
                Text(
                  l10n.t('ncr_report'),
                  style: TextStyle(
                    color: Color(0xFFFF6B81),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (t.ncrReason != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                t.ncrReason!,
                style: TextStyle(
                    color: Colors.white.withAlpha(150), fontSize: 13),
              ),
            ),
          if (t.ncrResubmissions.isNotEmpty) ...[
            const Divider(color: Color(0x10FFFFFF), height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                l10n.t('resubmissions', {'count': '${t.ncrResubmissions.length}'}),
                style: TextStyle(
                    color: Colors.white.withAlpha(80),
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
            ),
            ...t.ncrResubmissions.map((r) => Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        r.by == 'admin'
                            ? Icons.admin_panel_settings
                            : Icons.person,
                        size: 14,
                        color: Colors.white.withAlpha(60),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${r.action} - ${r.comment ?? l10n.t('no_comment')}',
                          style: TextStyle(
                              color: Colors.white.withAlpha(120),
                              fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                )),
          ],
          Padding(
            padding: const EdgeInsets.all(16),
            child: t.hasPendingEngineerNcrResponse
                ? Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF).withAlpha(20),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: const Color(0xFF6C63FF).withAlpha(50),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.schedule_rounded,
                          size: 20,
                          color: Colors.white.withAlpha(200),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          l10n.t('ncr_waiting_manager'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(200),
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  )
                : SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        final result = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (_) =>
                                NcrResubmitScreen(ticketId: t.id),
                          ),
                        );
                        if (result == true) _load();
                      },
                      icon: const Icon(Icons.reply_rounded, size: 18),
                      label: Text(l10n.t('resubmit'),
                          style: TextStyle(fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFF4757),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _ncrEngineerResponseSection(Ticket t, AppLocalizations l10n) {
    return StatefulBuilder(
      builder: (context, setState) {
        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0x3000D4AA)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF00D4AA).withAlpha(20),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.reply_all_rounded,
                          color: Color(0xFF00D4AA), size: 16),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      l10n.t('ncr_resubmitted_from_requester'),
                      style: const TextStyle(
                        color: Color(0xFF00D4AA),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Text(
                  l10n.t('ncr_engineer_response_hint'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 12,
                  ),
                ),
              ),
              if (t.hasPendingEngineerNcrResponse &&
                  t.ncrResubmissions.isNotEmpty) ...[
                _resubmittedAttachmentsSection(t.ncrResubmissions.last, l10n),
                const SizedBox(height: 12),
              ],
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final ticketsProvider = context.read<TicketsProvider>();
                          final messenger = ScaffoldMessenger.of(context);
                          final comment = await _showNcrReworkDialog(l10n);
                          if (comment == null || !mounted) return;
                          final ok = await ticketsProvider
                              .submitNcrEngineerResponse(t.id, 'rework',
                                  comment: comment);
                          if (mounted) {
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(ok
                                    ? l10n.t('ncr_rework_sent')
                                    : l10n.t('submit_failed')),
                                backgroundColor: ok
                                    ? const Color(0xFF00D4AA)
                                    : const Color(0xFFFF4757),
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12)),
                              ),
                            );
                            if (ok) _load();
                          }
                        },
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: Text(l10n.t('ncr_rework')),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFFBBF24),
                          side: const BorderSide(color: Color(0xFFFBBF24)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          final ticketsProvider = context.read<TicketsProvider>();
                          final messenger = ScaffoldMessenger.of(context);
                          final ok = await ticketsProvider
                              .submitNcrEngineerResponse(t.id, 'approved');
                          if (mounted) {
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(ok
                                    ? l10n.t('ncr_approved_reinspect')
                                    : l10n.t('submit_failed')),
                                backgroundColor: ok
                                    ? const Color(0xFF00D4AA)
                                    : const Color(0xFFFF4757),
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12)),
                              ),
                            );
                            if (ok) _load();
                          }
                        },
                        icon: const Icon(Icons.check_circle_outline, size: 16),
                        label: Text(l10n.t('ncr_approved')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF00D4AA),
                          foregroundColor: Colors.black87,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _resubmittedAttachmentsSection(NcrResubmission r, AppLocalizations l10n) {
    if (r.imageUrls.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.t('resubmitted_evidence'),
            style: TextStyle(
              color: Colors.white.withAlpha(140),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: r.imageUrls.asMap().entries.map((e) {
              final url = e.value;
              return _buildAttachmentThumbnail(url, l10n);
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachmentThumbnail(String url, AppLocalizations l10n) {
    final displayUrl = url.startsWith('http')
        ? url
        : (url.startsWith('/') ? '${ApiConfig.baseUrl}$url' : '${ApiConfig.baseUrl}/$url');
    final isImage = url.toLowerCase().contains('image') ||
        RegExp(r'\.(jpe?g|png|gif|webp)$').hasMatch(url);
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AttachmentViewerScreen(
            url: url,
            label: url.split('/').last,
          ),
        ),
      ),
      child: Container(
        width: 80,
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF00D4AA).withAlpha(60)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
              child: SizedBox(
                width: 80,
                height: 64,
                child: isImage
                    ? Image.network(
                        displayUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: const Color(0xFF0A0A1F),
                          child: Icon(Icons.broken_image,
                              color: Colors.white.withAlpha(100)),
                        ),
                      )
                    : Container(
                        color: const Color(0xFF0A0A1F),
                        child: Icon(Icons.insert_photo,
                            color: _accentColor, size: 28),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Text(
                url.split('/').last,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 10,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Generic text-prompt dialog — returns the entered string or null if cancelled.
  Future<String?> _promptReason(
    BuildContext ctx,
    String title,
    String hint,
    AppLocalizations l10n, {
    List<String> presetReasons = const [],
  }) async {
    if (presetReasons.isNotEmpty) {
      String? selected;
      final result = await showDialog<String>(
        context: ctx,
        builder: (dialogCtx) => StatefulBuilder(
          builder: (dialogCtx, setLocal) => AlertDialog(
            backgroundColor: const Color(0xFF12122A),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(title,
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            content: DropdownButtonFormField<String>(
              value: selected,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: hint,
                labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
              ),
              items: presetReasons
                  .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                  .toList(),
              onChanged: (v) => setLocal(() => selected = v),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogCtx),
                child: Text(l10n.t('cancel'),
                    style: TextStyle(color: Colors.white.withAlpha(120))),
              ),
              ElevatedButton(
                onPressed: selected == null || selected!.isEmpty
                    ? null
                    : () => Navigator.pop(dialogCtx, selected),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  foregroundColor: Colors.white,
                ),
                child: Text(l10n.t('submit')),
              ),
            ],
          ),
        ),
      );
      return result;
    }

    final ctrl = TextEditingController();
    final result = await showDialog<String>(
      context: ctx,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(title,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          autofocus: true,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
            border: const UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.white24),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogCtx, ctrl.text.trim()),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(l10n.t('submit')),
          ),
        ],
      ),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => ctrl.dispose());
    return result;
  }

  Future<String?> _showNcrReworkDialog(AppLocalizations l10n) async {
    final ctrl = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('ncr_rework'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            hintText: l10n.t('ncr_rework_comment_hint'),
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            filled: true,
            fillColor: const Color(0xFF0A0A1F),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFBBF24),
              foregroundColor: Colors.black87,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(l10n.t('submit')),
          ),
        ],
      ),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => ctrl.dispose());
    return result;
  }

  Future<void> _openTicketWarehouseMaterialRequest() async {
    final t = _ticket;
    if (t == null || !mounted) return;
    final pc = context.read<PrivateCompanyProvider>();
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    if (!pc.hasWorkspace || !pc.isApproved) return;
    await wh.refreshMaterials();
    if (!mounted) return;
    if (wh.materials.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No catalog materials yet — add materials in Company → Warehouse first.')),
      );
      return;
    }
    final qtyCtrl = TextEditingController(text: '1');
    final notesCtrl = TextEditingController();
    final result = await showDialog<String?>(
      context: context,
      builder: (ctx) {
        String? pickedId = wh.materials.first.id;
        return StatefulBuilder(
          builder: (ctx, setLocal) => AlertDialog(
            backgroundColor: const Color(0xFF12122A),
            title: const Text('Request material from warehouse', style: TextStyle(color: Colors.white)),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Ticket: ${t.siteName ?? t.id}',
                    style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: pickedId,
                    dropdownColor: const Color(0xFF1A1A35),
                    decoration: InputDecoration(
                      labelText: 'Catalog material',
                      labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                    ),
                    items: wh.materials
                        .map(
                          (m) => DropdownMenuItem(
                            value: m.id,
                            child: Text(m.name, style: const TextStyle(color: Colors.white)),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setLocal(() => pickedId = v),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: qtyCtrl,
                    keyboardType: TextInputType.number,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Quantity',
                      labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: notesCtrl,
                    maxLines: 2,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Notes (optional)',
                      labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, null), child: const Text('Cancel')),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, pickedId),
                child: const Text('Submit'),
              ),
            ],
          ),
        );
      },
    );
    final materialId = result;
    final qty = int.tryParse(qtyCtrl.text.trim()) ?? 1;
    final notesText = notesCtrl.text.trim();
    qtyCtrl.dispose();
    notesCtrl.dispose();
    if (materialId == null || materialId.isEmpty) return;
    if (!mounted) return;
    final submitted = await wh.createMaterialRequest(
      kind: 'INVENTORY_MATERIAL',
      materialId: materialId,
      quantity: qty < 1 ? 1 : qty,
      notes: notesText.isEmpty ? 'From ticket ${t.siteName ?? t.id}' : '$notesText · Ticket ${t.siteName ?? t.id}',
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(submitted ? 'Request submitted.' : (wh.error ?? 'Request failed.'))),
    );
    if (submitted) await _loadTicketWarehouseSummary();
  }

  Widget _ticketWarehouseMaterialsBlock() {
    final m = _ticketMaterialsSummary;
    if (m == null || m['success'] != true) return const SizedBox.shrink();
    final totals = m['totals'] as Map<String, dynamic>? ?? {};
    final usedItems = (m['usedItems'] as List?) ?? const [];
    final movements = (m['movements'] as List?) ?? const [];
    final usedRows = (totals['usedItemRows'] as num?)?.toInt() ?? 0;
    final usedUnits = (totals['usedUnits'] as num?)?.toInt() ?? 0;
    final damaged = (totals['damagedUnits'] as num?)?.toInt() ?? 0;
    final lost = (totals['lostUnits'] as num?)?.toInt() ?? 0;
    final returned = (totals['returnedUnits'] as num?)?.toInt() ?? 0;
    final pc = context.watch<PrivateCompanyProvider>();
    final auth = context.watch<AuthProvider>();
    final l10n = AppLocalizations.of(context);
    final t = _ticket;
    final canRequestMaterials = pc.hasWorkspace &&
        pc.isApproved &&
        (auth.isEngineer || auth.isTechnician);
    final canUseFromAssignment = t != null &&
        t.isMaintenance &&
        !t.isCompleted &&
        pc.hasWorkspace &&
        pc.isApproved &&
        pc.canRecordWarehouseMaterialOnTicket;
    return _glassSection(l10n.t('pc_ticket_workspace_materials'), [
      if (canRequestMaterials || canUseFromAssignment)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (canRequestMaterials)
                OutlinedButton.icon(
                  onPressed: _openTicketWarehouseMaterialRequest,
                  icon: const Icon(Icons.inventory_2_outlined,
                      size: 18, color: Color(0xFF6C63FF)),
                  label: Text(l10n.t('maint_request_warehouse_material')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF8B83FF),
                    side: const BorderSide(color: Color(0xFF6C63FF)),
                  ),
                ),
              if (canUseFromAssignment)
                OutlinedButton.icon(
                  onPressed: () => _openUseMaterialFromMyAssignment(t),
                  icon: const Icon(Icons.handyman_outlined,
                      size: 18, color: Color(0xFF38BDF8)),
                  label: Text(l10n.t('maint_use_from_my_stock')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF38BDF8),
                    side: const BorderSide(color: Color(0xFF38BDF8)),
                  ),
                ),
            ],
          ),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        child: Text(
          'Used lines: $usedRows · units consumed: $usedUnits · damaged (on ticket): $damaged · lost: $lost · returned to stock (on ticket): $returned',
          style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12, height: 1.35),
        ),
      ),
      if (usedItems.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: usedItems.take(12).map((raw) {
              final row = raw as Map<String, dynamic>;
              final mat = row['material'] as Map<String, dynamic>?;
              final name = mat?['name'] as String? ?? 'Item';
              final sn = row['serialNumber'] as String? ?? '';
              final qty = (row['quantity'] as num?)?.toInt() ?? 1;
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  '· $name — $sn ×$qty',
                  style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 12),
                ),
              );
            }).toList(),
          ),
        ),
      if (movements.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.t('maint_movements_on_ticket'),
                style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              ...movements.take(15).map((raw) {
                final mv = raw as Map<String, dynamic>;
                final type = (mv['type'] as String? ?? '').toUpperCase();
                final item = mv['item'] as Map<String, dynamic>?;
                final mat = item?['material'] as Map<String, dynamic>?;
                final name = mat?['name'] as String? ?? 'Item';
                final sn = item?['serialNumber'] as String? ?? '';
                final at = mv['createdAt']?.toString() ?? '';
                final note = (mv['note'] as String?)?.trim();
                final noteLine =
                    (note != null && note.isNotEmpty) ? '\n    $note' : '';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    '$type · $name ($sn) · $at$noteLine',
                    style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                  ),
                );
              }),
            ],
          ),
        ),
    ]);
  }

  Widget _timelineSection(Ticket t) {
    return _glassSection(AppLocalizations.of(context).t('status_timeline'), [
      ...t.statusTimeline.asMap().entries.map((entry) {
        final i = entry.key;
        final log = entry.value;
        final isLast = i == t.statusTimeline.length - 1;
        final color = _statusColorForStep(log.status);
        final fmt = DateFormat('MMM d, HH:mm');

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                      boxShadow: [
                        BoxShadow(
                            color: color.withAlpha(100), blurRadius: 6),
                      ],
                    ),
                  ),
                  if (!isLast)
                    Container(
                      width: 2,
                      height: 30,
                      color: color.withAlpha(40),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      StatusBadge(status: log.status),
                      const Spacer(),
                      Text(
                        fmt.format(log.createdAt),
                        style: TextStyle(
                            color: Colors.white.withAlpha(60),
                            fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    ]);
  }

  Color _statusColorForStep(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return const Color(0xFFFBBF24);
      case 'ON_SITE':
        return const Color(0xFF6C63FF);
      case 'IN_PROGRESS':
        return const Color(0xFF00D4AA);
      case 'COMPLETED':
        return const Color(0xFF4ADE80);
      default:
        return const Color(0xFF6B7280);
    }
  }

  /// Returns inspection result, or derives from checklist when null.
  String? _effectiveInspectionResult(Ticket t) {
    if (t.inspectionResult != null && t.inspectionResult!.isNotEmpty) {
      return t.inspectionResult;
    }
    if (t.isCompleted &&
        t.inspectionChecklist != null &&
        t.inspectionChecklist!.isNotEmpty) {
      final items = t.inspectionChecklist!;
      final hasReject = items.any((i) =>
          (i['result'] as String? ?? '').toLowerCase() == 'rejected' ||
          (i['checked'] == false && i['result'] == null));
      final hasMajor = items.any((i) =>
          (i['weight'] as String? ?? '').toLowerCase() == 'major');
      if (hasReject && hasMajor) return 'ncr';
      if (hasReject) return 'not_accepted';
      final hasComments = items.any((i) =>
          (i['comment'] as String? ?? '').trim().isNotEmpty);
      return hasComments ? 'accepted_with_comments' : 'accepted';
    }
    return null;
  }

  Color _resultColor(String result) {
    switch ((result).toLowerCase()) {
      case 'accepted':
        return const Color(0xFF00D4AA);
      case 'accepted_with_comments':
        return const Color(0xFFFBBF24);
      case 'not_accepted':
        return const Color(0xFFFF6B81);
      case 'ncr':
        return const Color(0xFFFF4757);
      default:
        return const Color(0xFF6B7280);
    }
  }

  String _statusLabel(String s, AppLocalizations l10n) {
    switch (s.toUpperCase()) {
      case 'PENDING':
        return l10n.t('section_pending');
      case 'ON_SITE':
        return l10n.t('section_on_site');
      case 'IN_PROGRESS':
        return l10n.t('section_in_progress');
      case 'COMPLETED':
        return l10n.t('section_completed');
      case 'ACCEPTED':
        return l10n.t('accepted');
      case 'ACCEPTED_WITH_COMMENTS':
        return l10n.t('accepted_with_comments');
      case 'NOT_ACCEPTED':
        return l10n.t('not_accepted');
      case 'NCR':
        return l10n.t('ncr');
      case 'PASS':
        return l10n.t('pass');
      case 'FAIL':
        return l10n.t('fail');
      case 'CONDITIONAL_PASS':
        return l10n.t('conditional_pass');
      default:
        return s.replaceAll('_', ' ').split(' ').map((w) {
          if (w.isEmpty) return w;
          return w[0].toUpperCase() + w.substring(1).toLowerCase();
        }).join(' ');
    }
  }

  String _techniqueKey(String t) {
    final lower = t.toLowerCase();
    final upper = t.toUpperCase().replaceAll(' ', '_');
    if (lower == 'fiber_route') return 'maint_fiber_route';
    if (lower == 'fiber_site') return 'maint_fiber_site';
    if (lower == 'electrical') return 'maint_electrical';
    if (lower == 'telecom') return 'maint_telecom';
    if (lower == 'ftth') return 'maint_ftth';
    if (upper.contains('INSPECTION')) return 'tech_inspection';
    if (upper.contains('SUPERVISION')) return 'tech_supervision';
    if (upper.contains('BUILDING')) return 'tech_building';
    if (upper.contains('HSE')) return 'tech_hse';
    if (upper.contains('INVESTIGATION')) return 'tech_investigation';
    if (upper.contains('TRACKING')) return 'tech_tracking';
    return 'tech_inspection';
  }

  String _techniqueLabel(String t, AppLocalizations l10n) =>
      l10n.t(_techniqueKey(t));

  // ─── Workflow state helpers ───────────────────────────────────────────────

  Widget _resubmitForEditButton(Ticket t, AppLocalizations l10n) {
    return _WorkflowActionButton(
      label: l10n.t('resubmit_for_edit'),
      icon: Icons.reply_rounded,
      color: const Color(0xFFFBBF24),
      onTap: () async {
        final auth = context.read<AuthProvider>();
        final reason = await _promptReason(
          context,
          l10n.t('resubmit_for_edit'),
          l10n.t('resubmit_reason_hint'),
          l10n,
          presetReasons: t.platformResubmitReasons,
        );
        if (reason == null || reason.isEmpty) return;
        final target = t.taskCategory != null && auth.hasCoordinatorCompany
            ? 'COORDINATOR'
            : 'REQUESTER';
        final ok = await context.read<TicketsProvider>().resubmitTicketForEdit(
              t.id,
              reason: reason,
              target: target,
            );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(ok
              ? (target == 'REQUESTER'
                  ? l10n.t('resubmit_sent_to_requester')
                  : l10n.t('resubmit_sent_to_coordinator'))
              : l10n.t('action_failed')),
          backgroundColor:
              ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ));
        setState(() => _ticket = null);
        _load();
      },
    );
  }

  Widget _needsEditBanner(Ticket t, AppLocalizations l10n) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFBBF24).withAlpha(20),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFBBF24).withAlpha(120)),
      ),
      child: Row(
        children: [
          const Icon(Icons.edit_note_rounded,
              color: Color(0xFFFBBF24), size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.t('needs_edit_title'),
                    style: const TextStyle(
                        color: Color(0xFFFBBF24),
                        fontWeight: FontWeight.w700,
                        fontSize: 14)),
                if (t.resubmitReason != null &&
                    t.resubmitReason!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(t.resubmitReason!,
                      style: TextStyle(
                          color: Colors.white.withAlpha(200), fontSize: 12)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _requestEditButton(Ticket t, AppLocalizations l10n) {
    return _WorkflowActionButton(
      label: l10n.t('request_edit'),
      icon: Icons.rate_review_rounded,
      color: const Color(0xFF8B83FF),
      onTap: () async {
        final reason = await _promptReason(
          context,
          l10n.t('request_edit'),
          l10n.t('request_edit_hint'),
          l10n,
          presetReasons: t.platformResubmitReasons,
        );
        if (reason == null || reason.isEmpty) return;
        final ok = await context
            .read<TicketsProvider>()
            .requestTicketEdit(t.id, reason: reason);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(ok
              ? l10n.t('edit_request_sent')
              : l10n.t('action_failed')),
          backgroundColor:
              ok ? const Color(0xFF6C63FF) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ));
        setState(() => _ticket = null);
        _load();
      },
    );
  }

  Widget _resubmittedByStaffBanner(Ticket t, AppLocalizations l10n) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF8B83FF).withAlpha(18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF8B83FF).withAlpha(100)),
      ),
      child: Row(
        children: [
          const Icon(Icons.assignment_return_rounded,
              color: Color(0xFF8B83FF), size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.t('resubmitted_by_staff'),
                    style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w700,
                        fontSize: 14)),
                if (t.resubmitReason != null &&
                    t.resubmitReason!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(t.resubmitReason!,
                      style: TextStyle(
                          color: Colors.white.withAlpha(200), fontSize: 12)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Stateful button with loading spinner (avoids StatefulBuilder reset) ────
class _WorkflowActionButton extends StatefulWidget {
  const _WorkflowActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final Color color;
  final Future<void> Function() onTap;

  @override
  State<_WorkflowActionButton> createState() => _WorkflowActionButtonState();
}

class _WorkflowActionButtonState extends State<_WorkflowActionButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: OutlinedButton.icon(
        onPressed: _busy
            ? null
            : () async {
                setState(() => _busy = true);
                await widget.onTap();
                if (mounted) setState(() => _busy = false);
              },
        icon: _busy
            ? SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: widget.color),
              )
            : Icon(widget.icon, color: widget.color),
        label: Text(widget.label,
            style: TextStyle(color: widget.color)),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: widget.color, width: 1.2),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          minimumSize: const Size.fromHeight(46),
        ),
      ),
    );
  }
}

class _CreateChecklistDialogResult {
  _CreateChecklistDialogResult({required this.name, required this.items});

  final String name;
  final List<Map<String, dynamic>> items;
}

class _CreateChecklistTemplateDialog extends StatefulWidget {
  const _CreateChecklistTemplateDialog({required this.l10n});

  final AppLocalizations l10n;

  @override
  State<_CreateChecklistTemplateDialog> createState() => _CreateChecklistTemplateDialogState();
}

class _CreateChecklistTemplateDialogState extends State<_CreateChecklistTemplateDialog> {
  final _nameCtrl = TextEditingController();
  final List<TextEditingController> _lineCtrls = [TextEditingController()];
  final List<String> _weights = ['minor'];

  @override
  void dispose() {
    _nameCtrl.dispose();
    for (final c in _lineCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _addLine() {
    setState(() {
      _lineCtrls.add(TextEditingController());
      _weights.add('minor');
    });
  }

  void _removeLine(int i) {
    if (_lineCtrls.length <= 1) return;
    setState(() {
      _lineCtrls[i].dispose();
      _lineCtrls.removeAt(i);
      _weights.removeAt(i);
    });
  }

  void _submit() {
    final name = _nameCtrl.text.trim();
    final items = <Map<String, dynamic>>[];
    final base = DateTime.now().microsecondsSinceEpoch;
    for (var i = 0; i < _lineCtrls.length; i++) {
      final label = _lineCtrls[i].text.trim();
      if (label.isEmpty) continue;
      final w = _weights[i] == 'major' ? 'major' : 'minor';
      items.add({
        'id': 'item-$base-$i',
        'label': label,
        'weight': w,
      });
    }
    if (name.isEmpty || items.isEmpty) return;
    Navigator.pop(
      context,
      _CreateChecklistDialogResult(name: name, items: items),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;
    return AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: Text(l10n.t('engineer_cl_create'), style: const TextStyle(color: Colors.white)),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _nameCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: l10n.t('engineer_cl_name'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(180)),
                ),
              ),
              const SizedBox(height: 14),
              ...List.generate(_lineCtrls.length, (i) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _lineCtrls[i],
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              decoration: InputDecoration(
                                labelText: '${l10n.t('engineer_cl_item_label')} ${i + 1}',
                                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                              ),
                            ),
                          ),
                          if (_lineCtrls.length > 1)
                            IconButton(
                              onPressed: () => _removeLine(i),
                              icon: Icon(Icons.close_rounded, color: Colors.white.withAlpha(140)),
                              tooltip: l10n.t('cancel'),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        l10n.t('engineer_cl_weight'),
                        style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                      ),
                      const SizedBox(height: 4),
                      SegmentedButton<String>(
                        segments: [
                          ButtonSegment(
                            value: 'minor',
                            label: Text(l10n.t('checklist_weight_minor')),
                          ),
                          ButtonSegment(
                            value: 'major',
                            label: Text(l10n.t('checklist_weight_major')),
                          ),
                        ],
                        selected: {_weights[i]},
                        onSelectionChanged: (s) {
                          setState(() => _weights[i] = s.first);
                        },
                        style: ButtonStyle(
                          foregroundColor: WidgetStateProperty.resolveWith((states) {
                            if (states.contains(WidgetState.selected)) {
                              return Colors.white;
                            }
                            return Colors.white70;
                          }),
                        ),
                      ),
                    ],
                  ),
                );
              }),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _addLine,
                  icon: const Icon(Icons.add_rounded, color: Color(0xFF00D4AA)),
                  label: Text(
                    l10n.t('engineer_cl_add_item'),
                    style: const TextStyle(color: Color(0xFF00D4AA)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.t('cancel')),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(l10n.t('site_save')),
        ),
      ],
    );
  }
}
