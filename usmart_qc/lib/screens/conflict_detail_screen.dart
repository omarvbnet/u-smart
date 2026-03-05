import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../models/conflict.dart';
import '../models/evidence.dart';
import '../providers/auth_provider.dart';
import '../providers/conflicts_provider.dart';
import '../providers/tickets_provider.dart';
import '../config/api_config.dart';
import 'attachment_viewer_screen.dart';
import 'ticket_detail_screen.dart';

class ConflictDetailScreen extends StatefulWidget {
  final String conflictId;

  const ConflictDetailScreen({super.key, required this.conflictId});

  @override
  State<ConflictDetailScreen> createState() => _ConflictDetailScreenState();
}

class _ConflictDetailScreenState extends State<ConflictDetailScreen> {
  bool _resolving = false;
  List<TicketEvidence>? _evidence;
  bool _evidenceLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ConflictsProvider>().fetchConflictDetail(widget.conflictId);
    });
  }

  Future<void> _loadEvidence(String ticketId) async {
    if (_evidence != null || _evidenceLoading) return;
    setState(() => _evidenceLoading = true);
    final list = await context.read<TicketsProvider>().fetchEvidence(ticketId);
    if (mounted) {
      setState(() {
        _evidence = list;
        _evidenceLoading = false;
      });
    }
  }

  Future<void> _showChangeResultSheet(AppLocalizations l10n) async {
    final result = await showModalBottomSheet<String>(
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('change_result'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              _sheetOption(ctx, l10n.t('accepted'), 'accepted'),
              _sheetOption(ctx, l10n.t('not_accepted'), 'not_accepted'),
              _sheetOption(ctx, l10n.t('ncr'), 'ncr'),
              _sheetOption(ctx, l10n.t('accepted_with_comments'), 'accepted_with_comments'),
            ],
          ),
        ),
      ),
    );
    if (result != null && mounted) await _resolve(result);
  }

  Widget _sheetOption(BuildContext ctx, String label, String value) {
    return ListTile(
      title: Text(label, style: const TextStyle(color: Colors.white)),
      onTap: () => Navigator.pop(ctx, value),
    );
  }

  String _resultLabel(String r, AppLocalizations l10n) {
    final lower = r.toLowerCase();
    if (lower == 'not_accepted') return l10n.t('not_accepted');
    if (lower == 'ncr') return l10n.t('ncr');
    if (lower == 'accepted_with_comments') return l10n.t('accepted_with_comments');
    if (lower == 'accepted') return l10n.t('accepted');
    if (lower == 'maintenance') return l10n.t('ticket_type_maintenance');
    return r;
  }

  String _resolutionOutcomeText(ConflictCase c, AppLocalizations l10n) {
    final r = (c.resolution ?? '').toLowerCase();
    if (r == 're_inspection') return l10n.t('resolution_re_inspection');
    if (r == 'keep_same') return l10n.t('resolution_keep_same');
    if (r == 're_maintain') return l10n.t('re_maintain');
    if (r == 'no_need') return l10n.t('no_need');
    if (r == 'accepted' || r == 'not_accepted' || r == 'ncr' || r == 'accepted_with_comments') {
      return '${l10n.t('resolution_changed_to')} ${_resultLabel(r, l10n)}';
    }
    return l10n.t('resolved');
  }

  Widget _resolutionOutcomeSection(ConflictCase c, AppLocalizations l10n) {
    final text = _resolutionOutcomeText(c, l10n);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF00D4AA).withAlpha(15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF00D4AA).withAlpha(40)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.check_circle_rounded,
                  color: Color(0xFF00D4AA), size: 24),
              const SizedBox(width: 12),
              Text(
                l10n.t('resolved'),
                style: const TextStyle(
                  color: Color(0xFF00D4AA),
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withAlpha(200),
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _resolve(String resolution) async {
    setState(() => _resolving = true);
    final provider = context.read<ConflictsProvider>();
    final success = await provider.resolveConflict(widget.conflictId, resolution);
    if (mounted) {
      setState(() => _resolving = false);
      final l10n = AppLocalizations.of(context);
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('conflict_resolved')),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        context.read<TicketsProvider>().fetchTickets();
        if (mounted) Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('conflict_resolve_failed')),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
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
          l10n.t('conflict'),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_new_rounded, color: Colors.white),
            onPressed: () {
              final c = context.read<ConflictsProvider>().selectedConflict;
              if (c != null) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TicketDetailScreen(ticketId: c.ticketId),
                  ),
                );
              }
            },
          ),
        ],
      ),
      body: Consumer<ConflictsProvider>(
        builder: (context, provider, _) {
          final c = provider.selectedConflict;
          if (provider.loading && c == null) {
            return const Center(
              child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
            );
          }
          if (c == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline_rounded,
                        size: 48, color: Colors.white.withAlpha(120)),
                    const SizedBox(height: 16),
                    Text(
                      l10n.t('conflict_load_failed'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(180),
                        fontSize: 16,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          if (!c.isMaintenanceConflict && _evidence == null && !_evidenceLoading) {
            _loadEvidence(c.ticketId);
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (c.conflictReportComment != null &&
                    c.conflictReportComment!.isNotEmpty) ...[
                  _glassSection(l10n.t('conflict_description'), [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        c.conflictReportComment!,
                        style: TextStyle(
                          color: Colors.white.withAlpha(220),
                          fontSize: 15,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 16),
                ],
                _glassSection(l10n.t('details'), [
                  _row(l10n.t('ticket_id'), c.ticketId),
                  _row(l10n.t('site_name'), c.siteName ?? '-'),
                  _row(l10n.t('coordinator'), c.siteCoordinator ?? '-'),
                  _row(l10n.t('result'), _resultLabel(c.inspectionResult, l10n)),
                  if (c.inspectionComments != null)
                    _row(l10n.t('comments'), c.inspectionComments!),
                  if (c.ncrReason != null)
                    _row(l10n.t('ncr_report'), c.ncrReason!),
                  if (c.assignedEngineerName != null)
                    _row(l10n.t('engineer'), c.assignedEngineerName!),
                ]),

                if (!context.read<AuthProvider>().isAdmin &&
                    c.isPending) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
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
                  ),
                ],

                if (c.isMaintenanceConflict &&
                    c.conflictImageUrls.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _glassSection(l10n.t('conflict_evidence'), [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: c.conflictImageUrls.map((url) {
                          final displayUrl = url.startsWith('http')
                              ? url
                              : (url.startsWith('/')
                                  ? '${ApiConfig.baseUrl}$url'
                                  : '${ApiConfig.baseUrl}/$url');
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
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.network(
                                displayUrl,
                                width: 100,
                                height: 100,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  width: 100,
                                  height: 100,
                                  color: const Color(0xFF12122A),
                                  child: Icon(
                                    Icons.broken_image_rounded,
                                    color: Colors.white.withAlpha(100),
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 16),
                ],
                if (!c.isMaintenanceConflict &&
                    _evidence != null &&
                    _evidence!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _glassSection(l10n.t('conflict_evidence'), [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: _evidence!.map((e) {
                          return GestureDetector(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => AttachmentViewerScreen(
                                  url: e.fileUrl,
                                  label: e.description ?? e.fileUrl.split('/').last,
                                ),
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: e.isImage
                                  ? Image.network(
                                      e.fileUrl,
                                      width: 100,
                                      height: 100,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Container(
                                        width: 100,
                                        height: 100,
                                        color: const Color(0xFF12122A),
                                        child: Icon(
                                          Icons.broken_image_rounded,
                                          color: Colors.white.withAlpha(100),
                                        ),
                                      ),
                                    )
                                  : Container(
                                      width: 100,
                                      height: 100,
                                      color: const Color(0xFF12122A),
                                      child: const Icon(
                                        Icons.picture_as_pdf_rounded,
                                        color: Color(0xFF6C63FF),
                                        size: 40,
                                      ),
                                    ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 16),
                ],
                if (_evidenceLoading) ...[
                  const SizedBox(height: 16),
                  const Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFF6C63FF),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (!c.isMaintenanceConflict &&
                    c.inspectionChecklist != null &&
                    c.inspectionChecklist!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _glassSection(l10n.t('inspection_checklist'), [
                    ...c.inspectionChecklist!.map((item) {
                      final label = item['label'] as String? ?? '';
                      final result =
                          item['result'] as String? ??
                          (item['checked'] == true ? 'accepted' : 'rejected');
                      final isAccepted = result == 'accepted';
                      final comment = item['comment'] as String?;
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
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
                                    ),
                                  ),
                                ),
                                Text(
                                  isAccepted
                                      ? l10n.t('accept')
                                      : l10n.t('reject'),
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isAccepted
                                        ? const Color(0xFF00D4AA)
                                        : const Color(0xFFFF6B81),
                                  ),
                                ),
                              ],
                            ),
                            if (comment != null && comment.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(left: 28, top: 4),
                                child: Text(
                                  comment,
                                  style: TextStyle(
                                    color: Colors.white.withAlpha(140),
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                  ]),
                ],

                if (c.isPending && context.read<AuthProvider>().isAdmin) ...[
                  const SizedBox(height: 24),
                  Text(
                    l10n.t('resolve_conflict'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (c.isMaintenanceConflict) ...[
                    _actionTile(
                      icon: Icons.build_circle_outlined,
                      label: l10n.t('re_maintain'),
                      subtitle: l10n.t('re_maintain'),
                      color: const Color(0xFF6C63FF),
                      onTap: _resolving ? null : () => _resolve('re_maintain'),
                    ),
                    const SizedBox(height: 8),
                    _actionTile(
                      icon: Icons.check_circle_outline_rounded,
                      label: l10n.t('no_need'),
                      subtitle: l10n.t('no_need'),
                      color: const Color(0xFF4ADE80),
                      onTap: _resolving ? null : () => _resolve('no_need'),
                    ),
                  ] else ...[
                    _actionTile(
                      icon: Icons.edit_rounded,
                      label: l10n.t('change_result'),
                      subtitle: l10n.t('accepted'),
                      color: const Color(0xFF4ADE80),
                      onTap: _resolving ? null : () => _showChangeResultSheet(l10n),
                    ),
                    const SizedBox(height: 8),
                    _actionTile(
                      icon: Icons.refresh_rounded,
                      label: l10n.t('re_inspection'),
                      subtitle: l10n.t('re_inspection'),
                      color: const Color(0xFF6C63FF),
                      onTap: _resolving ? null : () => _resolve('re_inspection'),
                    ),
                    const SizedBox(height: 8),
                    _actionTile(
                      icon: Icons.check_circle_outline_rounded,
                      label: l10n.t('keep_same'),
                      subtitle: l10n.t('resolved'),
                      color: const Color(0xFF9CA3AF),
                      onTap: _resolving ? null : () => _resolve('keep_same'),
                    ),
                  ],
                  if (_resolving)
                    const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Center(
                        child: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Color(0xFF6C63FF)),
                        ),
                      ),
                    ),
                ],
                if (!c.isPending) ...[
                  const SizedBox(height: 16),
                  _resolutionOutcomeSection(c, l10n),
                ],
                const SizedBox(height: 40),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _glassSection(String title, List<Widget> children) {
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
            title.toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(100),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.white.withAlpha(100),
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionTile({
    required IconData icon,
    required String label,
    required String subtitle,
    required Color color,
    VoidCallback? onTap,
  }) {
    return Material(
      color: color.withAlpha(15),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.white.withAlpha(120),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward_ios_rounded,
                  size: 14, color: color.withAlpha(150)),
            ],
          ),
        ),
      ),
    );
  }
}
