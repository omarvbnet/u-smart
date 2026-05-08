import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../providers/private_company_provider.dart';
import 'attachment_viewer_screen.dart';

const _qcTechniqueKeys = ['tech_inspection', 'tech_supervision', 'tech_building', 'tech_hse', 'tech_investigation', 'tech_tracking'];
const _qcTechniqueIds = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'];

class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final _siteNameCtrl = TextEditingController();
  final _coordinatorCtrl = TextEditingController();
  final _slaCtrl = TextEditingController(text: '24');
  final _designSpecsCtrl = TextEditingController();
  final _picker = ImagePicker();
  String _technique = 'inspection';
  bool _submitting = false;
  bool _uploading = false;
  final List<String> _attachmentUrls = [];
  String? _selectedChecklistId;
  /// 'PRIVATE_COMPANY' = restrict to my workspace staff, null/'GLOBAL' = open to all engineers
  String _assignmentScope = 'GLOBAL';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final tech = context.read<ProvisorTechniquesProvider>();
      await tech.ensureLoaded();
      if (!mounted) return;
      final slugs = tech.inspection.map((e) => e.slug).toList();
      if (slugs.isNotEmpty && !slugs.contains(_technique)) {
        setState(() => _technique = slugs.first);
      }
      final pc = context.read<PrivateCompanyProvider>();
      if (pc.workspace == null && (pc.membership.isOwner || pc.membership.isStaff)) {
        await pc.refresh();
      }
    });
  }

  Future<void> _submit() async {
    final siteName = _siteNameCtrl.text.trim();
    final coordinator = _coordinatorCtrl.text.trim();
    final sla = int.tryParse(_slaCtrl.text.trim()) ?? 24;

    if (siteName.isEmpty || coordinator.isEmpty) {
      final l10n = AppLocalizations.of(context);
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

    setState(() => _submitting = true);
    final provider = context.read<TicketsProvider>();
    final techProv = context.read<ProvisorTechniquesProvider>();
    final inspectionOpts = techProv.inspection;
    final fallbackIds = _qcTechniqueIds;
    final validIds = inspectionOpts.isEmpty
        ? fallbackIds
        : inspectionOpts.map((e) => e.slug).toList();
    final technique =
        validIds.contains(_technique) ? _technique : validIds.first;
    final designSpecs = _designSpecsCtrl.text.trim();
    final pc = context.read<PrivateCompanyProvider>();
    final inWorkspace = pc.isApproved && (pc.isOwner || pc.isStaff);
    final scopeForApi =
        inWorkspace && _assignmentScope == 'PRIVATE_COMPANY' ? 'PRIVATE_COMPANY' : null;
    final success = await provider.createTicket(
      siteName: siteName,
      siteCoordinator: coordinator,
      technique: technique,
      slaHours: sla,
      designSpecifications: designSpecs.isEmpty ? null : designSpecs,
      attachmentUrls: _attachmentUrls.isEmpty ? null : List.from(_attachmentUrls),
      checklistTemplateId: _selectedChecklistId,
      assignmentScope: scopeForApi,
    );

    if (mounted) {
      final l10n = AppLocalizations.of(context);
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
            content: Text(l10n.t('ticket_failed')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _pickAndUploadImage() async {
    final xFile = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      imageQuality: 85,
    );
    if (!mounted || xFile == null) return;
    final provider = context.read<TicketsProvider>();
    setState(() => _uploading = true);
    try {
      final bytes = await xFile.readAsBytes();
      if (bytes.isEmpty) return;
      final ext = xFile.path.split('.').lastOrNull ?? 'jpg';
      final url = await provider.uploadFileFromBytes(
        bytes,
        'spec_${DateTime.now().millisecondsSinceEpoch}.$ext',
      );
      if (url != null && mounted) {
        final u = url;
        setState(() => _attachmentUrls.add(u));
      } else if (mounted) {
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (e) {
      if (mounted) _showError(AppLocalizations.of(context).t('upload_failed'));
    }
    if (mounted) setState(() => _uploading = false);
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
        setState(() => _attachmentUrls.add(u));
      } else if (mounted) {
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (_) {
      if (mounted) _showError(AppLocalizations.of(context).t('upload_failed'));
    }
    if (mounted) setState(() => _uploading = false);
  }

  void _removeAttachment(int index) {
    setState(() => _attachmentUrls.removeAt(index));
  }

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
    _siteNameCtrl.dispose();
    _coordinatorCtrl.dispose();
    _slaCtrl.dispose();
    _designSpecsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final sites = context.watch<SitesProvider>().sites;
    final techProv = context.watch<ProvisorTechniquesProvider>();
    final inspectionOpts = techProv.inspection;
    final fallbackIds = _qcTechniqueIds;
    final validIds = inspectionOpts.isEmpty
        ? fallbackIds
        : inspectionOpts.map((e) => e.slug).toList();
    final selectedTechnique =
        validIds.contains(_technique) ? _technique : (validIds.isNotEmpty ? validIds.first : _technique);

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(l10n.t('new_ticket'),
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
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
                    onTap: () {
                      _siteNameCtrl.text = s.siteId;
                      _coordinatorCtrl.text = s.location;
                    },
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
          _buildField(
            controller: _coordinatorCtrl,
            label: l10n.t('site_coordinator'),
            hint: l10n.t('site_coordinator_hint'),
            icon: Icons.person_outline_rounded,
          ),
          const SizedBox(height: 16),

          Text(
            l10n.t('technique'),
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
                value: selectedTechnique,
                isExpanded: true,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white, fontSize: 15),
                icon: Icon(Icons.expand_more_rounded,
                    color: Colors.white.withAlpha(80)),
                items: inspectionOpts.isEmpty
                    ? List.generate(fallbackIds.length, (i) => DropdownMenuItem(
                          value: fallbackIds[i],
                          child: Text(l10n.t(_qcTechniqueKeys[i])),
                        ))
                    : inspectionOpts
                        .map((e) => DropdownMenuItem(
                              value: e.slug,
                              child: Text(e.labelForLocale(l10n.locale.languageCode)),
                            ))
                        .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _technique = v);
                },
              ),
            ),
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
          _buildOptionalChecklistPicker(l10n, selectedTechnique),
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
                        style: TextStyle(
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
                  _scopeOption(
                    l10n: l10n,
                    selected: isPrivate,
                    icon: Icons.workspaces_rounded,
                    title: l10n.t('scope_private_company'),
                    subtitle: l10n.t('scope_private_company_hint'),
                    onTap: () => setState(() => _assignmentScope = 'PRIVATE_COMPANY'),
                  ),
                  _scopeOption(
                    l10n: l10n,
                    selected: !isPrivate,
                    icon: Icons.public_rounded,
                    title: l10n.t('scope_global'),
                    subtitle: l10n.t('scope_global_hint'),
                    onTap: () => setState(() => _assignmentScope = 'GLOBAL'),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _scopeOption({
    required AppLocalizations l10n,
    required bool selected,
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            gradient: selected
                ? const LinearGradient(
                    colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                  )
                : null,
            color: selected ? null : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Icon(
                    icon,
                    size: 18,
                    color: selected ? Colors.white : const Color(0xFF8B83FF),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected ? Colors.white : Colors.white.withAlpha(220),
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected
                      ? Colors.white.withAlpha(230)
                      : Colors.white.withAlpha(140),
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionalChecklistPicker(AppLocalizations l10n, String technique) {
    return Consumer<PrivateCompanyProvider>(
      builder: (context, pc, _) {
        final ws = pc.workspace;
        if (ws == null || !pc.isApproved) {
          return const SizedBox.shrink();
        }
        final checklists = ws.checklists;
        if (checklists.isEmpty) return const SizedBox.shrink();

        final filtered = checklists.where((c) {
          if (c.techniqueTypes.isEmpty) return true;
          return c.techniqueTypes.contains(technique);
        }).toList();
        if (filtered.isEmpty) return const SizedBox.shrink();

        final hasSelection = _selectedChecklistId != null &&
            filtered.any((c) => c.id == _selectedChecklistId);
        if (_selectedChecklistId != null && !hasSelection) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _selectedChecklistId = null);
          });
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  l10n.t('attach_checklist_optional').toUpperCase(),
                  style: TextStyle(
                    color: Colors.white.withAlpha(80),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C63FF).withAlpha(28),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: const Color(0xFF6C63FF).withAlpha(60),
                    ),
                  ),
                  child: const Text(
                    'OPTIONAL',
                    style: TextStyle(
                      color: Color(0xFF8B83FF),
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(10)),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String?>(
                  value: hasSelection ? _selectedChecklistId : null,
                  isExpanded: true,
                  hint: Row(
                    children: [
                      const Icon(Icons.fact_check_outlined,
                          color: Color(0xFF6C63FF), size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          l10n.t('no_checklist_selected'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(120),
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                  dropdownColor: const Color(0xFF12122A),
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  icon: Icon(Icons.expand_more_rounded,
                      color: Colors.white.withAlpha(80)),
                  items: [
                    DropdownMenuItem<String?>(
                      value: null,
                      child: Row(
                        children: [
                          const Icon(Icons.block_rounded,
                              color: Color(0xFF4B5563), size: 18),
                          const SizedBox(width: 10),
                          Text(
                            l10n.t('no_checklist_selected'),
                            style: TextStyle(
                              color: Colors.white.withAlpha(160),
                            ),
                          ),
                        ],
                      ),
                    ),
                    ...filtered.map(
                      (c) => DropdownMenuItem<String?>(
                        value: c.id,
                        child: Row(
                          children: [
                            Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFF6C63FF),
                                    Color(0xFF00D4AA),
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.checklist_rounded,
                                color: Colors.white,
                                size: 16,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    c.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    '${c.items.length} item(s)'
                                    '${c.category != null ? ' · ${c.category}' : ''}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white.withAlpha(120),
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  onChanged: (v) => setState(() => _selectedChecklistId = v),
                ),
              ),
            ),
            if (hasSelection) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF6C63FF).withAlpha(15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: const Color(0xFF6C63FF).withAlpha(40),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        color: Color(0xFF8B83FF), size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.t('checklist_attached_hint'),
                        style: TextStyle(
                          color: Colors.white.withAlpha(180),
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
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
          style: TextStyle(
            color: Colors.white.withAlpha(120),
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _attachmentButton(
              icon: Icons.photo_library_outlined,
              label: l10n.t('add_image'),
              onTap: _uploading ? null : _pickAndUploadImage,
            ),
            const SizedBox(width: 12),
            _attachmentButton(
              icon: Icons.attach_file_rounded,
              label: l10n.t('add_file'),
              onTap: _uploading ? null : _pickAndUploadFile,
            ),
          ],
        ),
        if (_attachmentUrls.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _attachmentUrls.asMap().entries.map((e) {
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
                                  ? Image.network(
                                      displayUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          _placeholderIcon(),
                                    )
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
