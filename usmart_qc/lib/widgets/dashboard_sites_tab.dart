import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/private_company_provider.dart';
import '../providers/sites_provider.dart';
import '../screens/create_ticket_screen.dart';
import '../screens/site_form_screen.dart';
import '../utils/site_qfield_map.dart';
import '../widgets/site_share_dialog.dart';
import 'site_bulk_import_menu.dart';
import 'site_list_card.dart';
import 'workspace_site_detail_sheet.dart';

/// Sites tab with optional workspace / personal sub-tabs and role-aware Add Site controls.
class DashboardSitesTab extends StatefulWidget {
  const DashboardSitesTab({
    super.key,
    this.allowCreateOwnSites = true,
    this.showBulkImport = true,
  });

  /// Personal (non-workspace) sites — hidden for engineers/technicians in a workspace.
  final bool allowCreateOwnSites;

  final bool showBulkImport;

  @override
  State<DashboardSitesTab> createState() => _DashboardSitesTabState();
}

class _DashboardSitesTabState extends State<DashboardSitesTab>
    with SingleTickerProviderStateMixin {
  final TextEditingController _siteSearchCtrl = TextEditingController();
  TabController? _subTabs;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  void _bootstrap() {
    if (!mounted) return;
    final pc = context.read<PrivateCompanyProvider>();
    final sp = context.read<SitesProvider>();
    sp.seedWorkspaceFromMembership(
      isMember: pc.canOpenPrivateWorkspace,
      canManageWorkspace: pc.canManageSites,
    );
    sp.fetchSites(includeWorkspace: pc.canOpenPrivateWorkspace);
    _syncSubTabs(pc);
  }

  void _syncSubTabs(PrivateCompanyProvider pc) {
    final dual = pc.canOpenPrivateWorkspace;
    if (dual && _subTabs == null) {
      _subTabs = TabController(length: 2, vsync: this);
      setState(() {});
    } else if (!dual && _subTabs != null) {
      _subTabs?.dispose();
      _subTabs = null;
      setState(() {});
    }
  }

  @override
  void dispose() {
    _siteSearchCtrl.dispose();
    _subTabs?.dispose();
    super.dispose();
  }

  Future<void> _reloadSites(SitesProvider provider) {
    final pc = context.read<PrivateCompanyProvider>();
    return provider.fetchSites(includeWorkspace: pc.canOpenPrivateWorkspace);
  }

  bool _canAddOnWorkspaceTab(PrivateCompanyProvider pc, SitesProvider sp) =>
      pc.canManageSites || sp.canManageWorkspaceSites;

  bool _canAddOnOwnTab(PrivateCompanyProvider pc) =>
      widget.allowCreateOwnSites && !pc.isPrivateWorkspaceFieldStaff;

  Future<void> _openAddWorkspaceSite(SitesProvider provider) async {
    await showWorkspaceSiteCreateSheet(context);
    if (mounted) await _reloadSites(provider);
  }

  Future<void> _openAddOwnSite(SitesProvider provider) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SiteFormScreen()),
    );
    if (mounted) await _reloadSites(provider);
  }

  void _openSite(BuildContext context, Site site) {
    if (site.isWorkspace && site.workspaceSiteId != null) {
      showWorkspaceSiteDetailSheet(context, site.workspaceSiteId!);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SiteFormScreen(
          site: site,
          readOnly: !site.canEdit,
        ),
      ),
    ).then((_) => _reloadSites(context.read<SitesProvider>()));
  }

  Future<void> _confirmDelete(
    BuildContext context,
    SitesProvider provider,
    Site site,
    AppLocalizations l10n,
  ) async {
    if (site.isWorkspace) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          l10n.t('site_delete_confirm_title'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        content: Text(
          l10n.t('site_delete_confirm', {'name': site.siteId}),
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel'),
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFF4757)),
            child: Text(l10n.t('site_delete')),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      final success = await provider.deleteSite(site.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                success ? l10n.t('site_deleted') : l10n.t('site_delete_failed')),
            backgroundColor:
                success ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          ),
        );
      }
    }
  }

  Future<void> _confirmRemoveShare(
    BuildContext context,
    SitesProvider provider,
    Site site,
    AppLocalizations l10n,
  ) async {
    final sid = site.shareId;
    if (sid == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(l10n.t('site_remove_share_title'),
            style: const TextStyle(color: Colors.white)),
        content: Text(
          l10n.t('site_remove_share_confirm', {'name': site.siteId}),
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.t('site_remove_share')),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      final success = await provider.revokeSiteShare(site.id, sid);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              success ? l10n.t('site_remove_share_done') : l10n.t('site_share_failed')),
        ),
      );
    }
  }

  static String _fmtSiteHours(double h) {
    if (h <= 0) return '0';
    return h < 1 ? h.toStringAsFixed(2) : h.toStringAsFixed(1);
  }

  List<Site> _filterSites(List<Site> all, {required bool workspace}) {
    final q = _siteSearchCtrl.text.trim().toLowerCase();
    var list = all.where((s) => s.isWorkspace == workspace).toList();
    if (q.isNotEmpty) {
      list = list
          .where(
            (s) =>
                s.siteId.toLowerCase().contains(q) ||
                s.id.toLowerCase().contains(q),
          )
          .toList();
    }
    return list;
  }

  Widget _buildSiteList(
    BuildContext context,
    SitesProvider provider,
    List<Site> visible,
    AppLocalizations l10n,
  ) {
    if (visible.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.explore_off_rounded,
                size: 48, color: Colors.white.withAlpha(80)),
            const SizedBox(height: 12),
            Text(l10n.t('no_sites'),
                style: const TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
      itemCount: visible.length,
      itemBuilder: (context, index) {
        final site = visible[index];
        return SiteListCard(
          site: site,
          l10n: l10n,
          formatHours: _fmtSiteHours,
          onTap: () => _openSite(context, site),
          onCreateTicket: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => CreateTicketScreen(prefillSite: site),
            ),
          ),
          onOpenMap: site.canOpenQFieldMap
              ? () => openSiteQFieldMap(
                    context,
                    site,
                    onSaved: () => _reloadSites(provider),
                  )
              : null,
          onEdit: site.canEdit && !site.isWorkspace
              ? () => Navigator.of(context)
                  .push(MaterialPageRoute(
                    builder: (_) => SiteFormScreen(site: site),
                  ))
                  .then((_) => _reloadSites(provider))
              : null,
          onDelete: site.canEdit && !site.isWorkspace
              ? () => _confirmDelete(context, provider, site, l10n)
              : null,
          onShare: site.canEdit && !site.isWorkspace
              ? () => promptShareSite(
                    context: context,
                    provider: provider,
                    site: site,
                    l10n: l10n,
                  )
              : null,
          onViewShared: !site.canEdit && !site.isWorkspace
              ? () => Navigator.of(context)
                  .push(MaterialPageRoute(
                    builder: (_) => SiteFormScreen(site: site, readOnly: true),
                  ))
                  .then((_) => _reloadSites(provider))
              : null,
          onRemoveShare: !site.canEdit && !site.isWorkspace
              ? () => _confirmRemoveShare(context, provider, site, l10n)
              : null,
        );
      },
    );
  }

  Widget _buildTabBody({
    required bool workspace,
    required bool showFab,
    required VoidCallback? onAdd,
  }) {
    final l10n = AppLocalizations.of(context);
    return Consumer<SitesProvider>(
      builder: (context, provider, _) {
        final visible = _filterSites(provider.sites, workspace: workspace);
        final coords = visible.where((s) => s.hasCoordinates).length;
        return Stack(
          children: [
            Column(
              children: [
                if (workspace)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                    child: Row(
                      children: [
                        Icon(Icons.workspaces_rounded,
                            size: 14, color: Colors.white.withAlpha(140)),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            l10n.t('site_tab_workspace_hint'),
                            style: TextStyle(
                              color: Colors.white.withAlpha(120),
                              fontSize: 11,
                            ),
                          ),
                        ),
                        Text(
                          l10n.t('gps_count', {'count': '$coords'}),
                          style: const TextStyle(
                            color: Color(0xFF00D4AA),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => _reloadSites(provider),
                    color: const Color(0xFF6C63FF),
                    child: _buildSiteList(context, provider, visible, l10n),
                  ),
                ),
              ],
            ),
            if (showFab && onAdd != null)
              Positioned(
                right: 20,
                bottom: 24,
                child: FloatingActionButton(
                  heroTag: workspace ? 'fab_ws_site' : 'fab_own_site',
                  onPressed: onAdd,
                  backgroundColor: const Color(0xFF6C63FF),
                  child: const Icon(Icons.add_rounded, color: Colors.white),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    _syncSubTabs(pc);

    return Consumer<SitesProvider>(
      builder: (context, provider, _) {
        if (provider.loading && provider.sites.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        final dualTabs = pc.canOpenPrivateWorkspace && _subTabs != null;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: TextField(
                controller: _siteSearchCtrl,
                onChanged: (_) => setState(() {}),
                style: const TextStyle(color: Colors.white, fontSize: 15),
                decoration: InputDecoration(
                  hintText: l10n.t('site_search_by_id'),
                  hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
                  prefixIcon:
                      Icon(Icons.search_rounded, color: Colors.white.withAlpha(120)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    ).createShader(bounds),
                    child: Text(
                      l10n.t('nav_sites'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (widget.showBulkImport && _canAddOnOwnTab(pc))
                    const SiteBulkImportMenu(),
                ],
              ),
            ),
            if (dualTabs) ...[
              TabBar(
                controller: _subTabs,
                indicatorColor: const Color(0xFF6C63FF),
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white54,
                tabs: [
                  Tab(text: l10n.t('site_tab_workspace')),
                  Tab(text: l10n.t('site_tab_my_sites')),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _subTabs,
                  children: [
                    _buildTabBody(
                      workspace: true,
                      showFab: _canAddOnWorkspaceTab(pc, provider),
                      onAdd: _canAddOnWorkspaceTab(pc, provider)
                          ? () => _openAddWorkspaceSite(provider)
                          : null,
                    ),
                    _buildTabBody(
                      workspace: false,
                      showFab: _canAddOnOwnTab(pc),
                      onAdd: _canAddOnOwnTab(pc)
                          ? () => _openAddOwnSite(provider)
                          : null,
                    ),
                  ],
                ),
              ),
            ] else
              Expanded(
                child: _buildTabBody(
                  workspace: false,
                  showFab: _canAddOnOwnTab(pc),
                  onAdd:
                      _canAddOnOwnTab(pc) ? () => _openAddOwnSite(provider) : null,
                ),
              ),
          ],
        );
      },
    );
  }
}
