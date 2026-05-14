import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import '../config/api_config.dart';
import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../providers/private_company_provider.dart';
import 'attachment_viewer_screen.dart';

/// Maintenance types. Values must match backend MAINTENANCE_TECHNIQUES.
const _maintenanceTypeIds = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const _maintenanceTypeKeys = [
  'maint_fiber_route',
  'maint_fiber_site',
  'maint_electrical',
  'maint_telecom',
  'maint_ftth',
];

class CreateMaintenanceTicketScreen extends StatefulWidget {
  const CreateMaintenanceTicketScreen({super.key});

  @override
  State<CreateMaintenanceTicketScreen> createState() =>
      _CreateMaintenanceTicketScreenState();
}

class _CreateMaintenanceTicketScreenState
    extends State<CreateMaintenanceTicketScreen> {
  final _siteNameCtrl = TextEditingController();
  final _coordinatorCtrl = TextEditingController();
  final _slaCtrl = TextEditingController(text: '24');
  final _reasonCtrl = TextEditingController();
  final _designSpecsCtrl = TextEditingController();
  String _maintenanceType = 'fiber_route';
  bool _submitting = false;
  bool _uploading = false;
  /// Optional design / specification / explanation files (not before-maintenance site evidence).
  final List<String> _specAttachmentUrls = [];
  /// Same semantics as [CreateTicketScreen]: private workspace vs global pool.
  String _assignmentScope = 'PRIVATE_COMPANY';
  String? _workspaceTargetDepartmentId;

  /// When user picks a saved site (quick-fill); province comes from that site when set.
  Site? _linkedSite;
  String? _selectedProvince;

  @override
  void initState() {
    super.initState();
    _siteNameCtrl.addListener(_onSiteIdEdited);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final sites = context.read<SitesProvider>();
      await sites.fetchSites();
      if (!mounted) return;
      final tech = context.read<ProvisorTechniquesProvider>();
      await tech.ensureLoaded();
      if (!mounted) return;
      final slugs = tech.maintenance.map((e) => e.slug).toList();
      if (slugs.isNotEmpty && !slugs.contains(_maintenanceType)) {
        setState(() => _maintenanceType = slugs.first);
      }
      final pc = context.read<PrivateCompanyProvider>();
      if (pc.workspace == null && (pc.membership.isOwner || pc.membership.isStaff)) {
        await pc.refresh();
      }
      if (!mounted) return;
      final inWs = pc.isApproved && (pc.isOwner || pc.isStaff);
      if (inWs) setState(() => _assignmentScope = 'PRIVATE_COMPANY');
    });
  }

  Future<void> _submit() async {
    final siteName = _siteNameCtrl.text.trim();
    final coordinator = _coordinatorCtrl.text.trim();
    final sla = int.tryParse(_slaCtrl.text.trim()) ?? 24;
    final l10n = AppLocalizations.of(context);

    final reason = _reasonCtrl.text.trim();
    if (siteName.isEmpty || coordinator.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }
    if (reason.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('maint_reason_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    final province = (_linkedSite != null && _linkedSite!.province.trim().isNotEmpty)
        ? _linkedSite!.province.trim()
        : (_selectedProvince?.trim() ?? '');
    if (province.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('ticket_province_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    final provider = context.read<TicketsProvider>();
    final techProv = context.read<ProvisorTechniquesProvider>();
    final maintOpts = techProv.maintenance;
    final fallbackIds = _maintenanceTypeIds;
    final validIds = maintOpts.isEmpty
        ? fallbackIds
        : maintOpts.map((e) => e.slug).toList();
    final technique = validIds.contains(_maintenanceType)
        ? _maintenanceType
        : validIds.first;
    final designSpecs = _designSpecsCtrl.text.trim();
    final pc = context.read<PrivateCompanyProvider>();
    final inWorkspace = pc.isApproved && (pc.isOwner || pc.isStaff);
    final String? scopeForApi = inWorkspace
        ? (_assignmentScope == 'PRIVATE_COMPANY' ? 'PRIVATE_COMPANY' : 'GLOBAL')
        : null;
    final success = await provider.createTicket(
      siteName: siteName,
      siteCoordinator: coordinator,
      technique: technique,
      slaHours: sla,
      province: province,
      designSpecifications: designSpecs.isEmpty ? null : designSpecs,
      maintenanceReason: reason,
      attachmentUrls:
          _specAttachmentUrls.isEmpty ? null : List.from(_specAttachmentUrls),
      assignmentScope: scopeForApi,
      privateCompanyTargetDepartmentId:
          inWorkspace && scopeForApi == 'PRIVATE_COMPANY' && pc.canChooseWorkspaceTicketTargetDepartment
              ? _workspaceTargetDepartmentId
              : null,
    );

    if (!mounted) return;
    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('ticket_created')),
          backgroundColor: const Color(0xFF00D4AA),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? l10n.t('ticket_failed')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      setState(() => _submitting = false);
    }
  }

  Future<void> _pickAndUploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'],
      allowMultiple: false,
      withData: true,
    );
    if (!mounted || result == null || result.files.isEmpty) return;
    final provider = context.read<TicketsProvider>();
    final file = result.files.single;
    final bytes = file.bytes;
    final path = file.path;
    final filename = file.name;
    setState(() => _uploading = true);
    try {
      String? url;
      if (bytes != null && bytes.isNotEmpty && filename.isNotEmpty) {
        url = await provider.uploadFileFromBytes(bytes, filename);
      } else if (path != null && path.isNotEmpty) {
        url = await provider.uploadFile(path);
      }
      if (url != null && mounted) {
        final u = url;
        setState(() => _specAttachmentUrls.add(u));
      } else if (mounted) {
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (_) {
      if (mounted) {
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    }
    if (mounted) setState(() => _uploading = false);
  }

  void _onSiteIdEdited() {
    final id = _siteNameCtrl.text.trim();
    if (_linkedSite != null && id != _linkedSite!.siteId) {
      setState(() => _linkedSite = null);
    }
  }

  void _applySiteQuickFill(Site s) {
    setState(() {
      _linkedSite = s;
      _siteNameCtrl.text = s.siteId;
      _coordinatorCtrl.text = s.location;
      final p = s.province.trim();
      if (p.isNotEmpty) _selectedProvince = p;
    });
  }

  Widget _buildProvinceSection(AppLocalizations l10n) {
    if (_linkedSite != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.t('ticket_province_from_site').toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(80),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: const Color(0xFF12122A),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF6C63FF).withAlpha(50)),
            ),
            child: Row(
              children: [
                const Icon(Icons.map_rounded, color: Color(0xFF8B83FF), size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _linkedSite!.province.isNotEmpty
                        ? _linkedSite!.province
                        : l10n.t('ticket_province_hint'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _linkedSite = null;
                    });
                  },
                  child: Text(
                    l10n.t('ticket_clear_site_link'),
                    style: const TextStyle(color: Color(0xFF8B83FF), fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('ticket_province').toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withAlpha(10)),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _selectedProvince != null && kIraqProvinces.contains(_selectedProvince)
                  ? _selectedProvince
                  : null,
              hint: Text(
                l10n.t('ticket_province_hint'),
                style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 15),
              ),
              isExpanded: true,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white, fontSize: 15),
              icon: Icon(Icons.expand_more_rounded, color: Colors.white.withAlpha(80)),
              items: kIraqProvinces
                  .map(
                    (p) => DropdownMenuItem<String>(
                      value: p,
                      child: Text(p),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _selectedProvince = v),
            ),
          ),
        ),
      ],
    );
  }

  void _removeAttachment(int index) =>
      setState(() => _specAttachmentUrls.removeAt(index));

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  void dispose() {
    _siteNameCtrl.removeListener(_onSiteIdEdited);
    _siteNameCtrl.dispose();
    _coordinatorCtrl.dispose();
    _slaCtrl.dispose();
    _reasonCtrl.dispose();
    _designSpecsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final sites = context.watch<SitesProvider>().sites;
    final techProv = context.watch<ProvisorTechniquesProvider>();
    final maintOpts = techProv.maintenance;
    final fallbackIds = _maintenanceTypeIds;
    final validIds = maintOpts.isEmpty
        ? fallbackIds
        : maintOpts.map((e) => e.slug).toList();
    final selectedType = validIds.contains(_maintenanceType)
        ? _maintenanceType
        : (validIds.isNotEmpty ? validIds.first : _maintenanceType);

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          l10n.t('new_maintenance_ticket'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (sites.isNotEmpty) ...[
            Text(
              l10n.t('quick_fill'),
              style: TextStyle(
                color: Colors.white.withAlpha(80),
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: sites.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final s = sites[i];
                  return GestureDetector(
                    onTap: () => _applySiteQuickFill(s),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF6C63FF).withAlpha(25),
                            const Color(0xFF6C63FF).withAlpha(10),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: const Color(0xFF6C63FF).withAlpha(40)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        s.siteId,
                        style: const TextStyle(
                          color: Color(0xFF8B83FF),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 24),
          ],
          _buildField(
            controller: _siteNameCtrl,
            label: l10n.t('site_name'),
            hint: l10n.t('site_name_hint'),
            icon: Icons.location_on_outlined,
          ),
          const SizedBox(height: 16),
          _buildProvinceSection(l10n),
          const SizedBox(height: 16),
          _buildField(
            controller: _coordinatorCtrl,
            label: l10n.t('site_coordinator'),
            hint: l10n.t('site_coordinator_hint'),
            icon: Icons.person_outline_rounded,
          ),
          const SizedBox(height: 16),
          Text(
            l10n.t('maint_type_of_maintenance').toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(80),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: const Color(0xFF12122A),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withAlpha(10)),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selectedType,
                isExpanded: true,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white, fontSize: 15),
                icon: Icon(Icons.expand_more_rounded,
                    color: Colors.white.withAlpha(80)),
                items: maintOpts.isEmpty
                    ? List.generate(
                        fallbackIds.length,
                        (i) => DropdownMenuItem(
                          value: fallbackIds[i],
                          child: Text(l10n.t(_maintenanceTypeKeys[i])),
                        ),
                      )
                    : maintOpts
                        .map((e) => DropdownMenuItem(
                              value: e.slug,
                              child: Text(
                                  e.labelForLocale(l10n.locale.languageCode)),
                            ))
                        .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _maintenanceType = v);
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildField(
            controller: _reasonCtrl,
            label: l10n.t('maint_reason'),
            hint: l10n.t('maint_reason_hint'),
            icon: Icons.info_outline_rounded,
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          _buildField(
            controller: _slaCtrl,
            label: l10n.t('sla_hours'),
            hint: '24',
            icon: Icons.schedule_rounded,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 16),
          _buildAssignmentScopePicker(l10n),
          const SizedBox(height: 16),
          _buildDesignSpecsField(l10n),
          const SizedBox(height: 16),
          _buildAttachmentsSection(l10n),
          const SizedBox(height: 36),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withAlpha(60),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ElevatedButton(
                onPressed: (_submitting || _uploading) ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: (_submitting || _uploading)
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(l10n.t('create_ticket'),
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAssignmentScopePicker(AppLocalizations l10n) {
    return Consumer<PrivateCompanyProvider>(
      builder: (context, pc, _) {
        final inWorkspace = pc.isApproved && (pc.isOwner || pc.isStaff);
        if (!inWorkspace) return const SizedBox.shrink();
        final isPrivate = _assignmentScope == 'PRIVATE_COMPANY';
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.t('ticket_assignment_scope').toUpperCase(),
              style: TextStyle(
                color: Colors.white.withAlpha(80),
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(10)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () =>
                          setState(() => _assignmentScope = 'PRIVATE_COMPANY'),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 10),
                        decoration: BoxDecoration(
                          gradient: isPrivate
                              ? const LinearGradient(
                                  colors: [
                                    Color(0xFF6C63FF),
                                    Color(0xFF00D4AA),
                                  ],
                                )
                              : null,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          l10n.t('scope_private_company'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight:
                                isPrivate ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() {
                        _assignmentScope = 'GLOBAL';
                        _workspaceTargetDepartmentId = null;
                      }),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 10),
                        decoration: BoxDecoration(
                          gradient: !isPrivate
                              ? const LinearGradient(
                                  colors: [
                                    Color(0xFF6C63FF),
                                    Color(0xFF00D4AA),
                                  ],
                                )
                              : null,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          l10n.t('scope_global'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight:
                                !isPrivate ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (isPrivate && pc.canChooseWorkspaceTicketTargetDepartment) ...[
              const SizedBox(height: 14),
              Text(
                l10n.t('ticket_target_department').toUpperCase(),
                style: TextStyle(
                  color: Colors.white.withAlpha(80),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                l10n.t('ticket_target_department_hint'),
                style: TextStyle(
                  color: Colors.white.withAlpha(140),
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _workspaceTargetDepartmentId ?? '',
                dropdownColor: const Color(0xFF1E1E36),
                style: const TextStyle(color: Colors.white, fontSize: 15),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Colors.white.withAlpha(10)),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                ),
                items: [
                  DropdownMenuItem(
                    value: '',
                    child: Text(l10n.t('ticket_all_departments')),
                  ),
                  ...(() {
                    final list = List.of(pc.workspace?.departments ?? []);
                    list.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
                    return list
                        .map(
                          (d) => DropdownMenuItem<String>(
                            value: d.id,
                            child: Text(d.name, overflow: TextOverflow.ellipsis),
                          ),
                        )
                        .toList();
                  })(),
                ],
                onChanged: (v) => setState(() {
                  _workspaceTargetDepartmentId =
                      (v == null || v.isEmpty) ? null : v;
                }),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _buildDesignSpecsField(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('design_specifications').toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _designSpecsCtrl,
          maxLines: 3,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: l10n.t('design_specs_hint'),
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon: const Icon(Icons.description_outlined,
                color: Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.white.withAlpha(10)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
        ),
      ],
    );
  }

  Widget _buildAttachmentsSection(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('add_attachments').toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          l10n.t('add_attachments_hint'),
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
        ),
        const SizedBox(height: 10),
        _attachmentButton(
          icon: Icons.attach_file_rounded,
          label: l10n.t('add_file'),
          onTap: _uploading ? null : _pickAndUploadFile,
        ),
        if (_specAttachmentUrls.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _specAttachmentUrls.asMap().entries.map((e) {
              final url = e.value;
              final idx = e.key;
              final isImage = url.toLowerCase().contains('image') ||
                  RegExp(r'\.(jpe?g|png|gif|webp)$').hasMatch(url);
              final displayUrl = url.startsWith('http')
                  ? url
                  : (url.startsWith('/')
                      ? '${ApiConfig.baseUrl}$url'
                      : '${ApiConfig.baseUrl}/$url');
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  GestureDetector(
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
                        border: Border.all(
                            color: const Color(0xFF6C63FF).withAlpha(60)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ClipRRect(
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(11)),
                            child: SizedBox(
                              width: 80,
                              height: 64,
                              child: isImage
                                  ? Image.network(displayUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          _placeholderIcon())
                                  : _placeholderIcon(),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 4),
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
                  ),
                  Positioned(
                    top: -6,
                    right: -6,
                    child: GestureDetector(
                      onTap: () => _removeAttachment(idx),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Color(0xFFFF4757),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.close,
                            size: 14, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  Widget _placeholderIcon() => Container(
        color: const Color(0xFF0A0A1F),
        child: Icon(Icons.insert_drive_file_rounded,
            color: Colors.white.withAlpha(120), size: 28),
      );

  Widget _attachmentButton({
    required IconData icon,
    required String label,
    VoidCallback? onTap,
  }) {
    return Expanded(
      child: Material(
        color: const Color(0xFF6C63FF).withAlpha(25),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: const Color(0xFF6C63FF), size: 20),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFF8B83FF),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    int maxLines = 1,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          maxLines: maxLines,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon:
                Icon(icon, color: const Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.white.withAlpha(10)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
        ),
      ],
    );
  }
}
