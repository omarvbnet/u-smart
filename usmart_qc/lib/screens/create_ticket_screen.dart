import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:latlong2/latlong.dart';
import '../config/api_config.dart';
import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../providers/private_company_provider.dart';
import 'attachment_viewer_screen.dart';
import 'site_map_picker_screen.dart';

const _qcTechniqueKeys = ['tech_inspection', 'tech_supervision', 'tech_building', 'tech_hse', 'tech_investigation', 'tech_tracking'];
const _qcTechniqueIds = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'];

class CreateTicketScreen extends StatefulWidget {
  /// When non-null, site id, location, province, and coordinates are prefilled (e.g. from Sites tab).
  final Site? prefillSite;

  const CreateTicketScreen({super.key, this.prefillSite});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final _siteNameCtrl = TextEditingController();
  final _coordinatorCtrl = TextEditingController();
  final _slaCtrl = TextEditingController(text: '24');
  final _designSpecsCtrl = TextEditingController();
  final _coordsCtrl = TextEditingController();
  final _picker = ImagePicker();
  String _technique = 'inspection';
  bool _submitting = false;
  bool _uploading = false;
  final List<String> _attachmentUrls = [];
  final List<Map<String, String>> _qfieldDrafts = [];
  String? _selectedChecklistId;
  /// 'PRIVATE_COMPANY' = restrict to my workspace staff, 'GLOBAL' = open to all engineers
  String _assignmentScope = 'PRIVATE_COMPANY';
  /// When [canChooseWorkspaceTicketTargetDepartment]: null = all departments, else department id.
  String? _workspaceTargetDepartmentId;
  /// Set when user picks a saved site (quick-fill); province comes from that site.
  Site? _linkedSite;
  String? _selectedProvince;

  void _applyPrefillSite(Site s) {
    _linkedSite = s;
    _siteNameCtrl.text = s.siteId;
    _coordinatorCtrl.text = s.location;
    _selectedProvince = s.province;
    if (s.hasCoordinates) {
      _coordsCtrl.text =
          '${s.latitude!.toStringAsFixed(6)}, ${s.longitude!.toStringAsFixed(6)}';
    } else {
      _coordsCtrl.clear();
    }
  }

  @override
  void initState() {
    super.initState();
    final pre = widget.prefillSite;
    if (pre != null) {
      _applyPrefillSite(pre);
    }
    _siteNameCtrl.addListener(_onSiteIdEdited);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final sites = context.read<SitesProvider>();
      await sites.fetchSites();
      if (!mounted) return;
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
      if (!mounted) return;
      final inWs = pc.isApproved && (pc.isOwner || pc.isStaff);
      if (inWs) {
        setState(() => _assignmentScope = 'PRIVATE_COMPANY');
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

    final province = _linkedSite?.province ?? _selectedProvince?.trim() ?? '';
    if (province.isEmpty) {
      final l10n = AppLocalizations.of(context);
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

    double? coordLat;
    double? coordLng;
    final coordText = _coordsCtrl.text.trim();
    if (coordText.isNotEmpty) {
      final parts = coordText
          .split(RegExp(r'[,\s;]+'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      if (parts.length >= 2) {
        coordLat = double.tryParse(parts[0]);
        coordLng = double.tryParse(parts[1]);
      }
      if (coordLat == null || coordLng == null) {
        final l10n = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('ticket_coords_invalid')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
      siteLatitude: coordLat,
      siteLongitude: coordLng,
      designSpecifications: designSpecs.isEmpty ? null : designSpecs,
      attachmentUrls: _attachmentUrls.isEmpty ? null : List.from(_attachmentUrls),
      qfieldProjects: () {
        if (_qfieldDrafts.isEmpty) return null;
        return _qfieldDrafts
            .where((e) => (e['url'] ?? '').trim().isNotEmpty)
            .map((e) {
          final url = e['url']!.trim();
          final fileName = (e['fileName'] ?? '').trim();
          final title = (e['title'] ?? '').trim();
          final m = <String, dynamic>{'url': url, 'fileName': fileName};
          if (title.isNotEmpty) m['title'] = title;
          return m;
        }).toList();
      }(),
      checklistTemplateId: _selectedChecklistId,
      assignmentScope: scopeForApi,
      privateCompanyTargetDepartmentId:
          inWorkspace && scopeForApi == 'PRIVATE_COMPANY' && pc.canChooseWorkspaceTicketTargetDepartment
              ? _workspaceTargetDepartmentId
              : null,
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

  void _onSiteIdEdited() {
    final t = _siteNameCtrl.text.trim();
    if (_linkedSite != null && t != _linkedSite!.siteId) {
      setState(() => _linkedSite = null);
    }
  }

  Future<void> _openMapPicker() async {
    double? ilat;
    double? ilng;
    final parts = _coordsCtrl.text
        .split(RegExp(r'[,\s;]+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (parts.length >= 2) {
      ilat = double.tryParse(parts[0]);
      ilng = double.tryParse(parts[1]);
    }
    final result = await Navigator.of(context).push<LatLng>(
      MaterialPageRoute(
        builder: (context) => SiteMapPickerScreen(
          initialLat: ilat,
          initialLng: ilng,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() {
        _coordsCtrl.text =
            '${result.latitude.toStringAsFixed(6)}, ${result.longitude.toStringAsFixed(6)}';
      });
    }
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
                    _linkedSite!.province,
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

  Widget _buildSiteCoordinatesSection(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('ticket_site_coordinates').toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('ticket_site_coordinates_hint'),
          style: TextStyle(
            color: Colors.white.withAlpha(120),
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _coordsCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 15),
                decoration: InputDecoration(
                  hintText: l10n.t('site_coordinates_hint'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  prefixIcon: const Icon(Icons.gps_fixed, color: Color(0xFF6C63FF), size: 20),
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
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Material(
              color: const Color(0xFF6C63FF).withAlpha(28),
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                onTap: _openMapPicker,
                borderRadius: BorderRadius.circular(14),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.map_rounded, color: Color(0xFF8B83FF), size: 22),
                      const SizedBox(width: 8),
                      Text(
                        l10n.t('ticket_pick_on_map'),
                        style: const TextStyle(
                          color: Color(0xFF8B83FF),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _pickAndUploadImage() async {
    final xFile = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 72,
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

  void _removeQFieldDraft(int index) {
    setState(() => _qfieldDrafts.removeAt(index));
  }

  Future<void> _pickAndUploadQField(AppLocalizations l10n) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['qgz', 'zip', 'gpkg', 'qgs'],
      allowMultiple: false,
      withData: true,
    );
    if (!mounted || result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    final path = file.path;
    final filename = file.name;
    if (filename.isEmpty) return;
    final provider = context.read<TicketsProvider>();
    setState(() => _uploading = true);
    try {
      String? url;
      if (bytes != null && bytes.isNotEmpty) {
        url = await provider.uploadQFieldPackageFromBytes(bytes, filename);
      } else if (path != null && path.isNotEmpty) {
        url = await provider.uploadQFieldPackageFromPath(path);
      }
      if (url == null || !mounted) {
        if (mounted) _showError(l10n.t('upload_failed'));
        return;
      }
      final baseTitle = filename.replaceFirst(RegExp(r'\.[^.]+$'), '');
      final titleCtrl = TextEditingController(text: baseTitle.isEmpty ? filename : baseTitle);
      final title = await showDialog<String>(
        context: context,
        builder: (ctx) {
          final loc = AppLocalizations.of(ctx);
          return AlertDialog(
            backgroundColor: const Color(0xFF12122A),
            title: Text(loc.t('qfield_project_title'),
                style: const TextStyle(color: Colors.white, fontSize: 16)),
            content: TextField(
              controller: titleCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: filename,
                hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, ''),
                child: Text(loc.t('cancel')),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, titleCtrl.text.trim()),
                child: Text(loc.t('ok')),
              ),
            ],
          );
        },
      );
      titleCtrl.dispose();
      if (!mounted) return;
      final t = (title == null || title.isEmpty) ? filename : title;
      setState(() => _qfieldDrafts.add({'url': url!, 'fileName': filename, 'title': t}));
    } catch (_) {
      if (mounted) _showError(l10n.t('upload_failed'));
    }
    if (mounted) setState(() => _uploading = false);
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
    _siteNameCtrl.removeListener(_onSiteIdEdited);
    _siteNameCtrl.dispose();
    _coordinatorCtrl.dispose();
    _slaCtrl.dispose();
    _designSpecsCtrl.dispose();
    _coordsCtrl.dispose();
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
                      setState(() => _applyPrefillSite(s));
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
          _buildProvinceSection(l10n),
          const SizedBox(height: 16),
          _buildSiteCoordinatesSection(l10n),
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
          const SizedBox(height: 16),
          _buildQFieldSection(l10n),
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
                    onTap: () => setState(() {
                      _assignmentScope = 'GLOBAL';
                      _workspaceTargetDepartmentId = null;
                    }),
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

  Widget _buildQFieldSection(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('qfield_add_package').toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('qfield_package_hint'),
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
        ),
        const SizedBox(height: 10),
        Material(
          color: const Color(0xFF00D4AA).withAlpha(22),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: _uploading ? null : () => _pickAndUploadQField(l10n),
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.map_rounded, color: Color(0xFF00D4AA), size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      l10n.t('qfield_add_package'),
                      style: const TextStyle(
                        color: Color(0xFF00D4AA),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(Icons.cloud_upload_outlined,
                      color: Colors.white.withAlpha(160), size: 20),
                ],
              ),
            ),
          ),
        ),
        if (_qfieldDrafts.isNotEmpty) ...[
          const SizedBox(height: 12),
          ..._qfieldDrafts.asMap().entries.map((e) {
            final i = e.key;
            final d = e.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(12),
                child: ListTile(
                  leading: const Icon(Icons.layers_rounded, color: Color(0xFF6C63FF)),
                  title: Text(
                    d['title'] ?? d['fileName'] ?? '',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    d['fileName'] ?? '',
                    style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.close_rounded, color: Color(0xFFFF4757)),
                    onPressed: () => _removeQFieldDraft(i),
                  ),
                ),
              ),
            );
          }),
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
