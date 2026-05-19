import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/workspace_site.dart';
import '../providers/private_company_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/workspace_sites_provider.dart';
import '../widgets/qfield_project_map_sheet.dart';
import 'qfield_project_map_screen.dart';
import 'ticket_detail_screen.dart';

/// Workspace sites — shared with all staff; map pins from QField coordinates only.
class WorkspaceSitesTab extends StatefulWidget {
  const WorkspaceSitesTab({super.key});

  @override
  State<WorkspaceSitesTab> createState() => _WorkspaceSitesTabState();
}

class _WorkspaceSitesTabState extends State<WorkspaceSitesTab> {
  final _search = TextEditingController();
  bool _showMap = false;
  String _ticketFilter = 'all';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WorkspaceSitesProvider>().fetchSites();
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _openForm({WorkspaceSite? site}) async {
    final pc = context.read<PrivateCompanyProvider>();
    final canDirect = pc.canManageSites;
    final canPropose = !canDirect && pc.canProposeSiteChanges && site != null;
    if (!canDirect && site == null) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _WorkspaceSiteFormSheet(
        site: site,
        directEdit: canDirect,
        proposeOnly: canPropose,
      ),
    );
  }

  Future<void> _openDetail(WorkspaceSite site) async {
    final l10n = AppLocalizations.of(context);
    final provider = context.read<WorkspaceSitesProvider>();
    var filter = _ticketFilter;
    final initial = await provider.loadSiteDetail(site.id, filter: filter);
    if (!mounted || initial == null) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.72,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (_, scroll) {
            return StatefulBuilder(
              builder: (context, setModalState) {
                var currentSite = initial.site;
                var tickets = initial.tickets;

                Future<void> reloadTickets(String f) async {
                  final r = await provider.loadSiteDetail(site.id, filter: f);
                  if (r != null) {
                    setModalState(() {
                      filter = f;
                      currentSite = r.site;
                      tickets = r.tickets;
                    });
                  }
                }

                final s = currentSite;

                return ListView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            s.siteCode,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        if (s.isPending)
                          _StatusChip(
                            label: l10n.t('pc_site_pending'),
                            color: const Color(0xFFFF9F43),
                          )
                        else if (s.isConfirmed)
                          _StatusChip(
                            label: l10n.t('pc_site_confirmed'),
                            color: const Color(0xFF00D4AA),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${s.location} · ${s.province}',
                      style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _CountChip(
                          label: l10n.t('pc_site_inspection'),
                          count: s.inspectionQcCount,
                          color: const Color(0xFF38BDF8),
                        ),
                        _CountChip(
                          label: l10n.t('pc_site_maintenance'),
                          count: s.maintenanceQcCount,
                          color: const Color(0xFFFF9F43),
                        ),
                      ],
                    ),
                    if (s.hasQfield && s.qfieldProjects.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              fullscreenDialog: true,
                              builder: (_) => QFieldProjectMapScreen(
                                workspaceSiteId: s.id,
                                project: s.qfieldProjects.first,
                                canWrite: false,
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.map_rounded, size: 18),
                        label: Text(l10n.t('pc_site_view_qfield_map')),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF6C63FF),
                          side: BorderSide(color: Colors.white.withAlpha(40)),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Text(
                      l10n.t('pc_site_related_tickets'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final f in ['all', 'inspection', 'maintenance'])
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: FilterChip(
                                label: Text(_filterLabel(l10n, f)),
                                selected: filter == f,
                                onSelected: (_) => reloadTickets(f),
                                selectedColor: const Color(0xFF6C63FF).withAlpha(90),
                                labelStyle: TextStyle(
                                  color: filter == f ? Colors.white : Colors.white70,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (tickets.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Text(
                          l10n.t('pc_site_no_tickets'),
                          style: TextStyle(color: Colors.white.withAlpha(140)),
                        ),
                      )
                    else
                      ...tickets.map(
                        (t) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            t.title.isNotEmpty ? t.title : t.technique ?? t.id,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                          ),
                          subtitle: Text(
                            '${t.status} · ${t.isMaintenance ? l10n.t('pc_site_maintenance') : l10n.t('pc_site_inspection')}',
                            style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => TicketDetailScreen(ticketId: t.id),
                              ),
                            );
                          },
                        ),
                      ),
                    if (context.read<PrivateCompanyProvider>().canProposeSiteChanges &&
                        !context.read<PrivateCompanyProvider>().canManageSites) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _openForm(site: s);
                        },
                        icon: const Icon(Icons.edit_note_rounded),
                        label: Text(l10n.t('pc_site_propose_changes')),
                      ),
                    ],
                    if (context.read<PrivateCompanyProvider>().canManageSites && s.isPending) ...[
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () async {
                                await provider.confirmSite(s.id, reject: true);
                                if (context.mounted) Navigator.pop(ctx);
                              },
                              child: Text(l10n.t('pc_site_reject_pending')),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () async {
                                await provider.confirmSite(s.id);
                                if (context.mounted) Navigator.pop(ctx);
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF00D4AA),
                              ),
                              child: Text(l10n.t('pc_site_confirm_pending')),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  String _filterLabel(AppLocalizations l10n, String f) {
    switch (f) {
      case 'inspection':
        return l10n.t('pc_site_inspection');
      case 'maintenance':
        return l10n.t('pc_site_maintenance');
      default:
        return l10n.t('pc_site_filter_all');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final provider = context.watch<WorkspaceSitesProvider>();
    final q = _search.text.trim().toLowerCase();
    final sites = q.isEmpty
        ? provider.sites
        : provider.sites
            .where(
              (s) =>
                  s.siteCode.toLowerCase().contains(q) ||
                  s.location.toLowerCase().contains(q),
            )
            .toList();
    final mapSites = provider.mapSites;

    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _search,
                      onChanged: (_) => setState(() {}),
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: l10n.t('pc_site_search_hint'),
                        hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
                        prefixIcon: const Icon(Icons.search_rounded, color: Colors.white54),
                        filled: true,
                        fillColor: const Color(0xFF12122A),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Colors.white.withAlpha(20)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: () => setState(() => _showMap = !_showMap),
                    style: IconButton.styleFrom(
                      backgroundColor: _showMap
                          ? const Color(0xFF6C63FF)
                          : const Color(0xFF12122A),
                    ),
                    icon: Icon(
                      _showMap ? Icons.list_rounded : Icons.map_rounded,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            if (_showMap)
              Expanded(
                child: mapSites.isEmpty
                    ? Center(
                        child: Text(
                          l10n.t('pc_site_map_empty'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withAlpha(150)),
                        ),
                      )
                    : _SitesMapView(sites: mapSites, onTap: _openDetail),
              )
            else
              Expanded(
                child: provider.loading && provider.sites.isEmpty
                    ? const Center(
                        child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
                      )
                    : RefreshIndicator(
                        onRefresh: provider.fetchSites,
                        color: const Color(0xFF6C63FF),
                        child: sites.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                                  Center(
                                    child: Text(
                                      l10n.t('pc_site_empty'),
                                      style: TextStyle(color: Colors.white.withAlpha(160)),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                                itemCount: sites.length,
                                itemBuilder: (_, i) {
                                  final s = sites[i];
                                  return _SiteCard(site: s, onTap: () => _openDetail(s));
                                },
                              ),
                      ),
              ),
          ],
        ),
        if (pc.canManageSites)
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton.extended(
              onPressed: () => _openForm(),
              backgroundColor: const Color(0xFF6C63FF),
              icon: const Icon(Icons.add_location_alt_rounded),
              label: Text(l10n.t('pc_site_add')),
            ),
          ),
      ],
    );
  }
}

class _SiteCard extends StatelessWidget {
  const _SiteCard({required this.site, required this.onTap});
  final WorkspaceSite site;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C63FF).withAlpha(40),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    site.hasMapCoordinates ? Icons.map_rounded : Icons.location_on_outlined,
                    color: const Color(0xFF8B83FF),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              site.siteCode,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          if (site.isPending)
                            _StatusChip(
                              label: l10n.t('pc_site_pending'),
                              color: const Color(0xFFFF9F43),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        site.location,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        site.hasQfield
                            ? (site.hasMapCoordinates
                                ? l10n.t('pc_site_has_qfield_map')
                                : l10n.t('pc_site_has_qfield_no_coords'))
                            : l10n.t('pc_site_no_qfield'),
                        style: TextStyle(
                          color: site.hasMapCoordinates
                              ? const Color(0xFF00D4AA)
                              : Colors.white.withAlpha(120),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Colors.white38),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SitesMapView extends StatelessWidget {
  const _SitesMapView({required this.sites, required this.onTap});
  final List<WorkspaceSite> sites;
  final void Function(WorkspaceSite) onTap;

  @override
  Widget build(BuildContext context) {
    var latSum = 0.0;
    var lngSum = 0.0;
    for (final s in sites) {
      latSum += s.latitude!;
      lngSum += s.longitude!;
    }
    final center = LatLng(latSum / sites.length, lngSum / sites.length);
    return FlutterMap(
      options: MapOptions(initialCenter: center, initialZoom: 11),
      children: [
        TileLayer(
          urlTemplate: QFieldProjectMapSheet.tileUrlTemplate,
          subdomains: QFieldProjectMapSheet.tileSubdomains,
          userAgentPackageName: 'usmart_qc',
        ),
        MarkerLayer(
          markers: [
            for (final s in sites)
              Marker(
                point: LatLng(s.latitude!, s.longitude!),
                width: 44,
                height: 44,
                child: GestureDetector(
                  onTap: () => onTap(s),
                  child: const Icon(Icons.location_on, color: Color(0xFF6C63FF), size: 40),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(50),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(120)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.label, required this.count, required this.color});
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(35),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$label: $count',
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _WorkspaceSiteFormSheet extends StatefulWidget {
  const _WorkspaceSiteFormSheet({
    this.site,
    required this.directEdit,
    required this.proposeOnly,
  });

  final WorkspaceSite? site;
  final bool directEdit;
  final bool proposeOnly;

  @override
  State<_WorkspaceSiteFormSheet> createState() => _WorkspaceSiteFormSheetState();
}

class _WorkspaceSiteFormSheetState extends State<_WorkspaceSiteFormSheet> {
  final _code = TextEditingController();
  final _location = TextEditingController();
  String? _province;
  bool _attachQfield = false;
  String? _qfieldUrl;
  String? _qfieldFileName;
  bool _uploading = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final s = widget.site;
    if (s != null) {
      _code.text = s.siteCode;
      _location.text = s.location;
      _province = s.province;
      _attachQfield = s.hasQfield;
    }
  }

  @override
  void dispose() {
    _code.dispose();
    _location.dispose();
    super.dispose();
  }

  Future<void> _pickQfield() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['zip', 'qgz', 'gpkg', 'qgs'],
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    setState(() => _uploading = true);
    final tickets = context.read<TicketsProvider>();
    String? url;
    if (file.bytes != null) {
      url = await tickets.uploadQFieldPackageFromBytes(file.bytes!, file.name);
    } else if (file.path != null) {
      url = await tickets.uploadQFieldPackageFromPath(file.path!);
    }
    if (mounted) {
      setState(() {
        _uploading = false;
        if (url != null) {
          _qfieldUrl = url;
          _qfieldFileName = file.name;
          _attachQfield = true;
        }
      });
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final code = _code.text.trim();
    final loc = _location.text.trim();
    final prov = _province?.trim() ?? '';
    if (code.isEmpty || loc.isEmpty || prov.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('pc_site_form_required'))),
      );
      return;
    }
    setState(() => _saving = true);
    final ws = context.read<WorkspaceSitesProvider>();
    List<Map<String, dynamic>>? qf;
    if (_attachQfield && _qfieldUrl != null && _qfieldFileName != null) {
      qf = WorkspaceSitesProvider.qfieldProjectPayload(_qfieldUrl!, _qfieldFileName!, title: code);
    }
    bool ok;
    if (widget.site == null) {
      ok = await ws.createSite(
        siteCode: code,
        location: loc,
        province: prov,
        hasQfield: _attachQfield && qf != null,
        qfieldProjects: qf,
      );
    } else {
      ok = await ws.updateSite(
        widget.site!.id,
        siteCode: widget.directEdit ? code : null,
        location: loc,
        province: prov,
        qfieldProjects: qf,
      );
    }
    if (mounted) {
      setState(() => _saving = false);
      if (ok) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.proposeOnly
                  ? l10n.t('pc_site_submitted_for_approval')
                  : l10n.t('pc_site_saved'),
            ),
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.site == null
                  ? l10n.t('pc_site_add')
                  : widget.proposeOnly
                      ? l10n.t('pc_site_propose_changes')
                      : l10n.t('pc_site_edit'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _code,
              enabled: widget.site == null || widget.directEdit,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_id'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _location,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_location'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _province,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_province'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
              items: kIraqProvinces
                  .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                  .toList(),
              onChanged: (v) => setState(() => _province = v),
            ),
            const SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                l10n.t('pc_site_attach_qfield'),
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
              subtitle: Text(
                l10n.t('pc_site_attach_qfield_hint'),
                style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
              ),
              value: _attachQfield,
              activeThumbColor: const Color(0xFF6C63FF),
              onChanged: (v) => setState(() => _attachQfield = v),
            ),
            if (_attachQfield) ...[
              OutlinedButton.icon(
                onPressed: _uploading ? null : _pickQfield,
                icon: _uploading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.folder_zip_rounded),
                label: Text(
                  _qfieldFileName ?? l10n.t('pc_site_pick_qfield'),
                ),
              ),
              if (!widget.directEdit && widget.site != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    l10n.t('pc_site_engineer_qfield_note'),
                    style: TextStyle(color: Colors.amberAccent.withAlpha(200), fontSize: 11),
                  ),
                ),
            ],
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      widget.proposeOnly
                          ? l10n.t('pc_site_submit_approval')
                          : l10n.t('save'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
