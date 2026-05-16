import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../utils/share_position_origin.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../widgets/qfield_project_map_sheet.dart';

/// Field workspace for QField / QGIS project packages on a ticket (read + optional write).
class TicketQFieldWorkspaceScreen extends StatefulWidget {
  const TicketQFieldWorkspaceScreen({
    super.key,
    required this.ticketId,
    this.initialTicket,
    required this.canWrite,
  });

  final String ticketId;
  final Ticket? initialTicket;
  final bool canWrite;

  @override
  State<TicketQFieldWorkspaceScreen> createState() =>
      _TicketQFieldWorkspaceScreenState();
}

class _TicketQFieldWorkspaceScreenState extends State<TicketQFieldWorkspaceScreen> {
  Ticket? _ticket;
  List<QFieldProject> _projects = const [];
  bool _loading = true;
  String? _busyProjectId;

  @override
  void initState() {
    super.initState();
    _ticket = widget.initialTicket;
    _projects = widget.initialTicket?.qfieldProjects ?? const [];
    _load();
  }

  String _resolveUrl(String url) {
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return '${ApiConfig.baseUrl}$url';
    return '${ApiConfig.baseUrl}/$url';
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final t = await context.read<TicketsProvider>().fetchTicketDetail(widget.ticketId);
    if (!mounted) return;
    setState(() {
      _ticket = t;
      _projects = t?.qfieldProjects ?? const [];
      _loading = false;
    });
  }

  Future<void> _openUrl(String url) async {
    final u = Uri.tryParse(_resolveUrl(url));
    if (u == null) return;
    if (!await launchUrl(u, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).t('qfield_open_failed'))),
        );
      }
    }
  }

  Future<void> _copyLink(String url) async {
    await Clipboard.setData(ClipboardData(text: _resolveUrl(url)));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(AppLocalizations.of(context).t('qfield_link_copied')),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _shareLink(String url, String label) async {
    await Share.share(
      '${label.trim()}\n${_resolveUrl(url)}',
      sharePositionOrigin: sharePositionOriginForShareSheet(context),
    );
  }

  void _openMapSheet(QFieldProject p) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.9,
        minChildSize: 0.45,
        maxChildSize: 0.96,
        builder: (_, __) => QFieldProjectMapSheet(
          ticketId: widget.ticketId,
          project: p,
          ticket: _ticket,
          canWrite: widget.canWrite,
          onSaved: () {
            _load();
          },
        ),
      ),
    );
  }

  Future<void> _uploadRevision(QFieldProject project) async {
    final l10n = AppLocalizations.of(context);
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

    setState(() => _busyProjectId = project.id);
    try {
      final prov = context.read<TicketsProvider>();
      String? url;
      if (bytes != null && bytes.isNotEmpty) {
        url = await prov.uploadQFieldPackageFromBytes(bytes, filename);
      } else if (path != null && path.isNotEmpty) {
        url = await prov.uploadQFieldPackageFromPath(path);
      }
      if (url == null || !mounted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.t('upload_failed'))),
          );
        }
        return;
      }

      final note = await _promptNote(l10n.t('qfield_revision_note_hint'));
      if (!mounted) return;

      final res = await prov.postTicketQFieldAction(widget.ticketId, {
        'action': 'add_revision',
        'projectId': project.id,
        'url': url,
        'fileName': filename,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      });
      if (!mounted) return;
      if (res.ok && res.projects != null) {
        setState(() => _projects = res.projects!);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.t('qfield_revision_saved'))),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res.message ?? l10n.t('ticket_failed'))),
        );
      }
    } finally {
      if (mounted) setState(() => _busyProjectId = null);
    }
  }

  Future<String?> _promptNote(String hint) async {
    final ctrl = TextEditingController();
    final out = await showDialog<String?>(
      context: context,
      builder: (ctx) {
        final loc = AppLocalizations.of(ctx);
        return AlertDialog(
          backgroundColor: const Color(0xFF12122A),
          title: Text(loc.t('qfield_revision_note_title'),
              style: const TextStyle(color: Colors.white)),
          content: TextField(
            controller: ctrl,
            maxLines: 3,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, null),
              child: Text(loc.t('cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: Text(loc.t('ok')),
            ),
          ],
        );
      },
    );
    ctrl.dispose();
    return out;
  }

  Future<void> _editMeta(QFieldProject project) async {
    final l10n = AppLocalizations.of(context);
    final titleCtrl = TextEditingController(text: project.title);
    final descCtrl = TextEditingController(text: project.description ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final loc = AppLocalizations.of(ctx);
        return AlertDialog(
          backgroundColor: const Color(0xFF12122A),
          title: Text(loc.t('qfield_edit_meta_title'),
              style: const TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: loc.t('qfield_project_title'),
                    labelStyle: TextStyle(color: Colors.white.withAlpha(180)),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  maxLines: 4,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: loc.t('qfield_project_description'),
                    labelStyle: TextStyle(color: Colors.white.withAlpha(180)),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(loc.t('cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(loc.t('ok')),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) {
      titleCtrl.dispose();
      descCtrl.dispose();
      return;
    }

    setState(() => _busyProjectId = project.id);
    try {
      final res = await context.read<TicketsProvider>().postTicketQFieldAction(
            widget.ticketId,
            {
              'action': 'update_meta',
              'projectId': project.id,
              'title': titleCtrl.text.trim(),
              'description': descCtrl.text.trim(),
            },
          );
      titleCtrl.dispose();
      descCtrl.dispose();
      if (!mounted) return;
      if (res.ok && res.projects != null) {
        setState(() => _projects = res.projects!);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.t('qfield_meta_saved'))),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res.message ?? l10n.t('ticket_failed'))),
        );
      }
    } finally {
      if (mounted) setState(() => _busyProjectId = null);
    }
  }

  String _fmtTime(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return DateFormat.yMMMd().add_Hm().format(d.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final site = _ticket?.siteName ?? '';

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(l10n.t('ticket_qfield_workspace')),
        actions: [
          IconButton(
            tooltip: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: _loading && _projects.isEmpty
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
          : RefreshIndicator(
              color: const Color(0xFF6C63FF),
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFF1A3A2E).withAlpha(220),
                          const Color(0xFF12122A),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(color: const Color(0xFF00D4AA).withAlpha(60)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFF00D4AA).withAlpha(35),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(Icons.map_rounded,
                              color: Color(0xFF00D4AA), size: 28),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.t('ticket_qfield_hero_title'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                site.isEmpty
                                    ? l10n.t('ticket_qfield_hero_body')
                                    : '${l10n.t('ticket_qfield_hero_site')}: $site',
                                style: TextStyle(
                                  color: Colors.white.withAlpha(160),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_projects.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 48),
                      child: Center(
                        child: Text(
                          l10n.t('ticket_qfield_empty'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withAlpha(140)),
                        ),
                      ),
                    )
                  else
                    ..._projects.map((p) => _projectCard(context, l10n, p)),
                ],
              ),
            ),
    );
  }

  Widget _projectCard(BuildContext context, AppLocalizations l10n, QFieldProject p) {
    final ext = p.fileName.contains('.')
        ? p.fileName.split('.').last.toUpperCase()
        : 'FILE';
    final busy = _busyProjectId == p.id;
    final revs = List<QFieldRevision>.from(p.revisions)
      ..sort((a, b) => b.at.compareTo(a.at));

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (p.description != null && p.description!.trim().isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            p.description!.trim(),
                            style: TextStyle(
                              color: Colors.white.withAlpha(150),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF).withAlpha(40),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      ext,
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                p.fileName,
                style: TextStyle(
                  color: Colors.white.withAlpha(120),
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${l10n.t('qfield_revisions')}: ${p.revisions.length} · ${l10n.t('qfield_updated')}: ${_fmtTime(p.updatedAt)}',
                style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 11),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chipButton(
                    icon: Icons.open_in_new_rounded,
                    label: l10n.t('qfield_open_external'),
                    onTap: busy ? null : () => _openUrl(p.currentUrl),
                  ),
                  _chipButton(
                    icon: Icons.link_rounded,
                    label: l10n.t('qfield_copy_link'),
                    onTap: busy ? null : () => _copyLink(p.currentUrl),
                  ),
                  _chipButton(
                    icon: Icons.share_rounded,
                    label: l10n.t('qfield_share'),
                    onTap: busy ? null : () => _shareLink(p.currentUrl, p.title),
                  ),
                  _chipButton(
                    icon: Icons.map_outlined,
                    label: l10n.t('qfield_map_title'),
                    onTap: busy ? null : () => _openMapSheet(p),
                  ),
                  if (widget.canWrite) ...[
                    _chipButton(
                      icon: Icons.upload_file_rounded,
                      label: l10n.t('qfield_add_revision'),
                      onTap: busy ? null : () => _uploadRevision(p),
                      primary: true,
                    ),
                    _chipButton(
                      icon: Icons.edit_note_rounded,
                      label: l10n.t('qfield_edit_meta'),
                      onTap: busy ? null : () => _editMeta(p),
                    ),
                  ],
                ],
              ),
              if (revs.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  l10n.t('qfield_timeline'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(140),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                ...revs.take(12).map((r) => _revisionTile(l10n, r)),
              ],
              if (busy)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: LinearProgressIndicator(color: Color(0xFF6C63FF)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _revisionTile(AppLocalizations l10n, QFieldRevision r) {
    final who = (r.byName != null && r.byName!.trim().isNotEmpty)
        ? r.byName!.trim()
        : l10n.t('qfield_unknown_author');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.history_rounded, size: 16, color: Colors.white.withAlpha(100)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_fmtTime(r.at)} · $who',
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
                Text(
                  r.fileName,
                  style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
                ),
                if (r.note != null && r.note!.trim().isNotEmpty)
                  Text(
                    r.note!.trim(),
                    style: const TextStyle(color: Color(0xFF8B83FF), fontSize: 11),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chipButton({
    required IconData icon,
    required String label,
    required VoidCallback? onTap,
    bool primary = false,
  }) {
    final bg = primary
        ? const Color(0xFF6C63FF).withAlpha(45)
        : Colors.white.withAlpha(12);
    final fg = primary ? const Color(0xFF8B83FF) : Colors.white.withAlpha(200);
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
