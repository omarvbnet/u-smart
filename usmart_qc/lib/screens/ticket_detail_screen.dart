import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import '../models/comment.dart';
import '../models/evidence.dart';
import '../models/inspection_checklist.dart';
import '../providers/auth_provider.dart';
import '../providers/conflicts_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/tickets_provider.dart';
import '../widgets/status_badge.dart';
import '../widgets/comments_widget.dart';
import '../widgets/checklist_widget.dart';
import '../widgets/evidence_upload_widget.dart';
import 'ncr_resubmit_screen.dart';
import 'conflict_detail_screen.dart';
import 'attachment_viewer_screen.dart';

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
  bool _updatingStatus = false;

  List<TicketComment> _comments = [];
  List<TicketEvidence> _evidence = [];
  List<InspectionChecklist> _checklists = [];
  bool _loadingComments = false;
  bool _loadingEvidence = false;
  bool _loadingChecklists = false;
  bool _uploading = false;

  final _picker = ImagePicker();

  bool get _isEngineer => context.read<AuthProvider>().isEngineer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final provider = context.read<TicketsProvider>();
    final t = await provider.fetchTicketDetail(widget.ticketId);
    if (mounted) {
      setState(() {
        _ticket = t;
        _loading = false;
      });
      // Load comments & evidence for both company and engineer (both can view/reply/upload)
      _loadCommentsAndEvidence();
      if (_isEngineer) _loadChecklists();
    }
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

  Future<void> _loadChecklists() async {
    final provider = context.read<TicketsProvider>();
    setState(() => _loadingChecklists = true);
    final checklists = await provider.fetchChecklists();
    if (mounted) {
      setState(() {
        _checklists = checklists;
        _loadingChecklists = false;
      });
    }
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
      imageQuality: 80,
      maxWidth: 1920,
      maxHeight: 1920,
    );
    if (picked != null) await _uploadImageFromXFile(picked);
  }

  Future<void> _pickAndUploadFromCamera() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
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
          content: Text(ok ? l10n.t('ticket_completed') : l10n.t('complete_failed')),
          backgroundColor:
              ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      if (ok) await _load();
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
    final url = '${ApiConfig.baseUrl}/en/ticket/${t.id}';
    final text = 'Ticket: ${t.siteName ?? t.id}\n$url';
    await Share.share(text, subject: 'Ticket ${t.siteName ?? t.id}');
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

  DateTime? get _siteLastUpdated {
    final t = _ticket;
    if (t?.siteName == null) return null;
    try {
      for (final s in context.read<SitesProvider>().sites) {
        if (s.siteId == t!.siteName) return s.updatedAt;
      }
    } catch (_) {}
    return null;
  }

  /// NCR is resolved when engineer has approved the last resubmission (checklist reopened for re-inspection)
  bool _isNcrResolved(Ticket t) {
    if (!t.isNcr || t.ncrResubmissions.isEmpty) return false;
    return t.ncrResubmissions.last.action == 'approved';
  }

  /// Site coordinates for ticket's site (from SitesProvider lookup)
  ({double lat, double lng})? get _siteCoordinates {
    final t = _ticket;
    if (t?.siteName == null) return null;
    try {
      for (final s in context.read<SitesProvider>().sites) {
        if (s.siteId == t!.siteName && s.hasCoordinates) {
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

  List<Widget> _buildContent() {
    final t = _ticket!;
    final l10n = AppLocalizations.of(context);
    final fmt = DateFormat('MMM d, yyyy HH:mm');
    final isEngineer = _isEngineer;
    final isMyTicket = t.assignedEngineerId ==
        context.read<AuthProvider>().user?.id;
    final siteUpdated = _siteLastUpdated;

    return [
      // ─── Engineer action buttons ───
      if (isEngineer) ..._buildEngineerActions(t, isMyTicket, l10n),

      // Details
      _glassSection(l10n.t('details'), [
        _row(l10n.t('coordinator'), t.siteCoordinator ?? '-'),
        _row(l10n.t('technique_label'), _techniqueLabel(t.technique, l10n)),
        _row(l10n.t('sla'), t.slaHours != null ? '${t.slaHours} ${l10n.t('hours')}' : '-'),
        _row(l10n.t('created'), fmt.format(t.createdAt)),
        if (t.completedAt != null) _row(l10n.t('section_completed'), t.completedAt!),
        if (t.inspectionHours != null)
          _row(l10n.t('inspection_time'), _formatInspectionHoursDisplay(t.inspectionHours!, l10n)),
        if (siteUpdated != null)
          _row(l10n.t('site_last_updated'), _formatDateShort(siteUpdated)),
        if (_siteCoordinates != null)
          _row(l10n.t('site_coordinates'),
              '${_siteCoordinates!.lat.toStringAsFixed(6)}, ${_siteCoordinates!.lng.toStringAsFixed(6)}'),
      ]),

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
      if (t.isCompleted &&
          t.inspectionChecklist != null &&
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

      // Conflict button (company only, when result is not_accepted/ncr/accepted_with_comments)
      if (!isEngineer && t.isCompleted && t.isConflictResult) ...[
        const SizedBox(height: 16),
        _conflictButton(t, l10n),
      ],

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
          showUploadButtons: !t.isCompleted,
        ),
      ),
      if (isEngineer &&
          isMyTicket &&
          !t.isCompleted &&
          (!t.isNcr || _isNcrResolved(t))) ...[
        const SizedBox(height: 16),
        _glassContainer(
          ChecklistWidget(
            templates: _checklists,
            loading: _loadingChecklists,
            onComplete: _completeWithChecklist,
          ),
        ),
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

    if (t.canBeAssigned) {
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

  String _roleLabel(String role, AppLocalizations l10n) {
    switch (role.toUpperCase()) {
      case 'ENGINEER':
        return l10n.t('role_engineer');
      case 'COMPANY':
        return l10n.t('role_company');
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
          children: [
            const Icon(Icons.report_problem_rounded,
                color: Color(0xFFFBBF24), size: 22),
            const SizedBox(width: 10),
            Text(
              l10n.t('report_conflict'),
              style: const TextStyle(
                color: Color(0xFFFBBF24),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _reportConflict(Ticket t, AppLocalizations l10n) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('report_conflict'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          l10n.t('report_conflict_confirm'),
          style: TextStyle(color: Colors.white.withAlpha(200)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
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
    if (ok != true || !mounted) return;

    final conflictProv = context.read<ConflictsProvider>();
    final conflict = await conflictProv.reportConflict(t.id);
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
            : (r.action == 'approved'
                ? l10n.t('ncr_approved')
                : (r.action == 'rework' ? l10n.t('ncr_rework') : r.action));
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
            child: SizedBox(
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
                          final comment = await _showNcrReworkDialog(l10n);
                          if (comment == null || !mounted) return;
                          final ok = await context
                              .read<TicketsProvider>()
                              .submitNcrEngineerResponse(t.id, 'rework',
                                  comment: comment);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
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
                          final ok = await context
                              .read<TicketsProvider>()
                              .submitNcrEngineerResponse(t.id, 'approved');
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
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
    ctrl.dispose();
    return result;
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
    final upper = t.toUpperCase().replaceAll(' ', '_');
    if (upper.contains('INSPECTION')) return 'tech_inspection';
    if (upper.contains('SUPERVISION')) return 'tech_supervision';
    if (upper.contains('HSE')) return 'tech_hse';
    if (upper.contains('INVESTIGATION')) return 'tech_investigation';
    if (upper.contains('TRACKING')) return 'tech_tracking';
    return 'tech_inspection';
  }

  String _techniqueLabel(String t, AppLocalizations l10n) =>
      l10n.t(_techniqueKey(t));
}
