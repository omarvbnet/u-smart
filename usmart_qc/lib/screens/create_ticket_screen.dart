import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../models/inspection_checklist.dart';
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

  String _taskCategory = 'QUALITY';
  String _checklistTemplateId = '';
  String _assignmentScope = 'COMPANY_STAFF';
  String _assigneeCoordinatorUserId = '';
  bool _resubmitToRequester = false;
  List<InspectionChecklist> _coordChecklists = [];
  List<Map<String, dynamic>> _coordStaff = [];
  bool _coordResourcesLoading = false;

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

      final auth = context.read<AuthProvider>();
      if (!auth.canCreateCoordinatorTasks || !mounted) return;
      setState(() => _coordResourcesLoading = true);
      final ticketsProv = context.read<TicketsProvider>();
      final lists = await Future.wait([
        ticketsProv.fetchChecklists(),
        ticketsProv.fetchCompanyStaffRows(),
      ]);
      if (!mounted) return;
      setState(() {
        _coordChecklists = lists[0] as List<InspectionChecklist>;
        _coordStaff = lists[1] as List<Map<String, dynamic>>;
        _coordResourcesLoading = false;
      });
    });
  }

  List<InspectionChecklist> get _checklistsForCategory {
    return _coordChecklists.where((c) {
      final tc = c.taskCategory;
      if (tc == null || tc.isEmpty) return true;
      return tc.toUpperCase() == _taskCategory.toUpperCase();
    }).toList();
  }

  String _requiredStaffRoleForCategory(String cat) {
    switch (cat.toUpperCase()) {
      case 'SUPERVISION':
        return 'SUPERVISION_ENGINEER';
      case 'MAINTENANCE':
        return 'TECHNICIAN';
      case 'QUALITY':
      default:
        return 'QUALITY_ENGINEER';
    }
  }

  List<Map<String, dynamic>> get _assigneeOptions {
    final want = _requiredStaffRoleForCategory(_taskCategory);
    return _coordStaff.where((u) => u['role'] == want).toList();
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

    final auth = context.read<AuthProvider>();
    if (auth.canCreateCoordinatorTasks) {
      if (_checklistTemplateId.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context).t('coordinator_checklist_required'),
            ),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
      }
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
    final success = await provider.createTicket(
      siteName: siteName,
      siteCoordinator: coordinator,
      technique: technique,
      slaHours: sla,
      designSpecifications: designSpecs.isEmpty ? null : designSpecs,
      attachmentUrls: _attachmentUrls.isEmpty ? null : List.from(_attachmentUrls),
      taskCategory: auth.canCreateCoordinatorTasks ? _taskCategory : null,
      checklistTemplateId:
          auth.canCreateCoordinatorTasks ? _checklistTemplateId : null,
      assignmentScope:
          auth.canCreateCoordinatorTasks ? _assignmentScope : null,
      assigneeCoordinatorUserId: auth.canCreateCoordinatorTasks &&
              _assigneeCoordinatorUserId.isNotEmpty
          ? _assigneeCoordinatorUserId
          : null,
      resubmitToRequester:
          auth.canCreateCoordinatorTasks ? _resubmitToRequester : false,
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
        final err = provider.lastTicketCreateMessage;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              (err != null && err.isNotEmpty) ? err : l10n.t('ticket_failed'),
            ),
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
