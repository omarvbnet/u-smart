import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../models/ticket.dart';
import '../models/comment.dart';
import '../models/evidence.dart';
import '../models/inspection_checklist.dart';
import '../providers/auth_provider.dart';
import '../providers/tickets_provider.dart';
import '../widgets/status_badge.dart';
import '../widgets/comments_widget.dart';
import '../widgets/checklist_widget.dart';
import '../widgets/evidence_upload_widget.dart';
import 'ncr_resubmit_screen.dart';

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
      if (_isEngineer) {
        _loadEngineerData();
      }
    }
  }

  Future<void> _loadEngineerData() async {
    final provider = context.read<TicketsProvider>();
    setState(() {
      _loadingComments = true;
      _loadingEvidence = true;
      _loadingChecklists = true;
    });
    final results = await Future.wait([
      provider.fetchComments(widget.ticketId),
      provider.fetchEvidence(widget.ticketId),
      provider.fetchChecklists(),
    ]);
    if (mounted) {
      setState(() {
        _comments = results[0] as List<TicketComment>;
        _evidence = results[1] as List<TicketEvidence>;
        _checklists = results[2] as List<InspectionChecklist>;
        _loadingComments = false;
        _loadingEvidence = false;
        _loadingChecklists = false;
      });
    }
  }

  Future<void> _assignToMe() async {
    setState(() => _assigning = true);
    final ok =
        await context.read<TicketsProvider>().assignTicketToMe(widget.ticketId);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'Ticket assigned to you!' : 'Failed to assign'),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok
              ? 'Status updated to ${_statusLabel(newStatus)}'
              : 'Failed to update status'),
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

  Future<void> _pickAndUploadImage() async {
    final picked =
        await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
    if (picked == null) return;
    await _uploadFile(picked.path, 'image');
  }

  Future<void> _pickAndUploadFile() async {
    final picked = await _picker.pickImage(
        source: ImageSource.gallery, imageQuality: 80);
    if (picked == null) return;
    await _uploadFile(picked.path, 'image');
  }

  Future<void> _uploadFile(String filePath, String fileType) async {
    setState(() => _uploading = true);
    final provider = context.read<TicketsProvider>();
    final url = await provider.uploadFile(filePath);
    if (url != null) {
      final evidence =
          await provider.addEvidence(widget.ticketId, url, fileType);
      if (evidence != null && mounted) {
        setState(() => _evidence = [evidence, ..._evidence]);
      }
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Failed to upload file'),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
    if (mounted) setState(() => _uploading = false);
  }

  Future<void> _completeWithChecklist(
      Map<String, dynamic> checklistResponse) async {
    final resultCtrl = TextEditingController();
    final commentsCtrl = TextEditingController();

    final data = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Complete Ticket',
            style:
                TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Add your inspection result before completing:',
                style: TextStyle(color: Colors.white.withAlpha(180)),
              ),
              const SizedBox(height: 16),
              _dialogDropdown(resultCtrl),
              const SizedBox(height: 12),
              TextField(
                controller: commentsCtrl,
                maxLines: 3,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Inspection comments (optional)',
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
            child: Text('Cancel',
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
                const Text('Complete', style: TextStyle(color: Colors.white)),
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
          content: Text(ok ? 'Ticket completed!' : 'Failed to complete'),
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

  Widget _dialogDropdown(TextEditingController ctrl) {
    final options = ['pass', 'fail', 'ncr', 'conditional_pass'];
    ctrl.text = 'pass';
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
          items: options.map((o) {
            return DropdownMenuItem(
                value: o, child: Text(_statusLabel(o)));
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
              ? const Center(
                  child: Text('Ticket not found',
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

  SliverAppBar _buildAppBar() {
    final t = _ticket!;
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: const Color(0xFF05051A),
      foregroundColor: Colors.white,
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
                          t.siteName ?? 'Unknown Site',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      StatusBadge(status: t.status, fontSize: 13),
                    ],
                  ),
                  if (t.isAssigned) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.person, size: 14, color: _accentColor),
                        const SizedBox(width: 4),
                        Text(
                          'Assigned to ${t.assignedEngineerName}',
                          style: TextStyle(
                            color: _accentColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
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

  List<Widget> _buildContent() {
    final t = _ticket!;
    final fmt = DateFormat('MMM d, yyyy HH:mm');
    final isEngineer = _isEngineer;
    final isMyTicket = t.assignedEngineerId ==
        context.read<AuthProvider>().user?.id;

    return [
      // ─── Engineer action buttons ───
      if (isEngineer) ..._buildEngineerActions(t, isMyTicket),

      // Details
      _glassSection('Details', [
        _row('Coordinator', t.siteCoordinator ?? '-'),
        _row('Technique', _techniqueName(t.technique)),
        _row('SLA', t.slaHours != null ? '${t.slaHours} hours' : '-'),
        _row('Created', fmt.format(t.createdAt)),
        if (t.completedAt != null) _row('Completed', t.completedAt!),
      ]),

      if (t.inspectionResult != null) ...[
        const SizedBox(height: 16),
        _glassSection('Inspection Result', [
          _row('Result', _techniqueName(t.inspectionResult!)),
          if (t.inspectionComments != null)
            _row('Comments', t.inspectionComments!),
        ]),
      ],

      if (t.isNcr) ...[
        const SizedBox(height: 16),
        _ncrSection(t),
      ],

      const SizedBox(height: 16),
      _timelineSection(t),

      // ─── Engineer management sections ───
      if (isEngineer && (t.isAssigned || t.isPending)) ...[
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
          ),
        ),
        if (isMyTicket && !t.isCompleted) ...[
          const SizedBox(height: 16),
          _glassContainer(
            ChecklistWidget(
              templates: _checklists,
              loading: _loadingChecklists,
              onComplete: _completeWithChecklist,
            ),
          ),
        ],
      ],

      if (t.designSpecifications != null &&
          t.designSpecifications!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection('Design Specifications', [
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
      const SizedBox(height: 40),
    ];
  }

  List<Widget> _buildEngineerActions(Ticket t, bool isMyTicket) {
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
                  'Complete your current ticket before assigning a new one',
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
          label: 'Assign to Me',
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
          label: 'Start Inspection',
          gradient: const [Color(0xFF00D4AA), Color(0xFF00B894)],
          loading: _updatingStatus,
          onTap: () => _updateStatus('IN_PROGRESS'),
        ));
        widgets.add(const SizedBox(height: 12));
      }

      // Status stepper
      widgets.add(_buildStatusStepper(t));
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
            const Text(
              'Ticket Completed',
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

  Widget _buildStatusStepper(Ticket t) {
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
            'TICKET PROGRESS',
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
                _statusLabel(s),
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

  Widget _ncrSection(Ticket t) {
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
                const Text(
                  'NCR Report',
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
                'Resubmissions (${t.ncrResubmissions.length})',
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
                          '${r.action} - ${r.comment ?? 'No comment'}',
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
                label: const Text('Resubmit',
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

  Widget _timelineSection(Ticket t) {
    return _glassSection('Status Timeline', [
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

  String _statusLabel(String s) {
    switch (s.toUpperCase()) {
      case 'PENDING':
        return 'Pending';
      case 'ON_SITE':
        return 'On Site';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'ACCEPTED':
        return 'Accepted';
      case 'ACCEPTED_WITH_COMMENTS':
        return 'Accepted with Comments';
      case 'NOT_ACCEPTED':
        return 'Not Accepted';
      case 'NCR':
        return 'NCR';
      case 'PASS':
        return 'Pass';
      case 'FAIL':
        return 'Fail';
      case 'CONDITIONAL_PASS':
        return 'Conditional Pass';
      default:
        return s.replaceAll('_', ' ').split(' ').map((w) {
          if (w.isEmpty) return w;
          return w[0].toUpperCase() + w.substring(1).toLowerCase();
        }).join(' ');
    }
  }

  String _techniqueName(String t) {
    return t.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }
}
