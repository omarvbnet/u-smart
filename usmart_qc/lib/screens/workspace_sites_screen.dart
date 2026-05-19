import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/workspace_site.dart';
import '../providers/private_company_provider.dart';
import '../providers/workspace_sites_provider.dart';
import '../utils/map_live_location.dart';
import '../widgets/qfield_project_map_sheet.dart';
import '../widgets/workspace_site_detail_sheet.dart';
import '../widgets/workspace_site_form_sheet.dart';

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
    await showWorkspaceSiteFormSheet(
      context,
      site: site,
      directEdit: canDirect,
      proposeOnly: canPropose,
    );
    if (mounted) {
      await context.read<WorkspaceSitesProvider>().fetchSites();
    }
  }

  Future<void> _openDetail(WorkspaceSite site) async {
    await showWorkspaceSiteDetailSheet(context, site.id, ticketFilter: _ticketFilter);
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

class _SitesMapView extends StatefulWidget {
  const _SitesMapView({required this.sites, required this.onTap});
  final List<WorkspaceSite> sites;
  final void Function(WorkspaceSite) onTap;

  @override
  State<_SitesMapView> createState() => _SitesMapViewState();
}

class _SitesMapViewState extends State<_SitesMapView> {
  final MapController _mapController = MapController();
  late final MapLiveLocation _liveLoc = MapLiveLocation(
    onPositionChanged: () {
      if (mounted) setState(() {});
    },
  );

  @override
  void initState() {
    super.initState();
    _liveLoc.start();
  }

  @override
  void dispose() {
    _liveLoc.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var latSum = 0.0;
    var lngSum = 0.0;
    for (final s in widget.sites) {
      latSum += s.latitude!;
      lngSum += s.longitude!;
    }
    final center = LatLng(latSum / widget.sites.length, lngSum / widget.sites.length);
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(initialCenter: center, initialZoom: 11),
          children: [
            TileLayer(
              urlTemplate: QFieldProjectMapSheet.tileUrlTemplate,
              subdomains: QFieldProjectMapSheet.tileSubdomains,
              userAgentPackageName: 'usmart_qc',
            ),
            ...buildUserLocationMapLayers(_liveLoc.position, _liveLoc.accuracyM),
            MarkerLayer(
              markers: [
                for (final s in widget.sites)
                  Marker(
                    point: LatLng(s.latitude!, s.longitude!),
                    width: 44,
                    height: 44,
                    child: GestureDetector(
                      onTap: () => widget.onTap(s),
                      child: const Icon(Icons.location_on, color: Color(0xFF6C63FF), size: 40),
                    ),
                  ),
              ],
            ),
          ],
        ),
        Positioned(
          right: 12,
          bottom: 12,
          child: MapMyLocationButton(
            enabled: _liveLoc.hasPosition,
            onPressed: () => _liveLoc.moveMapToUser(_mapController),
          ),
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
