import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../utils/share_position_origin.dart';
import '../widgets/ticket_card.dart';
import '../widgets/workspace_site_detail_sheet.dart';
import 'site_form_screen.dart';
import 'ticket_detail_screen.dart';

/// Full-screen list of all tickets related to a single [site], with rich
/// filtering (search / status / type / date range) and a CSV (Excel) export
/// of the currently-filtered rows. Opened when a site is tapped.
class SiteTicketsScreen extends StatefulWidget {
  final Site site;
  const SiteTicketsScreen({super.key, required this.site});

  @override
  State<SiteTicketsScreen> createState() => _SiteTicketsScreenState();
}

class _SiteTicketsScreenState extends State<SiteTicketsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _statusFilter = 'all';
  String _typeFilter = 'all'; // all | maintenance | inspection
  DateTimeRange? _dateRange;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<TicketsProvider>();
      if (provider.tickets.isEmpty && !provider.loading) {
        provider.fetchTickets();
      }
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  String get _siteCode => widget.site.siteId.trim().toLowerCase();

  List<Ticket> _siteTickets(List<Ticket> all) {
    final code = _siteCode;
    if (code.isEmpty) return const [];
    return all
        .where((t) => (t.siteName ?? '').trim().toLowerCase() == code)
        .toList();
  }

  List<Ticket> _applyFilters(List<Ticket> siteTickets) {
    Iterable<Ticket> list = siteTickets;

    if (_statusFilter != 'all') {
      list = list.where((t) => t.status.toUpperCase() == _statusFilter);
    }
    if (_typeFilter == 'maintenance') {
      list = list.where((t) => t.isMaintenance);
    } else if (_typeFilter == 'inspection') {
      list = list.where((t) => !t.isMaintenance);
    }
    if (_dateRange != null) {
      final start = DateTime(
          _dateRange!.start.year, _dateRange!.start.month, _dateRange!.start.day);
      final end = DateTime(_dateRange!.end.year, _dateRange!.end.month,
          _dateRange!.end.day, 23, 59, 59);
      list = list.where(
          (t) => !t.createdAt.isBefore(start) && !t.createdAt.isAfter(end));
    }
    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      list = list.where((t) {
        return (t.siteName ?? '').toLowerCase().contains(q) ||
            (t.siteCoordinator ?? '').toLowerCase().contains(q) ||
            (t.assignedEngineerName ?? '').toLowerCase().contains(q) ||
            t.technique.toLowerCase().contains(q) ||
            t.status.toLowerCase().contains(q) ||
            t.id.toLowerCase().contains(q);
      });
    }
    final result = list.toList();
    result.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return result;
  }

  List<String> _statusOptions(List<Ticket> siteTickets) {
    final set = <String>{};
    for (final t in siteTickets) {
      if (t.status.trim().isNotEmpty) set.add(t.status.toUpperCase());
    }
    final list = set.toList()..sort();
    return ['all', ...list];
  }

  String _statusLabel(AppLocalizations l10n, String s) {
    if (s == 'all') return l10n.t('st_all');
    return s.replaceAll('_', ' ');
  }

  void _openSiteInfo() {
    final site = widget.site;
    if (site.isWorkspace && site.workspaceSiteId != null) {
      showWorkspaceSiteDetailSheet(context, site.workspaceSiteId!);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SiteFormScreen(site: site, readOnly: !site.canEdit),
      ),
    );
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1),
      initialDateRange: _dateRange,
    );
    if (picked != null) setState(() => _dateRange = picked);
  }

  String _fmtDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _csvCell(String? value) {
    final v = value ?? '';
    if (v.contains(',') || v.contains('"') || v.contains('\n')) {
      return '"${v.replaceAll('"', '""')}"';
    }
    return v;
  }

  Future<void> _export(List<Ticket> rows, BuildContext btnContext) async {
    final l10n = AppLocalizations.of(context);
    if (rows.isEmpty) return;
    setState(() => _exporting = true);
    final shareOrigin = sharePositionOriginForShareSheet(btnContext);
    try {
      final headers = [
        'Ticket ID',
        'Site',
        'Coordinator',
        'Type',
        'Status',
        'Technique',
        'Created',
        'Completed',
        'Assigned',
        'Assigned phone',
        'SLA hours',
        'Inspection result',
      ];
      final buffer = StringBuffer();
      buffer.writeln(headers.map(_csvCell).join(','));
      for (final t in rows) {
        final cells = [
          t.id,
          t.siteName ?? '',
          t.siteCoordinator ?? '',
          t.isMaintenance
              ? l10n.t('ticket_type_maintenance')
              : l10n.t('ticket_type_inspection'),
          t.status,
          t.technique,
          _fmtDate(t.createdAt),
          t.completedAt ?? '',
          t.assignedEngineerName ?? '',
          t.assignedEngineerPhone ?? '',
          t.slaHours?.toString() ?? '',
          t.inspectionResult ?? '',
        ];
        buffer.writeln(cells.map((c) => _csvCell(c)).join(','));
      }
      // BOM so Excel opens UTF-8 (Arabic/Kurdish) correctly.
      final csv = '\uFEFF${buffer.toString()}';
      final dir = await getTemporaryDirectory();
      final safeCode = widget.site.siteId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
      final file = File(
          '${dir.path}/site-${safeCode.isEmpty ? 'tickets' : safeCode}-${_fmtDate(DateTime.now())}.csv');
      await file.writeAsString(csv);
      await Share.shareXFiles(
        [XFile(file.path)],
        text: '${widget.site.siteId} tickets',
        sharePositionOrigin: shareOrigin,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.t('st_export_failed'))),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A0F),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.site.siteId,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text(
              l10n.t('st_title'),
              style: TextStyle(
                  fontSize: 11, color: Colors.white.withAlpha(120)),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: l10n.t('st_site_info'),
            icon: const Icon(Icons.info_outline_rounded),
            onPressed: _openSiteInfo,
          ),
        ],
      ),
      body: Consumer<TicketsProvider>(
        builder: (context, provider, _) {
          final siteTickets = _siteTickets(provider.tickets);
          final filtered = _applyFilters(siteTickets);
          final statusOptions = _statusOptions(siteTickets);
          if (!statusOptions.contains(_statusFilter)) {
            _statusFilter = 'all';
          }
          return Column(
            children: [
              _buildFilters(l10n, statusOptions, filtered.length, siteTickets.length),
              Expanded(
                child: provider.loading && provider.tickets.isEmpty
                    ? const Center(
                        child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
                    : filtered.isEmpty
                        ? _emptyState(l10n, siteTickets.isEmpty)
                        : RefreshIndicator(
                            color: const Color(0xFF6C63FF),
                            backgroundColor: const Color(0xFF1A1A24),
                            onRefresh: () => provider.fetchTickets(),
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                              itemCount: filtered.length,
                              itemBuilder: (context, i) {
                                final ticket = filtered[i];
                                return TicketCard(
                                  ticket: ticket,
                                  showAssignToMe: false,
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => TicketDetailScreen(
                                          ticketId: ticket.id),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
              ),
              _buildExportBar(l10n, filtered),
            ],
          );
        },
      ),
    );
  }

  Widget _emptyState(AppLocalizations l10n, bool noneAtAll) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.confirmation_number_outlined,
                size: 48, color: Colors.white.withAlpha(40)),
            const SizedBox(height: 12),
            Text(
              noneAtAll ? l10n.t('st_no_tickets') : l10n.t('st_no_match'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters(AppLocalizations l10n, List<String> statusOptions,
      int shown, int total) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(
        children: [
          // Search
          TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _search = v),
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: InputDecoration(
              isDense: true,
              hintText: l10n.t('st_search_hint'),
              hintStyle: TextStyle(color: Colors.white.withAlpha(70)),
              prefixIcon:
                  Icon(Icons.search, color: Colors.white.withAlpha(90), size: 20),
              suffixIcon: _search.isEmpty
                  ? null
                  : IconButton(
                      icon: Icon(Icons.close,
                          color: Colors.white.withAlpha(90), size: 18),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _search = '');
                      },
                    ),
              filled: true,
              fillColor: Colors.white.withAlpha(10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _statusDropdown(l10n, statusOptions),
                const SizedBox(width: 8),
                _typeChip(l10n, 'all', l10n.t('st_all')),
                const SizedBox(width: 6),
                _typeChip(
                    l10n, 'maintenance', l10n.t('ticket_type_maintenance')),
                const SizedBox(width: 6),
                _typeChip(
                    l10n, 'inspection', l10n.t('ticket_type_inspection')),
                const SizedBox(width: 8),
                _dateChip(l10n),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              l10n.t('st_count', {'shown': '$shown', 'total': '$total'}),
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusDropdown(AppLocalizations l10n, List<String> options) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _statusFilter,
          dropdownColor: const Color(0xFF1A1A24),
          isDense: true,
          icon: Icon(Icons.arrow_drop_down, color: Colors.white.withAlpha(120)),
          style: const TextStyle(color: Colors.white, fontSize: 13),
          items: options
              .map((s) => DropdownMenuItem(
                    value: s,
                    child: Text(_statusLabel(l10n, s)),
                  ))
              .toList(),
          onChanged: (v) => setState(() => _statusFilter = v ?? 'all'),
        ),
      ),
    );
  }

  Widget _typeChip(AppLocalizations l10n, String value, String label) {
    final selected = _typeFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _typeFilter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFF6C63FF).withAlpha(50)
              : Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected
                ? const Color(0xFF6C63FF)
                : Colors.white.withAlpha(15),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : Colors.white.withAlpha(160),
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }

  Widget _dateChip(AppLocalizations l10n) {
    final active = _dateRange != null;
    return GestureDetector(
      onTap: _pickDateRange,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active
              ? const Color(0xFF00D4AA).withAlpha(40)
              : Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active
                ? const Color(0xFF00D4AA)
                : Colors.white.withAlpha(15),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.date_range,
                size: 16,
                color: active
                    ? const Color(0xFF00D4AA)
                    : Colors.white.withAlpha(160)),
            const SizedBox(width: 6),
            Text(
              active
                  ? '${_fmtDate(_dateRange!.start)} → ${_fmtDate(_dateRange!.end)}'
                  : l10n.t('st_date_range'),
              style: TextStyle(
                color: active ? Colors.white : Colors.white.withAlpha(160),
                fontSize: 13,
              ),
            ),
            if (active) ...[
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () => setState(() => _dateRange = null),
                child: Icon(Icons.close,
                    size: 14, color: Colors.white.withAlpha(160)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildExportBar(AppLocalizations l10n, List<Ticket> filtered) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
        child: Builder(
          builder: (btnContext) => SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _exporting || filtered.isEmpty
                  ? null
                  : () => _export(filtered, btnContext),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00B894),
                disabledBackgroundColor: Colors.white.withAlpha(15),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              icon: _exporting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.file_download_outlined,
                      color: Colors.white, size: 20),
              label: Text(
                l10n.t('st_export_excel'),
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
