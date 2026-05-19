import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/private_company_provider.dart';
import '../models/workspace_site.dart';
import '../providers/sites_provider.dart';
import '../providers/workspace_sites_provider.dart';
import 'workspace_site_form_sheet.dart';
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
  bool? _prevCanOpenWorkspace;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  void _bootstrap() {
    if (!mounted) return;
    final pc = context.read<PrivateCompanyProvider>();
    final sp = context.read<SitesProvider>();
    _prevCanOpenWorkspace = pc.canOpenPrivateWorkspace;
    sp.seedWorkspaceFromMembership(
      isMember: pc.canOpenPrivateWorkspace,
      canManageWorkspace: pc.canManageSites,
    );
    sp.fetchSites(includeWorkspace: pc.canOpenPrivateWorkspace);
    if (pc.canOpenPrivateWorkspace) {
      context.read<WorkspaceSitesProvider>().fetchSites();
    }
    _syncSubTabs(pc);
  }

  void _onSubTabChanged() {
    if (_subTabs == null || _subTabs!.indexIsChanging) return;
    if (_subTabs!.index == 0 && mounted) {
      final pc = context.read<PrivateCompanyProvider>();
      if (pc.canOpenPrivateWorkspace) {
        _reloadSites(context.read<SitesProvider>());
        context.read<WorkspaceSitesProvider>().fetchSites();
      }
    }
  }

  void _syncSubTabs(PrivateCompanyProvider pc) {
    final dual = pc.canOpenPrivateWorkspace;
    if (dual && _subTabs == null) {
      _subTabs = TabController(length: 2, vsync: this);
      _subTabs!.addListener(_onSubTabChanged);
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _reloadSites(context.read<SitesProvider>());
        context.read<WorkspaceSitesProvider>().fetchSites();
      });
    } else if (!dual && _subTabs != null) {
      _subTabs!.removeListener(_onSubTabChanged);
      _subTabs?.dispose();
      _subTabs = null;
      setState(() {});
    }
  }

  @override
  void dispose() {
    _siteSearchCtrl.dispose();
    _subTabs?.removeListener(_onSubTabChanged);
    _subTabs?.dispose();
    super.dispose();
  }

  void _onWorkspaceMembershipChanged(PrivateCompanyProvider pc) {
    final canOpen = pc.canOpenPrivateWorkspace;
    if (_prevCanOpenWorkspace == canOpen) return;
    _prevCanOpenWorkspace = canOpen;
    final sp = context.read<SitesProvider>();
    sp.seedWorkspaceFromMembership(
      isMember: canOpen,
      canManageWorkspace: pc.canManageSites,
    );
    sp.fetchSites(includeWorkspace: canOpen);
    if (canOpen) {
      context.read<WorkspaceSitesProvider>().fetchSites();
    }
    _syncSubTabs(pc);
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
    if (!mounted) return;
    await context.read<WorkspaceSitesProvider>().fetchSites();
    await _reloadSites(provider);
  }

  WorkspaceSite? _workspaceSiteFor(Site site) {
    final id = site.workspaceSiteId;
    if (id == null) return null;
    for (final s in context.read<WorkspaceSitesProvider>().sites) {
      if (s.id == id) return s;
    }
    return WorkspaceSite(
      id: id,
      siteCode: site.siteId,
      location: site.location,
      province: site.province,
      latitude: site.latitude,
      longitude: site.longitude,
      hasQfield: site.hasQfield,
      qfieldProjects: site.qfieldProjects,
      designDocuments: site.designDocuments,
      canManage: site.canEdit,
      createdByRequesterId: site.createdByRequesterId,
    );
  }

  Future<void> _editWorkspaceSite(SitesProvider provider, Site site) async {
    final ws = _workspaceSiteFor(site);
    if (ws == null) return;
    await showWorkspaceSiteFormSheet(
      context,
      site: ws,
      directEdit: true,
      proposeOnly: false,
    );
    if (!mounted) return;
    await context.read<WorkspaceSitesProvider>().fetchSites();
    await _reloadSites(provider);
  }

  Future<void> _deleteWorkspaceSite(
    BuildContext context,
    SitesProvider provider,
    Site site,
    AppLocalizations l10n,
  ) async {
    final id = site.workspaceSiteId;
    if (id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('site_delete_confirm_title'),
          style: const TextStyle(color: Colors.white),
        ),
        content: Text(
          l10n.t('site_delete_confirm', {'name': site.siteId}),
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              l10n.t('site_delete'),
              style: const TextStyle(color: Color(0xFFFF4757)),
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final deleted = await context.read<WorkspaceSitesProvider>().deleteSite(id);
    if (!mounted) return;
    if (deleted) {
      await _reloadSites(provider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_deleted')),
          backgroundColor: const Color(0xFF00D4AA),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_delete_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
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
    AppLocalizations l10n, {
    required bool workspace,
  }) {
    if (visible.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.22),
          Icon(Icons.explore_off_rounded,
              size: 56, color: Colors.white.withAlpha(70)),
          const SizedBox(height: 16),
          Text(
            workspace ? l10n.t('sites_empty_workspace') : l10n.t('sites_empty_own'),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withAlpha(200),
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              l10n.t('no_sites'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withAlpha(110), fontSize: 13),
            ),
          ),
        ],
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
          onEdit: site.canEdit
              ? () {
                  if (site.isWorkspace) {
                    _editWorkspaceSite(provider, site);
                  } else {
                    Navigator.of(context)
                        .push(MaterialPageRoute(
                          builder: (_) => SiteFormScreen(site: site),
                        ))
                        .then((_) => _reloadSites(provider));
                  }
                }
              : null,
          onDelete: site.canEdit
              ? () {
                  if (site.isWorkspace) {
                    _deleteWorkspaceSite(context, provider, site, l10n);
                  } else {
                    _confirmDelete(context, provider, site, l10n);
                  }
                }
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
                    child: _buildSiteList(
                      context,
                      provider,
                      visible,
                      l10n,
                      workspace: workspace,
                    ),
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _onWorkspaceMembershipChanged(pc);
    });
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
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF12122A),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white.withAlpha(12)),
                  ),
                  child: TabBar(
                    controller: _subTabs,
                    dividerColor: Colors.transparent,
                    indicatorSize: TabBarIndicatorSize.tab,
                    indicator: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      gradient: const LinearGradient(
                        colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)],
                      ),
                    ),
                    labelColor: Colors.white,
                    unselectedLabelColor: Colors.white54,
                    labelStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                    tabs: [
                      Tab(
                        child: _SiteTabLabel(
                          label: l10n.t('site_tab_workspace'),
                          count: provider.sites.where((s) => s.isWorkspace).length,
                        ),
                      ),
                      Tab(
                        child: _SiteTabLabel(
                          label: l10n.t('site_tab_my_sites'),
                          count: provider.sites.where((s) => !s.isWorkspace).length,
                        ),
                      ),
                    ],
                  ),
                ),
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

class _SiteTabLabel extends StatelessWidget {
  const _SiteTabLabel({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(label, overflow: TextOverflow.ellipsis, maxLines: 1),
        ),
        if (count > 0) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(30),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '$count',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ],
    );
  }
}
