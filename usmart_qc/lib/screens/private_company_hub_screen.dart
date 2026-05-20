import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../utils/share_position_origin.dart';
import '../constants/iraq_provinces.dart';
import '../models/private_company.dart';
import '../models/private_company_warehouse.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/private_company_warehouse_provider.dart';
import '../providers/conflicts_provider.dart';
import 'conflicts_screen.dart';
import 'workspace_checklist_detail_screen.dart';
import '../l10n/app_localizations.dart';
import 'workspace_techniques_screen.dart';
import '../widgets/workspace_cancellations_analytics_panel.dart';
import '../widgets/workspace_expenses_analytics_panel.dart';
import '../widgets/department_maintenance_reasons_sheet.dart';
import '../widgets/workspace_maintenance_reasons_tabs.dart';

/// Drag handle + title with an explicit close control for modal bottom sheets.
Widget _modalSheetTitleRow(BuildContext context, String title) {
  return Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      IconButton(
        tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
        icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 24),
        onPressed: () => Navigator.pop(context),
      ),
      Expanded(
        child: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    ],
  );
}

String _pcStatusLabel(PrivateCompanyStatus s, AppLocalizations l10n) {
  switch (s) {
    case PrivateCompanyStatus.pending:
      return l10n.t('pc_status_pending');
    case PrivateCompanyStatus.approved:
      return l10n.t('pc_status_approved');
    case PrivateCompanyStatus.rejected:
      return l10n.t('pc_status_rejected');
    case PrivateCompanyStatus.suspended:
      return l10n.t('pc_status_suspended');
    case PrivateCompanyStatus.unknown:
      return l10n.t('pc_status_unknown');
  }
}

bool _pcHubShowsConflictsTab(PrivateCompanyProvider pc) {
  if (!pc.hasWorkspace || !pc.isApproved) return false;
  if (_pcUsesFieldStaffHub(pc)) return false;
  return pc.canManageWorkspaceConflicts;
}

bool _pcHubShowsExpensesTab(PrivateCompanyProvider pc) {
  if (!pc.hasWorkspace || !pc.isApproved) return false;
  final w = pc.workspace;
  if (w == null) return false;
  if (w.ticketExpensesEnabled) {
    return pc.isOwner || pc.canManageStaff || pc.isPrivateWorkspaceFieldStaff;
  }
  return pc.canManageStaff;
}

bool _pcHubShowsMaintenanceReasonsTabs(PrivateCompanyProvider pc) {
  if (!pc.hasWorkspace || !pc.isApproved) return false;
  return pc.canManageMaintenanceReasons;
}

bool _pcUsesFieldStaffHub(PrivateCompanyProvider pc) {
  return pc.isPrivateWorkspaceFieldStaff && !pc.isOwner && !pc.isDepartmentManager;
}

String _pcStatusDescription(
  PrivateCompanyStatus status,
  PrivateCompanyWorkspace ws,
  AppLocalizations l10n,
) {
  switch (status) {
    case PrivateCompanyStatus.pending:
      return l10n.t('pc_ws_status_pending_body');
    case PrivateCompanyStatus.rejected:
      return l10n.t('pc_ws_status_rejected_body');
    case PrivateCompanyStatus.suspended:
      return l10n.t('pc_ws_status_suspended_body');
    case PrivateCompanyStatus.approved:
    case PrivateCompanyStatus.unknown:
      return ws.description ?? '';
  }
}

/// Single entry-point for the Private Company workspace feature on mobile.
/// Renders one of three states:
///   • [_NotRequestedView] — initial state, prompts the COMPANY user to apply.
///   • [_RequestPendingView] — informational pending/rejected/suspended state.
///   • [_ApprovedHubView]  — the full hub (Departments / Staff / Checklists).
class PrivateCompanyHubScreen extends StatefulWidget {
  const PrivateCompanyHubScreen({super.key});

  @override
  State<PrivateCompanyHubScreen> createState() => _PrivateCompanyHubScreenState();
}

class _PrivateCompanyHubScreenState extends State<PrivateCompanyHubScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pc = context.read<PrivateCompanyProvider>();
      final auth = context.read<AuthProvider>();
      pc.setCurrentRequesterId(auth.user?.id);
      pc.refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        children: [
          // Ambient gradient orbs
          Positioned(
            top: -120,
            left: -60,
            child: _orb(const Color(0xFF6C63FF), 280),
          ),
          Positioned(
            bottom: -100,
            right: -80,
            child: _orb(const Color(0xFF00D4AA), 260),
          ),
          SafeArea(
            child: Consumer<PrivateCompanyProvider>(
              builder: (context, provider, _) {
                if (provider.loading && provider.workspace == null) {
                  return const Center(
                    child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
                  );
                }
                final ws = provider.workspace;
                if (ws == null) {
                  return const _NotRequestedView();
                }
                if (!ws.isApproved) {
                  return _RequestPendingView(workspace: ws);
                }
                return _ApprovedHubView(workspace: ws);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _orb(Color color, double size) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color.withAlpha(40), Colors.transparent]),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// State 1 — not requested yet
// ════════════════════════════════════════════════════════════════════════════

class _NotRequestedView extends StatefulWidget {
  const _NotRequestedView();

  @override
  State<_NotRequestedView> createState() => _NotRequestedViewState();
}

class _NotRequestedViewState extends State<_NotRequestedView> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _scrollController = ScrollController();
  bool _formOpen = false;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _openRequestForm() {
    if (_formOpen) return;
    setState(() => _formOpen = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(0);
      }
    });
  }

  Widget _buildRequestFormCard(AppLocalizations l10n) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.business_center_rounded,
                  color: Color(0xFF6C63FF), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.t('pc_ws_req_form_title'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: () => setState(() => _formOpen = false),
                icon: Icon(Icons.close_rounded, color: Colors.white.withAlpha(160)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _DarkField(
            controller: _name,
            label: l10n.t('pc_ws_req_name_label'),
            hint: l10n.t('pc_ws_req_name_hint'),
            icon: Icons.apartment_rounded,
          ),
          const SizedBox(height: 12),
          _DarkField(
            controller: _description,
            label: l10n.t('pc_ws_req_desc_label'),
            hint: l10n.t('pc_ws_req_desc_hint'),
            icon: Icons.description_outlined,
            maxLines: 3,
          ),
          const SizedBox(height: 18),
          Consumer<PrivateCompanyProvider>(
            builder: (context, provider, _) => SizedBox(
              width: double.infinity,
              child: _GradientButton(
                onPressed: provider.submitting ? null : _submit,
                label: provider.submitting
                    ? l10n.t('pc_ws_req_submitting')
                    : l10n.t('pc_ws_req_submit_btn'),
                icon: Icons.send_rounded,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              l10n.t('pc_ws_req_admin_note'),
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final ok = await context
        .read<PrivateCompanyProvider>()
        .requestWorkspace(name: name, description: _description.text.trim());
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).t('pc_ws_request_submitted')),
          backgroundColor: const Color(0xFF00D4AA),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final canRequest = auth.isCompany && !auth.isCompanyOwner;
    final l10n = AppLocalizations.of(context);

    final showForm = _formOpen && canRequest;

    return CustomScrollView(
      controller: _scrollController,
      slivers: [
        SliverAppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          pinned: false,
          floating: true,
          title: _Title(l10n.t('pc_ws_screen_title')),
          centerTitle: false,
          systemOverlayStyle: SystemUiOverlayStyle.light,
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              const SizedBox(height: 8),
              _GradientHeroCard(
                gradient: const [Color(0xFF6C63FF), Color(0xFF8B83FF), Color(0xFF00D4AA)],
                title: l10n.t('pc_ws_req_hero_title'),
                subtitle: l10n.t('pc_ws_req_hero_subtitle'),
                cta: l10n.t('pc_ws_req_cta'),
                showCta: !showForm,
                onCta: !canRequest ? null : _openRequestForm,
                disabled: !canRequest,
              ),
              if (!canRequest)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _MessageBanner(
                    icon: Icons.info_outline_rounded,
                    text: l10n.t('pc_ws_req_company_only'),
                    color: const Color(0xFFFBBF24),
                  ),
                ),
              if (showForm) ...[
                const SizedBox(height: 18),
                _buildRequestFormCard(l10n),
              ],
              if (!showForm) ...[
                const SizedBox(height: 22),
                _SectionTitle(l10n.t('pc_ws_req_what_you_get')),
                const SizedBox(height: 10),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  childAspectRatio: 0.92,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  children: [
                    _FeatureTile(
                      icon: Icons.account_tree_rounded,
                      title: l10n.t('pc_ws_req_feat_departments_title'),
                      description: l10n.t('pc_ws_req_feat_departments_desc'),
                      color: const Color(0xFF6C63FF),
                    ),
                    _FeatureTile(
                      icon: Icons.groups_rounded,
                      title: l10n.t('pc_ws_req_feat_roles_title'),
                      description: l10n.t('pc_ws_req_feat_roles_desc'),
                      color: const Color(0xFF00D4AA),
                    ),
                    _FeatureTile(
                      icon: Icons.inventory_2_rounded,
                      title: l10n.t('pc_ws_req_feat_materials_title'),
                      description: l10n.t('pc_ws_req_feat_materials_desc'),
                      color: const Color(0xFF8B83FF),
                    ),
                    _FeatureTile(
                      icon: Icons.handyman_rounded,
                      title: l10n.t('pc_ws_req_feat_tools_title'),
                      description: l10n.t('pc_ws_req_feat_tools_desc'),
                      color: const Color(0xFF5B8DEF),
                    ),
                    _FeatureTile(
                      icon: Icons.payments_rounded,
                      title: l10n.t('pc_ws_req_feat_expenses_title'),
                      description: l10n.t('pc_ws_req_feat_expenses_desc'),
                      color: const Color(0xFF10B981),
                    ),
                    _FeatureTile(
                      icon: Icons.checklist_rounded,
                      title: l10n.t('pc_ws_req_feat_checklists_title'),
                      description: l10n.t('pc_ws_req_feat_checklists_desc'),
                      color: const Color(0xFFFBBF24),
                    ),
                    _FeatureTile(
                      icon: Icons.notifications_active_rounded,
                      title: l10n.t('pc_ws_req_feat_notifications_title'),
                      description: l10n.t('pc_ws_req_feat_notifications_desc'),
                      color: const Color(0xFFFF9F43),
                    ),
                  ],
                ),
                const SizedBox(height: 26),
                const _ProcessSteps(),
              ],
            ]),
          ),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// State 2 — request submitted (pending / rejected / suspended)
// ════════════════════════════════════════════════════════════════════════════

class _RequestPendingView extends StatelessWidget {
  const _RequestPendingView({required this.workspace});

  final PrivateCompanyWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final status = workspace.status;
    final l10n = AppLocalizations.of(context);
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          pinned: false,
          floating: true,
          title: _Title(l10n.t('pc_ws_screen_title')),
          centerTitle: false,
          actions: [
            IconButton(
              tooltip: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
              icon: const Icon(Icons.refresh_rounded, color: Color(0xFF8B83FF)),
              onPressed: () => context.read<PrivateCompanyProvider>().refresh(),
            ),
          ],
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _StatusHeroCard(
                status: status,
                title: workspace.name,
                description: _pcStatusDescription(status, workspace, l10n),
              ),
              const SizedBox(height: 18),
              if (workspace.rejectionReason != null && status == PrivateCompanyStatus.rejected)
                _MessageBanner(
                  icon: Icons.report_gmailerrorred_rounded,
                  text: l10n.t('pc_ws_req_rejection_reason', {
                    'reason': workspace.rejectionReason!,
                  }),
                  color: const Color(0xFFFF4757),
                ),
              const SizedBox(height: 18),
              _SectionTitle(l10n.t('pc_ws_req_what_next')),
              const SizedBox(height: 10),
              const _ProcessSteps(),
              const SizedBox(height: 22),
              _GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('pc_ws_req_submitted_on'),
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      workspace.createdAt.toLocal().toString().split('.').first,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    if (workspace.description != null && workspace.description!.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text(
                        l10n.t('pc_ws_description'),
                        style: const TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        workspace.description!,
                        style: TextStyle(color: Colors.white.withAlpha(220), fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
            ]),
          ),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// State 3 — approved hub
// ════════════════════════════════════════════════════════════════════════════

class _ApprovedHubView extends StatefulWidget {
  const _ApprovedHubView({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_ApprovedHubView> createState() => _ApprovedHubViewState();
}

class _ApprovedHubViewState extends State<_ApprovedHubView>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  int _tabLength = 6;
  PrivateCompanyProvider? _pcAttached;

  int _hubTabCount(PrivateCompanyProvider pc) {
    if (_pcUsesFieldStaffHub(pc)) {
      var n = 3;
      if (_pcHubShowsMaintenanceReasonsTabs(pc)) n += 2;
      if (_pcHubShowsExpensesTab(pc)) n += 1;
      return n;
    }
    var n = 6;
    if (_pcHubShowsConflictsTab(pc)) n += 1;
    if (_pcHubShowsMaintenanceReasonsTabs(pc)) n += 2;
    if (_pcHubShowsExpensesTab(pc)) n += 1;
    return n;
  }

  void _syncHubTabs(PrivateCompanyProvider pc) {
    final n = _hubTabCount(pc);
    if (n == _tabLength) return;
    final prevIndex = _tabs.index;
    _tabs.dispose();
    _tabLength = n;
    _tabs = TabController(length: n, vsync: this);
    var newIndex = prevIndex;
    if (newIndex >= n) newIndex = n - 1;
    if (newIndex < 0) newIndex = 0;
  }

  void _attachPcListener(PrivateCompanyProvider pc) {
    if (_pcAttached == pc) return;
    _pcAttached?.removeListener(_onPcChanged);
    _pcAttached = pc;
    pc.addListener(_onPcChanged);
  }

  void _onPcChanged() {
    final pc = _pcAttached;
    if (pc == null || !mounted) return;
    final lenBefore = _tabLength;
    _syncHubTabs(pc);
    if (lenBefore != _tabLength) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 6, vsync: this);
    // Eager-load warehouse data the first time the hub opens.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final wh = context.read<PrivateCompanyWarehouseProvider>();
      if (wh.dashboard == null && !wh.loading) wh.refreshAll();
      final pc = context.read<PrivateCompanyProvider>();
      if (_pcHubShowsConflictsTab(pc)) {
        context.read<ConflictsProvider>().fetchWorkspaceConflicts();
      }
      if (_pcHubShowsMaintenanceReasonsTabs(pc)) {
        final n = DateTime.now();
        final end = DateTime(n.year, n.month, n.day);
        final start = end.subtract(const Duration(days: 89));
        pc.fetchMaintenanceReasons();
        pc.fetchMaintenanceReasonAnalytics(from: start, to: end);
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final pc = context.read<PrivateCompanyProvider>();
    _attachPcListener(pc);
    final lenBefore = _tabLength;
    _syncHubTabs(pc);
    if (lenBefore != _tabLength) setState(() {});
  }

  @override
  void dispose() {
    _pcAttached?.removeListener(_onPcChanged);
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final ws = widget.workspace;
    final l10n = AppLocalizations.of(context);
    final showExpensesTab = _pcHubShowsExpensesTab(pc);
    final showMaintReasonsTabs = _pcHubShowsMaintenanceReasonsTabs(pc);
    final showConflictsTab = _pcHubShowsConflictsTab(pc);
    final fieldHub = _pcUsesFieldStaffHub(pc);
    final conflictsPending = context.watch<ConflictsProvider>().workspacePendingCount;
    return Column(
      children: [
        _WorkspaceHeader(workspace: ws),
        if (pc.isStaff &&
            (pc.membership.departmentName != null ||
                pc.membership.role != null ||
                pc.membership.specialization != null))
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF12122A).withAlpha(220),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(18)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your workspace profile',
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (pc.membership.departmentName != null &&
                          pc.membership.departmentName!.trim().isNotEmpty)
                        'Department: ${pc.membership.departmentName}',
                      if (pc.membership.role != null && pc.membership.role!.trim().isNotEmpty)
                        'Role: ${_staffRoleLabel(pc.membership.role!)}',
                      if (pc.membership.specialization != null &&
                          pc.membership.specialization!.trim().isNotEmpty)
                        'Specialization: ${_specLabel(pc.membership.specialization!)}',
                    ].join(' · '),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (pc.error != null)
          _DismissibleBanner(
            text: pc.error!,
            color: const Color(0xFFFF4757),
            icon: Icons.error_outline_rounded,
            onClose: pc.clearMessages,
          ),
        if (pc.lastSuccess != null)
          _DismissibleBanner(
            text: pc.lastSuccess!,
            color: const Color(0xFF00D4AA),
            icon: Icons.check_circle_outline_rounded,
            onClose: pc.clearMessages,
          ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: const Color(0xFF12122A).withAlpha(180),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          child: TabBar(
            controller: _tabs,
            indicator: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: const LinearGradient(
                colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
              ),
            ),
            indicatorSize: TabBarIndicatorSize.tab,
            indicatorPadding: const EdgeInsets.all(4),
            dividerColor: Colors.transparent,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white54,
            labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            unselectedLabelStyle:
                const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: fieldHub
                ? [
                    Tab(
                      icon: const Icon(Icons.dashboard_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_overview'),
                    ),
                    Tab(
                      icon: const Icon(Icons.speed_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_performance'),
                    ),
                    if (showMaintReasonsTabs) ...[
                      Tab(
                        icon: const Icon(Icons.build_circle_outlined, size: 18),
                        text: l10n.t('pc_ws_tab_maint_reasons'),
                      ),
                      Tab(
                        icon: const Icon(Icons.bar_chart_rounded, size: 18),
                        text: l10n.t('pc_ws_tab_maint_reasons_stats'),
                      ),
                    ],
                    if (showExpensesTab)
                      Tab(
                        icon: const Icon(Icons.payments_rounded, size: 18),
                        text: l10n.t('pc_ws_tab_expenses'),
                      ),
                    Tab(
                      icon: const Icon(Icons.inventory_2_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_warehouse'),
                    ),
                  ]
                : [
                    Tab(
                      icon: const Icon(Icons.dashboard_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_overview'),
                    ),
                    Tab(
                      icon: const Icon(Icons.account_tree_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_departments'),
                    ),
                    Tab(
                      icon: const Icon(Icons.groups_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_staff'),
                    ),
                    Tab(
                      icon: const Icon(Icons.checklist_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_checklists'),
                    ),
                    Tab(
                      icon: const Icon(Icons.speed_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_performance'),
                    ),
                    if (showConflictsTab)
                      Tab(
                        icon: Badge(
                          isLabelVisible: conflictsPending > 0,
                          label: Text('$conflictsPending'),
                          child: const Icon(Icons.gavel_rounded, size: 18),
                        ),
                        text: l10n.t('pc_ws_tab_conflicts'),
                      ),
                    if (showMaintReasonsTabs) ...[
                      Tab(
                        icon: const Icon(Icons.build_circle_outlined, size: 18),
                        text: l10n.t('pc_ws_tab_maint_reasons'),
                      ),
                      Tab(
                        icon: const Icon(Icons.bar_chart_rounded, size: 18),
                        text: l10n.t('pc_ws_tab_maint_reasons_stats'),
                      ),
                    ],
                    if (showExpensesTab)
                      Tab(
                        icon: const Icon(Icons.payments_rounded, size: 18),
                        text: l10n.t('pc_ws_tab_expenses'),
                      ),
                    Tab(
                      icon: const Icon(Icons.inventory_2_rounded, size: 18),
                      text: l10n.t('pc_ws_tab_warehouse'),
                    ),
                  ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: fieldHub
                ? [
                    _OverviewTab(workspace: ws),
                    _KpisTab(workspace: ws),
                    if (showMaintReasonsTabs) ...[
                      MaintenanceReasonsManageTab(workspace: ws),
                      const MaintenanceReasonsAnalyticsTab(),
                    ],
                    if (showExpensesTab) const _ExpensesTab(),
                    _WarehouseTab(workspace: ws),
                  ]
                : [
                    _OverviewTab(workspace: ws),
                    _DepartmentsTab(workspace: ws),
                    _StaffTab(workspace: ws),
                    _ChecklistsTab(workspace: ws),
                    _KpisTab(workspace: ws),
                    if (showConflictsTab)
                      const ConflictsScreen(embedded: true, workspaceMode: true),
                    if (showMaintReasonsTabs) ...[
                      MaintenanceReasonsManageTab(workspace: ws),
                      const MaintenanceReasonsAnalyticsTab(),
                    ],
                    if (showExpensesTab) const _ExpensesTab(),
                    _WarehouseTab(workspace: ws),
                  ],
          ),
        ),
      ],
    );
  }
}

// ─── Workspace header (logo + name + status) ───────────────────────────────

class _WorkspaceHeader extends StatelessWidget {
  const _WorkspaceHeader({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6C63FF).withAlpha(80),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Center(
              child: Text(
                workspace.name.isNotEmpty
                    ? workspace.name.substring(0, 1).toUpperCase()
                    : '?',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  workspace.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: workspace.status.color.withAlpha(35),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(workspace.status.icon, size: 12, color: workspace.status.color),
                          const SizedBox(width: 4),
                          Text(
                            _pcStatusLabel(workspace.status, l10n),
                            style: TextStyle(
                              color: workspace.status.color,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (pc.isOwner) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFBBF24).withAlpha(35),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          l10n.t('pc_ws_owner_badge'),
                          style: const TextStyle(
                              color: Color(0xFFFBBF24),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (pc.canExportWorkspaceData)
            Builder(
              builder: (btnContext) {
                return IconButton(
                  tooltip: l10n.t('pc_ws_export_data'),
                  icon: const Icon(Icons.download_rounded, color: Color(0xFF00D4AA)),
                  onPressed: () async {
                    final prov = context.read<PrivateCompanyProvider>();
                    final bytes = await prov.downloadWorkspaceExport(days: 365);
                    if (!context.mounted) return;
                    if (bytes == null || bytes.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(l10n.t('pc_ws_export_failed')),
                          backgroundColor: const Color(0xFFFF4757),
                        ),
                      );
                      return;
                    }
                    try {
                      final dir = await getTemporaryDirectory();
                      final path =
                          '${dir.path}/workspace-export-${DateTime.now().millisecondsSinceEpoch}.json';
                      await File(path).writeAsBytes(bytes);
                      if (!btnContext.mounted) return;
                      final shareOrigin = sharePositionOriginForShareSheet(btnContext);
                      try {
                        await Share.shareXFiles(
                          [
                            XFile(path, mimeType: 'application/json'),
                          ],
                          subject: l10n.t('pc_ws_export_data'),
                          sharePositionOrigin: shareOrigin,
                        );
                      } catch (_) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(l10n.t('pc_expenses_export_share_failed')),
                            backgroundColor: const Color(0xFFFBBF24),
                          ),
                        );
                        return;
                      }
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(l10n.t('pc_ws_export_shared')),
                            backgroundColor: const Color(0xFF00D4AA),
                          ),
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('${l10n.t('pc_ws_export_failed')}: $e'),
                            backgroundColor: const Color(0xFFFF4757),
                          ),
                        );
                      }
                    }
                  },
                );
              },
            ),
          IconButton(
            tooltip: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
            icon: pc.loading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF8B83FF)),
                  )
                : const Icon(Icons.refresh_rounded, color: Color(0xFF8B83FF)),
            onPressed: () => context.read<PrivateCompanyProvider>().refresh(),
          ),
        ],
      ),
    );
  }
}

// ─── Overview tab ──────────────────────────────────────────────────────────

class _OverviewExpensesCard extends StatelessWidget {
  const _OverviewExpensesCard({required this.pc, required this.l10n});

  final PrivateCompanyProvider pc;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final snap = pc.expenseAnalytics;
    final loading = pc.expenseAnalyticsLoading;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF12122A).withAlpha(220),
        border: Border.all(color: Colors.white.withAlpha(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.payments_rounded, color: Color(0xFF00D4AA), size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('pc_overview_expenses_title'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
              if (loading)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00D4AA)),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            l10n.t('pc_overview_expenses_hint', {'days': '${snap?.days ?? 90}'}),
            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12, height: 1.35),
          ),
          if (snap != null && !loading) ...[
            const SizedBox(height: 12),
            Text(
              '${l10n.t('pc_expenses_total')}: ${snap.summaryTotalAmount.toStringAsFixed(2)} IQD · '
              '${snap.summaryExpenseCount} ${l10n.t('pc_expenses_lines').toLowerCase()} · '
              '${snap.summaryTicketCount} ${l10n.t('pc_expenses_tickets').toLowerCase()}',
              style: const TextStyle(
                color: Color(0xFF00D4AA),
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
            if (snap.byReason.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                l10n.t('pc_overview_expenses_by_reason'),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
              ),
              const SizedBox(height: 6),
              ...snap.byReason.take(20).map((r) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          r.reason,
                          style: const TextStyle(color: Colors.white70, fontSize: 13),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        '${r.totalAmount.toStringAsFixed(2)} IQD',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '×${r.expenseCount}',
                        style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
                      ),
                    ],
                  ),
                );
              }),
              if (snap.byReason.length > 20)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('…', style: TextStyle(color: Colors.white.withAlpha(100))),
                ),
            ],
            if (snap.byProvinceReasons.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                l10n.t('pc_overview_expenses_by_province'),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
              ),
              const SizedBox(height: 6),
              ...snap.byProvinceReasons.take(12).map((p) {
                return Theme(
                  data: Theme.of(context).copyWith(dividerColor: Colors.white24),
                  child: ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    collapsedIconColor: Colors.white54,
                    iconColor: Colors.white70,
                    title: Text(
                      p.province.isEmpty ? '—' : p.province,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      '${p.totalAmount.toStringAsFixed(2)} IQD · ${p.expenseCount} ${l10n.t('pc_expenses_lines').toLowerCase()}',
                      style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                    ),
                    children: [
                      if (p.reasons.isEmpty)
                        Text(
                          '—',
                          style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 12),
                        )
                      else
                        ...p.reasons.map((r) {
                          return Padding(
                            padding: const EdgeInsets.only(left: 8, bottom: 6),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    r.reason,
                                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Text(
                                  '${r.totalAmount.toStringAsFixed(2)} IQD',
                                  style: const TextStyle(color: Colors.white54, fontSize: 12),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  '×${r.expenseCount}',
                                  style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 11),
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                );
              }),
            ],
          ],
          if (snap == null && !loading)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l10n.t('pc_kpi_error_subtitle'),
                style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}

class _OverviewTab extends StatefulWidget {
  const _OverviewTab({required this.workspace});

  final PrivateCompanyWorkspace workspace;

  @override
  State<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<_OverviewTab> {
  bool _expenseBootstrap = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_expenseBootstrap) return;
    final pc = context.read<PrivateCompanyProvider>();
    if (!_pcHubShowsExpensesTab(pc)) return;
    _expenseBootstrap = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<PrivateCompanyProvider>().fetchExpenseAnalytics(days: 90);
    });
  }

  void _openBroadcast(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BroadcastSheet(workspace: widget.workspace),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    final workspace = widget.workspace;
    final byRole = <String, int>{};
    for (final s in workspace.staff) {
      byRole[s.role] = (byRole[s.role] ?? 0) + 1;
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (pc.canBroadcastNotifications) ...[
          _GradientButton(
            onPressed: pc.submitting ? null : () => _openBroadcast(context),
            label: 'Send notification',
            icon: Icons.campaign_rounded,
            stretch: true,
          ),
          const SizedBox(height: 14),
        ],
        if (pc.canManageWorkspaceTechniques) ...[
          _GradientButton(
            onPressed: pc.submitting
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const WorkspaceTechniquesScreen(),
                      ),
                    );
                  },
            label: l10n.t('pc_ws_manage_techniques_btn'),
            icon: Icons.category_rounded,
            stretch: true,
          ),
          const SizedBox(height: 14),
        ],
        Row(
          children: [
            Expanded(
              child: _KpiTile(
                value: '${workspace.departments.length}',
                label: 'Departments',
                icon: Icons.account_tree_rounded,
                color: const Color(0xFF6C63FF),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KpiTile(
                value: '${workspace.staff.length}',
                label: 'Staff',
                icon: Icons.groups_rounded,
                color: const Color(0xFF00D4AA),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _KpiTile(
                value: '${workspace.checklists.length}',
                label: 'Checklists',
                icon: Icons.checklist_rounded,
                color: const Color(0xFFFBBF24),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KpiTile(
                value: '${byRole['ENGINEER'] ?? 0}',
                label: 'Engineers',
                icon: Icons.engineering_rounded,
                color: const Color(0xFF38BDF8),
              ),
            ),
          ],
        ),
        if (byRole.isNotEmpty) ...[
          const SizedBox(height: 22),
          const _SectionTitle('Staff by role'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: byRole.entries.map((e) {
              final color = _staffRoleColor(e.key);
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: color.withAlpha(28),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: color.withAlpha(80)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _staffRoleLabel(e.key),
                      style: TextStyle(
                          color: color, fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${e.value}',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
        if (_pcHubShowsExpensesTab(pc)) ...[
          const SizedBox(height: 22),
          _OverviewExpensesCard(pc: pc, l10n: l10n),
        ],
        const SizedBox(height: 22),
        const _SectionTitle('Recent staff'),
        const SizedBox(height: 8),
        if (workspace.staff.isEmpty)
          _EmptyMicroCard(
            icon: Icons.group_add_rounded,
            text: 'No staff yet — add your first manager from the Staff tab.',
          )
        else
          ...workspace.staff.take(4).map((s) => _StaffRow(staff: s, departments: workspace.departments)),
      ],
    );
  }
}

// ─── Departments tab ───────────────────────────────────────────────────────

class _DepartmentsTab extends StatefulWidget {
  const _DepartmentsTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_DepartmentsTab> createState() => _DepartmentsTabState();
}

class _DepartmentsTabState extends State<_DepartmentsTab> {
  void _openCreate({PrivateCompanyDepartment? existing}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _DepartmentEditorSheet(existing: existing),
    );
  }

  Future<void> _confirmDelete(PrivateCompanyDepartment d) async {
    final provider = context.read<PrivateCompanyProvider>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Delete department?',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          'Members of "${d.name}" will be unassigned but their accounts remain active.',
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF4757),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await provider.deleteDepartment(d.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final ws = widget.workspace;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (pc.canManageDepartments)
          _GradientButton(
            onPressed: pc.submitting ? null : () => _openCreate(),
            label: 'New department',
            icon: Icons.add_rounded,
            stretch: true,
          ),
        const SizedBox(height: 14),
        if (ws.departments.isEmpty)
          _EmptyState(
            icon: Icons.account_tree_outlined,
            title: 'No departments yet',
            subtitle: pc.canManageDepartments
                ? 'Create departments to organize your team and assign tickets cleanly.'
                : 'Your owner has not created any department yet.',
          )
        else
          ...ws.departments.map((d) {
            final color = d.colorValue;
            return _GlassCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: color.withAlpha(35),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(_iconFromKey(d.iconKey),
                            color: color, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              d.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${d.memberCount} member${d.memberCount == 1 ? '' : 's'}',
                              style: TextStyle(
                                  color: Colors.white.withAlpha(140),
                                  fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      if (pc.canManageDepartments)
                        PopupMenuButton<String>(
                          color: const Color(0xFF12122A),
                          icon: const Icon(Icons.more_vert_rounded, color: Colors.white54),
                          onSelected: (v) {
                            if (v == 'edit') _openCreate(existing: d);
                            if (v == 'delete') _confirmDelete(d);
                            if (v == 'reasons') {
                              DepartmentMaintenanceReasonsSheet.show(context, d);
                            }
                          },
                          itemBuilder: (_) => [
                            if (pc.canManageMaintenanceReasons &&
                                (pc.isOwner || pc.myDepartmentId == d.id))
                              const PopupMenuItem(
                                value: 'reasons',
                                child: Text(
                                  'Completion reasons',
                                  style: TextStyle(color: Colors.white),
                                ),
                              ),
                            if (pc.canManageDepartments) ...const [
                              PopupMenuItem(
                                value: 'edit',
                                child: Text('Edit', style: TextStyle(color: Colors.white)),
                              ),
                              PopupMenuItem(
                                value: 'delete',
                                child: Text('Delete', style: TextStyle(color: Color(0xFFFF4757))),
                              ),
                            ],
                          ],
                        ),
                    ],
                  ),
                  if (d.description != null && d.description!.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(
                      d.description!,
                      style: TextStyle(
                          color: Colors.white.withAlpha(180), fontSize: 13),
                    ),
                  ],
                  if (d.members.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: d.members.take(8).map((m) {
                        final c = _staffRoleColor(m.role);
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: c.withAlpha(28),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: c.withAlpha(60)),
                          ),
                          child: Text(
                            '${m.name ?? m.username} · ${_staffRoleLabel(m.role)}',
                            style: TextStyle(
                              color: c,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            );
          }),
      ],
    );
  }
}

class _DepartmentEditorSheet extends StatefulWidget {
  const _DepartmentEditorSheet({this.existing});
  final PrivateCompanyDepartment? existing;

  @override
  State<_DepartmentEditorSheet> createState() => _DepartmentEditorSheetState();
}

class _DepartmentEditorSheetState extends State<_DepartmentEditorSheet> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _proxRadius;
  String _color = '#6C63FF';
  String? _iconKey;
  bool _proxJoin = false;
  bool _siteArrivalAuto = true;
  bool _engineerAvailabilityPool = true;
  bool _technicianAvailabilityPool = true;
  String _maintDispatchMode = 'DIRECT_TECHNICIAN';
  String _engineerTicketScope = 'BOTH';

  static const _iconOptions = <String, IconData>{
    'engineering': Icons.engineering_rounded,
    'electrical': Icons.electrical_services_rounded,
    'tools': Icons.handyman_rounded,
    'civil': Icons.architecture_rounded,
    'mechanical': Icons.precision_manufacturing_rounded,
    'telecom': Icons.cell_tower_rounded,
    'office': Icons.work_rounded,
    'safety': Icons.health_and_safety_rounded,
  };

  static const _colorOptions = <String>[
    '#6C63FF',
    '#00D4AA',
    '#FBBF24',
    '#38BDF8',
    '#FF9F43',
    '#A78BFA',
    '#4ADE80',
    '#FF4757',
  ];

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.existing?.name ?? '');
    _description = TextEditingController(text: widget.existing?.description ?? '');
    _proxJoin = widget.existing?.maintenanceProximityJoinEnabled ?? false;
    _siteArrivalAuto = widget.existing?.siteArrivalAutoOnSiteEnabled != false;
    _proxRadius = TextEditingController(
      text: '${widget.existing?.maintenanceProximityRadiusM ?? 500}',
    );
    _color = widget.existing?.color ?? _colorOptions[math.Random().nextInt(_colorOptions.length)];
    _iconKey = widget.existing?.iconKey;
    _engineerAvailabilityPool = widget.existing?.engineerAvailabilityPoolEnabled ?? true;
    _technicianAvailabilityPool = widget.existing?.technicianAvailabilityPoolEnabled ?? true;
    _maintDispatchMode = widget.existing?.maintenanceDispatchMode ?? 'DIRECT_TECHNICIAN';
    _engineerTicketScope = widget.existing?.engineerTicketScope ?? 'BOTH';
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _proxRadius.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pc = context.read<PrivateCompanyProvider>();
    final name = _name.text.trim();
    if (name.isEmpty) return;
    bool ok;
    if (widget.existing == null) {
      ok = await pc.createDepartment(
        name: name,
        description: _description.text.trim(),
        color: _color,
        iconKey: _iconKey,
        engineerAvailabilityPoolEnabled: _engineerAvailabilityPool,
        technicianAvailabilityPoolEnabled: _technicianAvailabilityPool,
        maintenanceDispatchMode: _maintDispatchMode,
        engineerTicketScope: _engineerTicketScope,
      );
    } else {
      final r = int.tryParse(_proxRadius.text.trim());
      final radius = (r != null && r >= 10 && r <= 5000) ? r : 500;
      ok = await pc.updateDepartment(
        widget.existing!.id,
        name: name,
        description: _description.text.trim(),
        color: _color,
        iconKey: _iconKey ?? '',
        maintenanceProximityJoinEnabled: _proxJoin,
        maintenanceProximityRadiusM: radius,
        siteArrivalAutoOnSiteEnabled: _siteArrivalAuto,
        engineerAvailabilityPoolEnabled: _engineerAvailabilityPool,
        technicianAvailabilityPoolEnabled: _technicianAvailabilityPool,
        maintenanceDispatchMode: _maintDispatchMode,
        engineerTicketScope: _engineerTicketScope,
      );
    }
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(
                  context,
                  widget.existing == null ? 'New department' : 'Edit department',
                ),
                const SizedBox(height: 18),
                _DarkField(
                  controller: _name,
                  label: 'Name *',
                  hint: 'e.g. Electrical',
                  icon: Icons.account_tree_rounded,
                ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: _description,
                  label: 'Description',
                  hint: 'What does this department do?',
                  icon: Icons.description_outlined,
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                const _SectionTitle('Color'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _colorOptions.map((c) {
                    final selected = c == _color;
                    final col = Color(int.parse('FF${c.substring(1)}', radix: 16));
                    return GestureDetector(
                      onTap: () => setState(() => _color = c),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: col,
                          shape: BoxShape.circle,
                          border: Border.all(
                              color: selected ? Colors.white : Colors.white12,
                              width: selected ? 2.5 : 1),
                          boxShadow: selected
                              ? [BoxShadow(color: col.withAlpha(140), blurRadius: 12)]
                              : null,
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                const _SectionTitle('Icon'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _iconOptions.entries.map((entry) {
                    final selected = _iconKey == entry.key;
                    final color = Color(int.parse('FF${_color.substring(1)}', radix: 16));
                    return GestureDetector(
                      onTap: () => setState(() => _iconKey = entry.key),
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: selected ? color.withAlpha(40) : Colors.white10,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: selected ? color : Colors.white24,
                              width: selected ? 1.5 : 1),
                        ),
                        child: Icon(entry.value, color: selected ? color : Colors.white54),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),
                const _SectionTitle('Availability pool'),
                const SizedBox(height: 6),
                Text(
                  'When off, engineers or technicians in this department cannot browse or self-assign unassigned workspace tickets from the Available tab (they still see tickets already assigned to them).',
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 10),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'Engineers — QC availability pool',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    'Pending inspection / QC tickets this department may claim.',
                    style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                  ),
                  value: _engineerAvailabilityPool,
                  activeThumbColor: const Color(0xFF6C63FF),
                  onChanged: (v) => setState(() => _engineerAvailabilityPool = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'Technicians — maintenance availability pool',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    'Pending maintenance tickets this department may claim.',
                    style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                  ),
                  value: _technicianAvailabilityPool,
                  activeThumbColor: const Color(0xFF00D4AA),
                  onChanged: (v) => setState(() => _technicianAvailabilityPool = v),
                ),
                const SizedBox(height: 20),
                _SectionTitle(l10n.t('pc_dept_maintenance_dispatch_title')),
                const SizedBox(height: 6),
                Text(
                  l10n.t('pc_dept_maintenance_dispatch_subtitle'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment<String>(
                      value: 'DIRECT_TECHNICIAN',
                      label: Text(
                        l10n.t('pc_dispatch_direct'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                    ButtonSegment<String>(
                      value: 'ENGINEER_ASSIGNS',
                      label: Text(
                        l10n.t('pc_dispatch_engineer'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                  selected: {_maintDispatchMode},
                  onSelectionChanged: (v) {
                    if (v.isEmpty) return;
                    setState(() => _maintDispatchMode = v.first);
                  },
                ),
                const SizedBox(height: 8),
                Text(
                  _maintDispatchMode == 'ENGINEER_ASSIGNS'
                      ? l10n.t('pc_dispatch_engineer_desc')
                      : l10n.t('pc_dispatch_direct_desc'),
                  style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11, height: 1.35),
                ),
                const SizedBox(height: 20),
                const _SectionTitle('Engineers — ticket types'),
                const SizedBox(height: 6),
                Text(
                  'Default for all engineers in this department. Override per engineer when editing staff.',
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'QC_ONLY',
                      label: Text('QC only', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                    ButtonSegment(
                      value: 'MAINTENANCE_ONLY',
                      label: Text('Maint.', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                    ButtonSegment(
                      value: 'BOTH',
                      label: Text('Both', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                  ],
                  selected: {_engineerTicketScope},
                  onSelectionChanged: (v) {
                    if (v.isEmpty) return;
                    setState(() => _engineerTicketScope = v.first);
                  },
                ),
                if (widget.existing != null) ...[
                  const SizedBox(height: 20),
                  _SectionTitle(l10n.t('pc_dept_workspace_field_crew_title')),
                  const SizedBox(height: 6),
                  Text(
                    l10n.t('pc_dept_workspace_field_crew_desc'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(150),
                      fontSize: 11.5,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      l10n.t('pc_dept_workspace_field_crew_switch'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      l10n.t('pc_dept_workspace_field_crew_switch_sub'),
                      style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                    ),
                    value: _proxJoin,
                    activeThumbColor: const Color(0xFF00D4AA),
                    onChanged: (v) => setState(() => _proxJoin = v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Auto ON_SITE when near job site',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      'Assigned maintenance and QC tickets stay pending until the lead is within the radius below.',
                      style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                    ),
                    value: _siteArrivalAuto,
                    activeThumbColor: const Color(0xFF00D4AA),
                    onChanged: (v) => setState(() => _siteArrivalAuto = v),
                  ),
                  _DarkField(
                    controller: _proxRadius,
                    label: 'Site arrival & crew radius (m)',
                    hint: '500',
                    icon: Icons.radar_rounded,
                    keyboardType: TextInputType.number,
                  ),
                ],
                const SizedBox(height: 22),
                _GradientButton(
                  onPressed: pc.submitting ? null : _submit,
                  label: pc.submitting
                      ? 'Saving…'
                      : (widget.existing == null ? 'Create department' : 'Save changes'),
                  icon: Icons.check_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Staff tab ─────────────────────────────────────────────────────────────

class _StaffTab extends StatefulWidget {
  const _StaffTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends State<_StaffTab> {
  String? _filterDepartmentId;
  String? _filterRole;

  void _openCreate({PrivateCompanyStaff? existing}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _StaffEditorSheet(
        existing: existing,
        departments: widget.workspace.departments,
      ),
    );
  }

  Future<void> _resetPassword(PrivateCompanyStaff staff) async {
    final pc = context.read<PrivateCompanyProvider>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Reset password?',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          'A new temporary password will be generated for "${staff.name ?? staff.username}". '
          'They will be required to change it on first login. Make sure to copy '
          'the new password — it is shown only once.',
          style: TextStyle(color: Colors.white.withAlpha(180), height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel',
                style: TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF8B5CF6),
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Reset password',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final newPassword = await pc.resetStaffPassword(staff.id);
    if (!mounted || newPassword == null) return;
    await _showCredentialsDialog(staff.username, newPassword);
  }

  Future<void> _showCredentialsDialog(String username, String temporaryPassword) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: const [
            Icon(Icons.vpn_key_rounded, color: Color(0xFF8B5CF6)),
            SizedBox(width: 8),
            Text('New temporary password',
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w800)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Share these credentials with the staff member. They will be '
              'required to change the password on next sign-in.',
              style: TextStyle(color: Colors.white.withAlpha(180), height: 1.4),
            ),
            const SizedBox(height: 16),
            _CredentialRow(label: 'Username', value: username),
            const SizedBox(height: 8),
            _CredentialRow(label: 'Temporary password', value: temporaryPassword),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFB400).withAlpha(20),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFFB400).withAlpha(60)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: Color(0xFFFFB400), size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This password will not be shown again.',
                      style: TextStyle(
                          color: Colors.white.withAlpha(220), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Done', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final filtered = widget.workspace.staff.where((s) {
      if (_filterDepartmentId != null && s.departmentId != _filterDepartmentId) {
        return false;
      }
      if (_filterRole != null && s.role != _filterRole) return false;
      return true;
    }).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (pc.canManageStaff)
          _GradientButton(
            onPressed: pc.submitting ? null : () => _openCreate(),
            label: 'Add staff member',
            icon: Icons.person_add_rounded,
            stretch: true,
          ),
        const SizedBox(height: 14),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterChip(
                selected: _filterRole == null && _filterDepartmentId == null,
                label: 'All',
                onTap: () => setState(() {
                  _filterRole = null;
                  _filterDepartmentId = null;
                }),
              ),
              ...[
                'MANAGER',
                'COORDINATOR',
                'ENGINEER',
                'TECHNICIAN',
                'WORKER',
                'WAREHOUSE_KEEPER',
              ].map((r) {
                return _FilterChip(
                  selected: _filterRole == r,
                  label: _staffRoleLabel(r),
                  color: _staffRoleColor(r),
                  onTap: () => setState(() {
                    _filterRole = _filterRole == r ? null : r;
                  }),
                );
              }),
              ...widget.workspace.departments.map((d) {
                return _FilterChip(
                  selected: _filterDepartmentId == d.id,
                  label: d.name,
                  color: d.colorValue,
                  onTap: () => setState(() {
                    _filterDepartmentId =
                        _filterDepartmentId == d.id ? null : d.id;
                  }),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (filtered.isEmpty)
          _EmptyState(
            icon: Icons.group_off_rounded,
            title: 'No matching staff',
            subtitle: pc.canManageStaff
                ? 'Adjust filters or add a new staff member.'
                : 'No staff to show for this filter.',
          )
        else
          ...filtered.map((s) => _StaffRow(
                staff: s,
                departments: widget.workspace.departments,
                onEdit: pc.canManageStaff
                    ? () => _openCreate(existing: s)
                    : null,
                onResetPassword:
                    pc.canManageStaff ? () => _resetPassword(s) : null,
              )),
      ],
    );
  }
}

class _StaffEditorSheet extends StatefulWidget {
  const _StaffEditorSheet({this.existing, required this.departments});
  final PrivateCompanyStaff? existing;
  final List<PrivateCompanyDepartment> departments;

  @override
  State<_StaffEditorSheet> createState() => _StaffEditorSheetState();
}

class _StaffEditorSheetState extends State<_StaffEditorSheet> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  String _role = 'TECHNICIAN';
  String? _departmentId;
  String? _specialization;
  String? _province;
  String? _engineerTicketScopeOverride;

  bool _initialDefaultsApplied = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      final parts = (e.name ?? '').split(' ');
      _firstName.text = parts.isNotEmpty ? parts.first : (e.username);
      _lastName.text = parts.length > 1 ? parts.sublist(1).join(' ') : '';
      _email.text = e.email ?? '';
      _phone.text = e.phone ?? '';
      _role = e.role.isNotEmpty ? e.role : 'TECHNICIAN';
      _departmentId = e.departmentId;
      _specialization = e.specialization;
      _province = e.province;
      _engineerTicketScopeOverride = e.engineerTicketScopeOverride;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialDefaultsApplied) return;
    final pc = context.read<PrivateCompanyProvider>();
    if (widget.existing == null && pc.isDepartmentManager) {
      // Lock the new staff member to the manager's own department and to the
      // execution roles the backend will accept.
      _departmentId = pc.myDepartmentId;
      const allowedManagerRoles = {'ENGINEER', 'TECHNICIAN', 'WORKER'};
      if (!allowedManagerRoles.contains(_role)) {
        _role = 'TECHNICIAN';
      }
    }
    _initialDefaultsApplied = true;
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pc = context.read<PrivateCompanyProvider>();
    final firstName = _firstName.text.trim();
    if (firstName.isEmpty) return;
    final province = _province;
    if (province == null || province.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Please pick the staff member’s province so notifications can be routed correctly.'),
        ),
      );
      return;
    }
    if (widget.existing == null) {
      const needDept = {'ENGINEER', 'TECHNICIAN', 'WORKER'};
      if (needDept.contains(_role) &&
          (_departmentId == null || _departmentId!.trim().isEmpty)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Pick a workspace department for technicians, engineers, and workers so tickets can match their team.',
            ),
          ),
        );
        return;
      }
      final temp = await pc.createStaff(
        firstName: firstName,
        lastName: _lastName.text.trim(),
        email: _email.text.trim(),
        phone: _phone.text.trim(),
        role: _role,
        departmentId: _departmentId,
        specialization: _specialization,
        province: province,
      );
      if (mounted && temp != null) {
        Navigator.pop(context);
      }
    } else {
      final ok = await pc.updateStaff(
        widget.existing!.id,
        role: _role,
        departmentId: _departmentId ?? '',
        specialization: _specialization ?? '',
        name: '${_firstName.text.trim()} ${_lastName.text.trim()}'.trim(),
        province: province,
        clearEngineerTicketScopeOverride: _role == 'ENGINEER' && _engineerTicketScopeOverride == null,
        privateCompanyEngineerTicketScope:
            _role == 'ENGINEER' ? _engineerTicketScopeOverride : null,
      );
      if (ok && mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final isEdit = widget.existing != null;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(
                  context,
                  isEdit ? 'Edit staff' : 'Add staff member',
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(child: _DarkField(controller: _firstName, label: 'First name *', hint: 'Ahmed', icon: Icons.person_outline_rounded)),
                    const SizedBox(width: 10),
                    Expanded(child: _DarkField(controller: _lastName, label: 'Last name', hint: 'Al-Rasheed', icon: Icons.person_outline_rounded)),
                  ],
                ),
                const SizedBox(height: 12),
                _DarkField(controller: _email, label: 'Email', hint: 'name@example.com', icon: Icons.email_outlined, keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 12),
                _DarkField(controller: _phone, label: 'Phone', hint: '+9647...', icon: Icons.phone_outlined, keyboardType: TextInputType.phone),
                const SizedBox(height: 18),
                const _SectionTitle('Role'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: () {
                    // Owners can grant every staff role. Managers / coordinators
                    // can only assign the "execution" roles to their own team.
                    final allRoles = const [
                      'MANAGER',
                      'COORDINATOR',
                      'ENGINEER',
                      'TECHNICIAN',
                      'WORKER',
                      'WAREHOUSE_KEEPER',
                    ];
                    final allowed = pc.isOwner
                        ? allRoles
                        : const ['ENGINEER', 'TECHNICIAN', 'WORKER'];
                    return allowed.map((r) {
                      final selected = _role == r;
                      final color = _staffRoleColor(r);
                      return GestureDetector(
                        onTap: () => setState(() => _role = r),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? color.withAlpha(40) : Colors.white10,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: selected ? color : Colors.white24,
                                width: selected ? 1.4 : 1),
                          ),
                          child: Text(
                            _staffRoleLabel(r),
                            style: TextStyle(
                              color: selected ? color : Colors.white60,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      );
                    }).toList();
                  }(),
                ),
                if (pc.isOwner) ...[
                  const SizedBox(height: 10),
                  Text(
                    'You can add multiple managers, coordinators, or warehouse keepers — each login is a separate staff account with its own role.',
                    style: TextStyle(
                      color: Colors.white.withAlpha(150),
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                const _SectionTitle('Department'),
                const SizedBox(height: 8),
                if (pc.isDepartmentManager)
                  // Managers / coordinators can only add staff inside their own
                  // department, so we render a locked badge instead of a picker.
                  Builder(builder: (_) {
                    final myDept = widget.departments
                        .cast<PrivateCompanyDepartment?>()
                        .firstWhere(
                          (d) => d?.id == pc.myDepartmentId,
                          orElse: () => null,
                        );
                    final color = myDept?.colorValue ?? const Color(0xFF6B7280);
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: color.withAlpha(28),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: color.withAlpha(80)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.lock_outline_rounded,
                              color: color, size: 16),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              myDept?.name ?? 'Your department',
                              style: TextStyle(
                                color: color,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          Text(
                            'Locked to your team',
                            style: TextStyle(
                              color: Colors.white.withAlpha(140),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    );
                  })
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _departmentId = null),
                        child: _ChipBox(
                          label: 'No department',
                          selected: _departmentId == null,
                          color: const Color(0xFF6B7280),
                        ),
                      ),
                      ...widget.departments.map((d) => GestureDetector(
                            onTap: () =>
                                setState(() => _departmentId = d.id),
                            child: _ChipBox(
                              label: d.name,
                              selected: _departmentId == d.id,
                              color: d.colorValue,
                            ),
                          )),
                    ],
                  ),
                if (_role == 'ENGINEER' && pc.isOwner) ...[
                  const SizedBox(height: 18),
                  const _SectionTitle('Engineer ticket types'),
                  const SizedBox(height: 6),
                  Text(
                    'Leave as department default, or override for this engineer only.',
                    style: TextStyle(
                      color: Colors.white.withAlpha(150),
                      fontSize: 11.5,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _engineerTicketScopeOverride = null),
                        child: _ChipBox(
                          label: 'Dept default',
                          selected: _engineerTicketScopeOverride == null,
                          color: const Color(0xFF6B7280),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _engineerTicketScopeOverride = 'QC_ONLY'),
                        child: _ChipBox(
                          label: 'QC only',
                          selected: _engineerTicketScopeOverride == 'QC_ONLY',
                          color: const Color(0xFF4ADE80),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _engineerTicketScopeOverride = 'MAINTENANCE_ONLY'),
                        child: _ChipBox(
                          label: 'Maintenance only',
                          selected: _engineerTicketScopeOverride == 'MAINTENANCE_ONLY',
                          color: const Color(0xFF00D4AA),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _engineerTicketScopeOverride = 'BOTH'),
                        child: _ChipBox(
                          label: 'Both',
                          selected: _engineerTicketScopeOverride == 'BOTH',
                          color: const Color(0xFF6C63FF),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                const _SectionTitle('Specialization'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    'ELECTRICAL',
                    'MECHANICAL',
                    'CIVIL',
                    'TELECOM',
                    'PROGRAMMER',
                  ].map((s) {
                    final selected = _specialization == s;
                    return GestureDetector(
                      onTap: () => setState(() {
                        _specialization = selected ? null : s;
                      }),
                      child: _ChipBox(
                        label: _specLabel(s),
                        selected: selected,
                        color: _specColor(s),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    const _SectionTitle('Province *'),
                    const SizedBox(width: 6),
                    Icon(Icons.public_rounded,
                        color: Colors.white.withAlpha(120), size: 14),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Used to route ticket & announcement notifications to staff in this governorate.',
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kIraqProvinces.map((p) {
                    final selected = _province == p;
                    return GestureDetector(
                      onTap: () => setState(() => _province = p),
                      child: _ChipBox(
                        label: p,
                        selected: selected,
                        color: const Color(0xFF38BDF8),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 22),
                _GradientButton(
                  onPressed: pc.submitting ? null : _submit,
                  label: pc.submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create staff'),
                  icon: Icons.person_add_alt_1_rounded,
                  stretch: true,
                ),
                if (!isEdit)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      'A username + temporary password is generated automatically. Share it once with the new staff member.',
                      style: TextStyle(
                          color: Colors.white.withAlpha(140), fontSize: 11),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StaffRow extends StatelessWidget {
  const _StaffRow({
    required this.staff,
    required this.departments,
    this.onEdit,
    this.onResetPassword,
  });
  final PrivateCompanyStaff staff;
  final List<PrivateCompanyDepartment> departments;
  final VoidCallback? onEdit;
  final VoidCallback? onResetPassword;

  @override
  Widget build(BuildContext context) {
    final color = _staffRoleColor(staff.role);
    final dept = staff.departmentId == null
        ? null
        : departments.cast<PrivateCompanyDepartment?>().firstWhere(
              (d) => d?.id == staff.departmentId,
              orElse: () => null,
            );
    return _GlassCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: color.withAlpha(35),
            child: Text(
              (staff.name ?? staff.username).isNotEmpty
                  ? (staff.name ?? staff.username)[0].toUpperCase()
                  : '?',
              style: TextStyle(
                color: color,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  staff.name ?? staff.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    _StaffBadge(
                      label: _staffRoleLabel(staff.role),
                      color: color,
                    ),
                    if (staff.specialization != null)
                      _StaffBadge(
                        label: _specLabel(staff.specialization!),
                        color: _specColor(staff.specialization!),
                      ),
                    if (dept != null)
                      _StaffBadge(
                        label: dept.name,
                        color: dept.colorValue,
                      ),
                    if (staff.province != null && staff.province!.isNotEmpty)
                      _StaffBadge(
                        label: staff.province!,
                        color: const Color(0xFF38BDF8),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '@${staff.username}${staff.email != null ? ' · ${staff.email}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: Colors.white.withAlpha(120), fontSize: 11),
                ),
              ],
            ),
          ),
          if (onResetPassword != null)
            IconButton(
              tooltip: 'Reset password',
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.vpn_key_rounded,
                  color: Color(0xFF8B5CF6), size: 18),
              onPressed: onResetPassword,
            ),
          if (onEdit != null)
            IconButton(
              tooltip: 'Edit',
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.edit_rounded,
                  color: Color(0xFF8B83FF), size: 18),
              onPressed: onEdit,
            ),
        ],
      ),
    );
  }
}

class _SeverityChip extends StatelessWidget {
  const _SeverityChip({
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? color.withAlpha(60) : Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? color : Colors.white.withAlpha(20),
            width: selected ? 1.2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              size: 12,
              color: selected ? color : Colors.white.withAlpha(120),
            ),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                color: selected ? color : Colors.white.withAlpha(160),
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StaffBadge extends StatelessWidget {
  const _StaffBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(28),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
            color: color, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _CredentialRow extends StatelessWidget {
  const _CredentialRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withAlpha(24)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        color: Colors.white.withAlpha(160),
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                SelectableText(
                  value,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()]),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Copy',
            icon: const Icon(Icons.copy_rounded,
                color: Color(0xFF8B83FF), size: 18),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('$label copied'),
                  duration: const Duration(seconds: 2),
                  behavior: SnackBarBehavior.floating,
                  backgroundColor: const Color(0xFF12122A),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─── Checklists tab ─────────────────────────────────────────────────────────

class _ChecklistsTab extends StatefulWidget {
  const _ChecklistsTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_ChecklistsTab> createState() => _ChecklistsTabState();
}

class _ChecklistsTabState extends State<_ChecklistsTab> {
  void _openCreate() {
    _openEditor();
  }

  void _openEditor({PrivateCompanyChecklist? existing}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ChecklistEditorSheet(
        workspace: widget.workspace,
        existing: existing,
      ),
    );
  }

  void _openDetail(PrivateCompanyChecklist c) {
    final pc = context.read<PrivateCompanyProvider>();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => WorkspaceChecklistDetailScreen(
          checklist: c,
          workspace: widget.workspace,
          onEdit: pc.canManageChecklists ? () => _openEditor(existing: c) : null,
          onDelete: pc.canCreateChecklists
              ? () async {
                  await _confirmDelete(c);
                  if (mounted) Navigator.pop(context);
                }
              : null,
        ),
      ),
    );
  }

  Future<void> _confirmDelete(PrivateCompanyChecklist c) async {
    final provider = context.read<PrivateCompanyProvider>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Delete checklist?',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          'Tickets that already used "${c.name}" will keep their data, but new tickets won\'t be able to attach it.',
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF4757),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await provider.deleteChecklist(c.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (pc.canCreateChecklists)
          _GradientButton(
            onPressed: pc.submitting ? null : _openCreate,
            label: 'New checklist',
            icon: Icons.add_task_rounded,
            stretch: true,
          )
        else
          _MessageBanner(
            icon: Icons.lock_outline_rounded,
            text: 'Only managers, coordinators, engineers, or the owner can create checklists.',
            color: const Color(0xFFFBBF24),
          ),
        const SizedBox(height: 14),
        if (widget.workspace.checklists.isEmpty)
          _EmptyState(
            icon: Icons.checklist_rounded,
            title: 'No checklists yet',
            subtitle:
                'Build reusable lists. Anyone in the workspace can attach them to a ticket before it is opened.',
          )
        else
          ...widget.workspace.checklists.map((c) {
            final l10n = AppLocalizations.of(context);
            final color = _categoryColor(c.category);
            final desc = (c.description ?? '').trim();
            return _GlassCard(
              margin: const EdgeInsets.only(bottom: 10),
              onTap: () => _openDetail(c),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: color.withAlpha(35),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.checklist_rounded, color: color, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.name,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (desc.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            desc,
                            style: TextStyle(
                              color: Colors.white.withAlpha(150),
                              fontSize: 12,
                              height: 1.3,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(
                          '${c.items.length} ${l10n.t('pc_checklist_items')}',
                          style: TextStyle(
                            color: Colors.white.withAlpha(120),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded,
                      color: Colors.white.withAlpha(100)),
                ],
              ),
            );
          }),
      ],
    );
  }
}

class _ChecklistEditorSheet extends StatefulWidget {
  const _ChecklistEditorSheet({
    required this.workspace,
    this.existing,
  });
  final PrivateCompanyWorkspace workspace;
  final PrivateCompanyChecklist? existing;

  @override
  State<_ChecklistEditorSheet> createState() => _ChecklistEditorSheetState();
}

class _ChecklistDraftItem {
  _ChecklistDraftItem({
    String? text,
    PrivateCompanyChecklistItemSeverity severity =
        PrivateCompanyChecklistItemSeverity.minor,
  })  : controller = TextEditingController(text: text ?? ''),
        severity = severity;

  final TextEditingController controller;
  PrivateCompanyChecklistItemSeverity severity;

  void dispose() => controller.dispose();
}

class _ChecklistEditorSheetState extends State<_ChecklistEditorSheet> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late String? _category;
  late String? _departmentId;
  late final List<_ChecklistDraftItem> _items;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final ex = widget.existing;
    _name = TextEditingController(text: ex?.name ?? '');
    _description = TextEditingController(text: ex?.description ?? '');
    _category = ex?.category;
    _departmentId = ex?.departmentId;
    if (ex != null && ex.items.isNotEmpty) {
      _items = ex.items
          .map((it) => _ChecklistDraftItem(
                text: it.label,
                severity: it.severity,
              ))
          .toList();
    } else {
      _items = [_ChecklistDraftItem()];
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    for (final c in _items) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final pc = context.read<PrivateCompanyProvider>();
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final items = _items
        .where((it) => it.controller.text.trim().isNotEmpty)
        .map((it) => PrivateCompanyChecklistItem(
              id: '${DateTime.now().microsecondsSinceEpoch}-${it.controller.text.trim().hashCode}',
              label: it.controller.text.trim(),
              severity: it.severity,
            ))
        .toList();
    final ok = _isEdit
        ? await pc.updateChecklist(
            id: widget.existing!.id,
            name: name,
            description: _description.text.trim(),
            category: _category,
            items: items,
            departmentId: _departmentId,
          )
        : await pc.createChecklist(
            name: name,
            description: _description.text.trim(),
            category: _category,
            items: items,
            departmentId: _departmentId,
          );
    if (ok && mounted) {
      Navigator.pop(context);
      if (_isEdit) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    if (_isEdit && !pc.canManageChecklists) {
      return const SizedBox.shrink();
    }
    if (!_isEdit && !pc.canCreateChecklists) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  _isEdit ? 'Edit checklist' : 'New checklist',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 18),
                _DarkField(
                  controller: _name,
                  label: 'Name *',
                  hint: 'e.g. Foundation pour QC',
                  icon: Icons.edit_note_rounded,
                ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: _description,
                  label: 'Description',
                  hint: 'When should this checklist be used?',
                  icon: Icons.description_outlined,
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                const _SectionTitle('Category'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: ['QUALITY', 'MAINTENANCE', 'SUPERVISION'].map((c) {
                    final selected = _category == c;
                    final color = _categoryColor(c);
                    return GestureDetector(
                      onTap: () => setState(() => _category = selected ? null : c),
                      child: _ChipBox(label: c, selected: selected, color: color),
                    );
                  }).toList(),
                ),
                if (widget.workspace.departments.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const _SectionTitle('Department (optional)'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _departmentId = null),
                        child: _ChipBox(
                          label: 'Any',
                          selected: _departmentId == null,
                          color: const Color(0xFF6B7280),
                        ),
                      ),
                      ...widget.workspace.departments.map((d) => GestureDetector(
                            onTap: () => setState(() => _departmentId = d.id),
                            child: _ChipBox(
                              label: d.name,
                              selected: _departmentId == d.id,
                              color: d.colorValue,
                            ),
                          )),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                const _SectionTitle('Items'),
                const SizedBox(height: 8),
                ..._items.asMap().entries.map((entry) {
                  final draft = entry.value;
                  final isMajor =
                      draft.severity == PrivateCompanyChecklistItemSeverity.major;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF12122A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isMajor
                              ? const Color(0xFFFF4757).withAlpha(80)
                              : Colors.white.withAlpha(15),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 26,
                                height: 26,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF6C63FF).withAlpha(30),
                                  shape: BoxShape.circle,
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  '${entry.key + 1}',
                                  style: const TextStyle(
                                    color: Color(0xFF8B83FF),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: draft.controller,
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 14),
                                  decoration: InputDecoration(
                                    isDense: true,
                                    hintText: 'Item ${entry.key + 1}',
                                    hintStyle: TextStyle(
                                        color: Colors.white.withAlpha(60)),
                                    border: InputBorder.none,
                                    contentPadding:
                                        const EdgeInsets.symmetric(vertical: 6),
                                  ),
                                ),
                              ),
                              if (_items.length > 1)
                                IconButton(
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(
                                      minWidth: 28, minHeight: 28),
                                  icon: const Icon(Icons.remove_circle_outline,
                                      color: Color(0xFFFF4757), size: 18),
                                  onPressed: () => setState(() {
                                    _items.removeAt(entry.key).dispose();
                                  }),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(left: 34, right: 8),
                                child: Text(
                                  'Severity',
                                  style: TextStyle(
                                    color: Colors.white.withAlpha(140),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                              ),
                              _SeverityChip(
                                label: 'Minor',
                                color: const Color(0xFF8B83FF),
                                selected: !isMajor,
                                onTap: () => setState(() {
                                  draft.severity =
                                      PrivateCompanyChecklistItemSeverity.minor;
                                }),
                              ),
                              const SizedBox(width: 6),
                              _SeverityChip(
                                label: 'Major',
                                color: const Color(0xFFFF4757),
                                selected: isMajor,
                                onTap: () => setState(() {
                                  draft.severity =
                                      PrivateCompanyChecklistItemSeverity.major;
                                }),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.add_rounded, color: Color(0xFF8B83FF)),
                    label: const Text('Add item',
                        style: TextStyle(color: Color(0xFF8B83FF), fontWeight: FontWeight.w600)),
                    onPressed: () =>
                        setState(() => _items.add(_ChecklistDraftItem())),
                  ),
                ),
                const SizedBox(height: 16),
                _GradientButton(
                  onPressed: pc.submitting ? null : _submit,
                  label: pc.submitting
                      ? 'Saving…'
                      : (_isEdit ? 'Update checklist' : 'Save checklist'),
                  icon: Icons.save_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Owner notification broadcast sheet ─────────────────────────────────────

enum _BroadcastMode { all, departments, specializations, both }

class _BroadcastSheet extends StatefulWidget {
  const _BroadcastSheet({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_BroadcastSheet> createState() => _BroadcastSheetState();
}

class _BroadcastSheetState extends State<_BroadcastSheet> {
  static const _specializations = [
    'ELECTRICAL',
    'MECHANICAL',
    'CIVIL',
    'TELECOM',
    'PROGRAMMER',
  ];

  final _title = TextEditingController();
  final _body = TextEditingController();
  _BroadcastMode _mode = _BroadcastMode.all;
  final Set<String> _departmentIds = <String>{};
  final Set<String> _specs = <String>{};
  final Set<String> _provinces = <String>{};
  bool _includeOwner = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  String _modeApi() {
    switch (_mode) {
      case _BroadcastMode.all:
        return 'all';
      case _BroadcastMode.departments:
        return 'departments';
      case _BroadcastMode.specializations:
        return 'specializations';
      case _BroadcastMode.both:
        return 'both';
    }
  }

  bool get _showDepartments =>
      _mode == _BroadcastMode.departments || _mode == _BroadcastMode.both;
  bool get _showSpecs =>
      _mode == _BroadcastMode.specializations || _mode == _BroadcastMode.both;

  Future<void> _send() async {
    final pc = context.read<PrivateCompanyProvider>();
    final body = _body.text.trim();
    if (body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Type a message before sending.'),
          backgroundColor: Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (_showDepartments && _departmentIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pick at least one department.'),
          backgroundColor: Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (_showSpecs && _specs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pick at least one specialization.'),
          backgroundColor: Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final delivered = await pc.broadcastNotification(
      message: body,
      title: _title.text.trim(),
      mode: _modeApi(),
      departmentIds: _departmentIds.toList(),
      specializations: _specs.toList(),
      provinces: _provinces.toList(),
      includeOwner: _includeOwner,
    );
    if (delivered != null && mounted) Navigator.pop(context);
  }

  Widget _modeChip(String label, _BroadcastMode mode, IconData icon) {
    final selected = _mode == mode;
    return GestureDetector(
      onTap: () => setState(() => _mode = mode),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFF6C63FF).withAlpha(50)
              : Colors.white.withAlpha(10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? const Color(0xFF6C63FF) : Colors.white24,
            width: selected ? 1.4 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 14,
                color: selected
                    ? const Color(0xFF8B83FF)
                    : Colors.white.withAlpha(160)),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: selected
                    ? const Color(0xFF8B83FF)
                    : Colors.white.withAlpha(170),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: const [
                    Icon(Icons.campaign_rounded, color: Color(0xFF6C63FF)),
                    SizedBox(width: 8),
                    Text(
                      'Send notification',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Reach the right people in your workspace.',
                  style: TextStyle(
                      color: Colors.white.withAlpha(170), fontSize: 12),
                ),
                const SizedBox(height: 18),
                _DarkField(
                  controller: _title,
                  label: 'Title (optional)',
                  hint: 'e.g. Site visit tomorrow at 9 AM',
                  icon: Icons.title_rounded,
                ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: _body,
                  label: 'Message *',
                  hint: 'What do you want your team to know?',
                  icon: Icons.message_rounded,
                  maxLines: 4,
                ),
                const SizedBox(height: 18),
                const _SectionTitle('Audience'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _modeChip(
                        'All staff', _BroadcastMode.all, Icons.groups_rounded),
                    _modeChip('By department', _BroadcastMode.departments,
                        Icons.account_tree_rounded),
                    _modeChip('By specialization',
                        _BroadcastMode.specializations, Icons.engineering_rounded),
                    _modeChip(
                        'Both filters', _BroadcastMode.both, Icons.tune_rounded),
                  ],
                ),
                if (_showDepartments) ...[
                  const SizedBox(height: 16),
                  const _SectionTitle('Departments'),
                  const SizedBox(height: 8),
                  if (widget.workspace.departments.isEmpty)
                    Text(
                      'No departments yet. Create one first.',
                      style: TextStyle(
                          color: Colors.white.withAlpha(160), fontSize: 12),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: widget.workspace.departments.map((d) {
                        final selected = _departmentIds.contains(d.id);
                        return GestureDetector(
                          onTap: () => setState(() {
                            if (selected) {
                              _departmentIds.remove(d.id);
                            } else {
                              _departmentIds.add(d.id);
                            }
                          }),
                          child: _ChipBox(
                            label: d.name,
                            selected: selected,
                            color: d.colorValue,
                          ),
                        );
                      }).toList(),
                    ),
                ],
                if (_showSpecs) ...[
                  const SizedBox(height: 16),
                  const _SectionTitle('Specializations'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _specializations.map((s) {
                      final selected = _specs.contains(s);
                      return GestureDetector(
                        onTap: () => setState(() {
                          if (selected) {
                            _specs.remove(s);
                          } else {
                            _specs.add(s);
                          }
                        }),
                        child: _ChipBox(
                          label: _specLabel(s),
                          selected: selected,
                          color: _specColor(s),
                        ),
                      );
                    }).toList(),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    const _SectionTitle('Provinces (optional)'),
                    const SizedBox(width: 6),
                    Icon(Icons.public_rounded,
                        color: Colors.white.withAlpha(120), size: 14),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _provinces.isEmpty
                      ? 'Leave empty to reach every governorate. Pick provinces to narrow the audience.'
                      : '${_provinces.length} province${_provinces.length == 1 ? '' : 's'} selected.',
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kIraqProvinces.map((p) {
                    final selected = _provinces.contains(p);
                    return GestureDetector(
                      onTap: () => setState(() {
                        if (selected) {
                          _provinces.remove(p);
                        } else {
                          _provinces.add(p);
                        }
                      }),
                      child: _ChipBox(
                        label: p,
                        selected: selected,
                        color: const Color(0xFF38BDF8),
                      ),
                    );
                  }).toList(),
                ),
                if (_provinces.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: TextButton.icon(
                      onPressed: () => setState(() => _provinces.clear()),
                      icon: const Icon(Icons.clear_rounded,
                          color: Color(0xFF8B83FF), size: 16),
                      label: const Text(
                        'Clear province filter',
                        style: TextStyle(
                          color: Color(0xFF8B83FF),
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Switch(
                      value: _includeOwner,
                      activeColor: const Color(0xFF6C63FF),
                      onChanged: (v) => setState(() => _includeOwner = v),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'Also send a copy to me',
                        style: TextStyle(
                            color: Colors.white.withAlpha(200), fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _GradientButton(
                  onPressed: pc.submitting ? null : _send,
                  label: pc.submitting ? 'Sending…' : 'Send notification',
                  icon: Icons.send_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Reusable widgets
// ════════════════════════════════════════════════════════════════════════════

class _Title extends StatelessWidget {
  const _Title(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      shaderCallback: (b) => const LinearGradient(
        colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
      ).createShader(b),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        color: Colors.white.withAlpha(140),
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.4,
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({
    required this.child,
    this.margin = EdgeInsets.zero,
    this.onTap,
  });
  final Widget child;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Material(
            color: const Color(0xFF12122A).withAlpha(180),
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GradientHeroCard extends StatelessWidget {
  const _GradientHeroCard({
    required this.gradient,
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.onCta,
    this.disabled = false,
    this.showCta = true,
  });

  final List<Color> gradient;
  final String title;
  final String subtitle;
  final String cta;
  final VoidCallback? onCta;
  final bool disabled;
  final bool showCta;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withAlpha(80),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 32),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              color: Colors.white.withAlpha(220),
              fontSize: 13,
              height: 1.5,
            ),
          ),
          if (showCta) ...[
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: disabled ? null : onCta,
              icon: const Icon(Icons.send_rounded, size: 16),
              label: Text(cta, style: const TextStyle(fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: gradient.first,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                elevation: 0,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusHeroCard extends StatelessWidget {
  const _StatusHeroCard({
    required this.status,
    required this.title,
    required this.description,
  });
  final PrivateCompanyStatus status;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final color = status.color;
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [color.withAlpha(80), color.withAlpha(30)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(status.icon, color: color, size: 28),
              const SizedBox(width: 10),
              Text(
                _pcStatusLabel(status, l10n),
                style: TextStyle(
                  color: color,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            description,
            style: TextStyle(
                color: Colors.white.withAlpha(220), fontSize: 13, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  const _FeatureTile({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String description;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withAlpha(28), color.withAlpha(12)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 24),
          const Spacer(),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: TextStyle(
                color: Colors.white.withAlpha(170),
                fontSize: 11,
                height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _ProcessSteps extends StatelessWidget {
  const _ProcessSteps();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final steps = [
      (
        l10n.t('pc_ws_req_process_submit_title'),
        l10n.t('pc_ws_req_process_submit_desc'),
        Icons.send_rounded,
        const Color(0xFF6C63FF),
      ),
      (
        l10n.t('pc_ws_req_process_review_title'),
        l10n.t('pc_ws_req_process_review_desc'),
        Icons.gavel_rounded,
        const Color(0xFFFBBF24),
      ),
      (
        l10n.t('pc_ws_req_process_build_title'),
        l10n.t('pc_ws_req_process_build_desc'),
        Icons.engineering_rounded,
        const Color(0xFF00D4AA),
      ),
    ];
    return Column(
      children: steps.map((s) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _GlassCard(
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: s.$4.withAlpha(35),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(s.$3, color: s.$4),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.$1,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(s.$2,
                          style: TextStyle(
                              color: Colors.white.withAlpha(170),
                              fontSize: 12,
                              height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _DarkField extends StatelessWidget {
  const _DarkField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
              color: Colors.white.withAlpha(140),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.3),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          maxLines: maxLines,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: Colors.white.withAlpha(60)),
            prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.white.withAlpha(15)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          ),
        ),
      ],
    );
  }
}

class _GradientButton extends StatelessWidget {
  const _GradientButton({
    required this.onPressed,
    required this.label,
    required this.icon,
    this.stretch = false,
  });
  final VoidCallback? onPressed;
  final String label;
  final IconData icon;
  final bool stretch;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return SizedBox(
      width: stretch ? double.infinity : null,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: disabled
              ? const LinearGradient(colors: [Color(0xFF2D2D4A), Color(0xFF2D2D4A)])
              : const LinearGradient(colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)]),
          boxShadow: disabled
              ? null
              : [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withAlpha(80),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
        ),
        child: ElevatedButton.icon(
          icon: Icon(icon, size: 18),
          label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white54,
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 0,
          ),
        ),
      ),
    );
  }
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _DismissibleBanner extends StatelessWidget {
  const _DismissibleBanner({
    required this.text,
    required this.color,
    required this.icon,
    required this.onClose,
  });
  final String text;
  final Color color;
  final IconData icon;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: GestureDetector(
              onLongPress: () {
                Clipboard.setData(ClipboardData(text: text));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Copied'), behavior: SnackBarBehavior.floating),
                );
              },
              child: Text(
                text,
                style: TextStyle(color: color, fontSize: 12, height: 1.35),
              ),
            ),
          ),
          IconButton(
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            icon: const Icon(Icons.close_rounded, size: 16, color: Colors.white38),
            onPressed: onClose,
          ),
        ],
      ),
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
  });
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withAlpha(40), color.withAlpha(15)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
                color: color, fontSize: 26, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _EmptyMicroCard extends StatelessWidget {
  const _EmptyMicroCard({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Row(
        children: [
          Icon(icon, color: Colors.white38, size: 24),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF6C63FF).withAlpha(20),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: const Color(0xFF8B83FF), size: 36),
          ),
          const SizedBox(height: 14),
          Text(title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Colors.white.withAlpha(150),
                  fontSize: 12,
                  height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.selected,
    required this.label,
    required this.onTap,
    this.color = const Color(0xFF6C63FF),
  });
  final bool selected;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? color.withAlpha(40) : Colors.white10,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
                color: selected ? color : Colors.white24,
                width: selected ? 1.4 : 1),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? color : Colors.white60,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}

class _ChipBox extends StatelessWidget {
  const _ChipBox({required this.label, required this.selected, required this.color});
  final String label;
  final bool selected;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: selected ? color.withAlpha(40) : Colors.white10,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: selected ? color : Colors.white24, width: selected ? 1.4 : 1),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: selected ? color : Colors.white60,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          fontSize: 12,
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

String _staffRoleLabel(String role) {
  switch (role.toUpperCase()) {
    case 'MANAGER':
      return 'Manager';
    case 'COORDINATOR':
      return 'Coordinator';
    case 'ENGINEER':
      return 'Engineer';
    case 'TECHNICIAN':
      return 'Technician';
    case 'WORKER':
      return 'Worker';
    case 'WAREHOUSE_KEEPER':
      return 'Warehouse keeper';
    case 'COMPANY':
      return 'Company';
    default:
      return role.replaceAll('_', ' ').toLowerCase();
  }
}

Color _staffRoleColor(String role) {
  switch (role.toUpperCase()) {
    case 'MANAGER':
      return const Color(0xFF22C55E);
    case 'COORDINATOR':
      return const Color(0xFF6C63FF);
    case 'ENGINEER':
      return const Color(0xFF00D4AA);
    case 'TECHNICIAN':
      return const Color(0xFFFF9F43);
    case 'WORKER':
      return const Color(0xFFA78BFA);
    case 'WAREHOUSE_KEEPER':
      return const Color(0xFFCA8A04);
    case 'COMPANY':
      return const Color(0xFFFBBF24);
    default:
      return const Color(0xFF6B7280);
  }
}

String _specLabel(String s) {
  switch (s) {
    case 'ELECTRICAL':
      return 'Electrical';
    case 'MECHANICAL':
      return 'Mechanical';
    case 'CIVIL':
      return 'Civil';
    case 'TELECOM':
      return 'Telecom';
    case 'PROGRAMMER':
      return 'Programmer';
    default:
      return s;
  }
}

Color _specColor(String s) {
  switch (s) {
    case 'ELECTRICAL':
      return const Color(0xFFFBBF24);
    case 'MECHANICAL':
      return const Color(0xFF38BDF8);
    case 'CIVIL':
      return const Color(0xFFA78BFA);
    case 'TELECOM':
      return const Color(0xFF00D4AA);
    case 'PROGRAMMER':
      return const Color(0xFFFF9F43);
    default:
      return const Color(0xFF6B7280);
  }
}

Color _categoryColor(String? c) {
  switch ((c ?? '').toUpperCase()) {
    case 'QUALITY':
      return const Color(0xFF4ADE80);
    case 'MAINTENANCE':
      return const Color(0xFFFF9F43);
    case 'SUPERVISION':
      return const Color(0xFF38BDF8);
    default:
      return const Color(0xFF6C63FF);
  }
}

IconData _iconFromKey(String? key) {
  switch (key) {
    case 'engineering':
      return Icons.engineering_rounded;
    case 'electrical':
      return Icons.electrical_services_rounded;
    case 'tools':
      return Icons.handyman_rounded;
    case 'civil':
      return Icons.architecture_rounded;
    case 'mechanical':
      return Icons.precision_manufacturing_rounded;
    case 'telecom':
      return Icons.cell_tower_rounded;
    case 'office':
      return Icons.work_rounded;
    case 'safety':
      return Icons.health_and_safety_rounded;
    default:
      return Icons.account_tree_rounded;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PERFORMANCE KPIs — workspace tickets assigned to staff (server-scoped by role)
// ═════════════════════════════════════════════════════════════════════════════

class _KpisTab extends StatefulWidget {
  const _KpisTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_KpisTab> createState() => _KpisTabState();
}

class _KpisTabState extends State<_KpisTab> {
  int _days = 365;
  String? _provinceFilter;
  bool _bootstrapped = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    final pc = context.read<PrivateCompanyProvider>();
    if (pc.canViewKpis) {
      pc.fetchKpis(days: _days, province: _provinceFilter);
    }
  }

  Future<void> _refresh() => context.read<PrivateCompanyProvider>().fetchKpis(
        days: _days,
        province: _provinceFilter,
      );

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    if (!pc.canViewKpis) {
      return Center(
        child: Text(
          l10n.t('pc_kpi_unavailable'),
          style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
        ),
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  pc.isOwner
                      ? l10n.t('pc_kpi_intro_owner')
                      : pc.isDepartmentManager
                          ? l10n.t('pc_kpi_intro_manager')
                          : l10n.t('pc_kpi_intro_self'),
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
              ),
              DropdownButton<int>(
                value: _days,
                dropdownColor: const Color(0xFF12122A),
                underline: const SizedBox(),
                style: const TextStyle(color: Colors.white, fontSize: 12),
                items: [
                  DropdownMenuItem(
                      value: 90,
                      child: Text(l10n.t('pc_kpi_days_short', {'n': '90'}))),
                  DropdownMenuItem(
                      value: 180,
                      child: Text(l10n.t('pc_kpi_days_short', {'n': '180'}))),
                  DropdownMenuItem(
                      value: 365,
                      child: Text(l10n.t('pc_kpi_days_short', {'n': '365'}))),
                ],
                onChanged: pc.kpiLoading
                    ? null
                    : (v) async {
                        if (v == null) return;
                        setState(() => _days = v);
                        await _refresh();
                      },
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Text(
            l10n.t('pc_kpi_ticket_timeline_hint'),
            style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11, height: 1.35),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            color: const Color(0xFF38BDF8),
            backgroundColor: const Color(0xFF12122A),
            child: pc.kpiLoading && pc.kpiSnapshot == null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 120),
                      Center(
                          child:
                              CircularProgressIndicator(color: Color(0xFF6C63FF))),
                    ],
                  )
                : ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    children: [
                      if (pc.kpiSnapshot != null) ...[
                        Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            gradient: LinearGradient(
                              colors: [
                                const Color(0xFF6C63FF).withValues(alpha: 0.22),
                                const Color(0xFF38BDF8).withValues(alpha: 0.12),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: 0.08)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.t('analytics_performance_insights'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                  letterSpacing: 0.3,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                l10n.t('analytics_performance_insights_hint'),
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.75),
                                  fontSize: 11,
                                  height: 1.35,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          l10n.t('pc_kpi_tickets_in_window', {
                            'count': '${pc.kpiSnapshot!.ticketSampleSize}'
                          }),
                          style: TextStyle(
                              color: Colors.white.withAlpha(140), fontSize: 11),
                        ),
                        Text(
                          l10n.t('pc_kpi_avg_assignments_per_day_hint'),
                          style: TextStyle(
                              color: Colors.white.withAlpha(100), fontSize: 10),
                        ),
                        if (_provinceFilter != null) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  l10n.t('pc_kpi_province_filter',
                                      {'province': _provinceFilter!}),
                                  style: const TextStyle(
                                    color: Color(0xFF38BDF8),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: pc.kpiLoading
                                    ? null
                                    : () async {
                                        setState(() => _provinceFilter = null);
                                        await _refresh();
                                      },
                                child: Text(l10n.t('pc_kpi_show_all_provinces')),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 12),
                        if (pc.kpiSnapshot!.byProvince.isNotEmpty &&
                            _provinceFilter == null) ...[
                          _SectionTitle(l10n.t('pc_kpi_by_province')),
                          const SizedBox(height: 8),
                          ...pc.kpiSnapshot!.byProvince.map((p) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _GlassCard(
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: pc.kpiLoading
                                        ? null
                                        : () async {
                                            setState(
                                                () => _provinceFilter = p.province);
                                            await _refresh();
                                          },
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              const Icon(Icons.public_rounded,
                                                  color: Color(0xFF38BDF8),
                                                  size: 18),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  p.province,
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 14,
                                                  ),
                                                ),
                                              ),
                                              const Icon(Icons.chevron_right_rounded,
                                                  color: Colors.white38),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                            l10n.t('pc_kpi_province_summary', {
                              'staff': '${p.staffCount}',
                              'tickets': '${p.ticketsAssigned}',
                              'completed': '${p.completedTickets}',
                            }),
                            style: TextStyle(
                              color: Colors.white.withAlpha(150),
                              fontSize: 11,
                            ),
                          ),
                                          _KpiStatRow(
                                            l10n.t('pc_kpi_avg_assignments_per_day'),
                                            '${p.avgTicketAssignmentsPerDay}',
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              )),
                          const SizedBox(height: 18),
                        ],
                        if (pc.kpiSnapshot!.byDepartment.isNotEmpty &&
                            _provinceFilter == null) ...[
                          _SectionTitle(
                            pc.isOwner
                                ? l10n.t('pc_kpi_by_department')
                                : l10n.t('pc_kpi_your_department'),
                          ),
                          const SizedBox(height: 8),
                          ...pc.kpiSnapshot!.byDepartment.map((d) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _GlassCard(
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          d.departmentName,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                            fontSize: 14,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        _KpiStatRow(
                                            l10n.t('pc_kpi_stat_assigned_tickets'), '${d.ticketsAssigned}'),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_avg_assignments_per_day'),
                                          '${d.avgTicketAssignmentsPerDay}',
                                        ),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_completed'), '${d.completedTickets}'),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_total_task_hours'),
                                            '${d.totalTaskHours} h'),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_task_hours'),
                                          d.avgTaskHours != null
                                              ? '${d.avgTaskHours} h'
                                              : '—',
                                        ),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_total_arrival_hours'),
                                            '${d.totalArrivalHours} h'),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_arrival_hours'),
                                          d.avgArrivalHours != null
                                              ? '${d.avgArrivalHours} h'
                                              : '—',
                                        ),
                                        _KpiStatRow(
                                          l10n.t('analytics_kpi_resubmission_hours'),
                                          '${d.totalResubmissionHours} h',
                                        ),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_resubmission'),
                                          d.avgResubmissionHours != null
                                              ? '${d.avgResubmissionHours} h'
                                              : '—',
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              )),
                          const SizedBox(height: 18),
                        ],
                        if (pc.isDepartmentManager && pc.myDepartmentId != null) ...[
                          _ManagerDeptFieldSettingsCard(
                            department: widget.workspace.departments
                                .cast<PrivateCompanyDepartment?>()
                                .firstWhere(
                                  (d) => d?.id == pc.myDepartmentId,
                                  orElse: () => null,
                                ),
                          ),
                          const SizedBox(height: 14),
                        ],
                        if (pc.kpiSnapshot!.byStaff.isNotEmpty) ...[
                          _SectionTitle(
                            _provinceFilter != null
                                ? l10n.t('pc_kpi_staff_in_province',
                                    {'province': _provinceFilter!})
                                : pc.isOwner
                                    ? l10n.t('pc_kpi_by_staff')
                                    : pc.isDepartmentManager
                                        ? l10n.t('pc_kpi_staff_in_department')
                                        : l10n.t('pc_kpi_your_performance'),
                          ),
                          const SizedBox(height: 8),
                          ...pc.kpiSnapshot!.byStaff.map((s) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _GlassCard(
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          s.name,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                            fontSize: 14,
                                          ),
                                        ),
                                        Text(
                                          l10n.t('pc_kpi_staff_assigned_line', {
                                            'role': _staffRoleLabel(s.role),
                                            'count': '${s.ticketsAssigned}',
                                          }),
                                          style: TextStyle(
                                            color: Colors.white.withAlpha(150),
                                            fontSize: 11,
                                          ),
                                        ),
                                        if (s.departmentName != null &&
                                            s.departmentName!.isNotEmpty)
                                          Text(
                                            s.departmentName!,
                                            style: TextStyle(
                                              color: Colors.white.withAlpha(120),
                                              fontSize: 11,
                                            ),
                                          ),
                                        const SizedBox(height: 8),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_avg_assignments_per_day'),
                                          '${s.avgTicketAssignmentsPerDay}',
                                        ),
                                        _KpiStatRow(
                                            l10n.t('pc_kpi_stat_completed'), '${s.completedTickets}'),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_total_task_hours'),
                                            '${s.totalTaskHours} h'),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_task_hours'),
                                          s.avgTaskHours != null
                                              ? '${s.avgTaskHours} h'
                                              : '—',
                                        ),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_total_arrival_hours'),
                                            '${s.totalArrivalHours} h'),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_arrival_hours'),
                                          s.avgArrivalHours != null
                                              ? '${s.avgArrivalHours} h'
                                              : '—',
                                        ),
                                        _KpiStatRow(l10n.t('pc_kpi_stat_crew_joins'), '${s.crewJoins}'),
                                        _KpiStatRow(
                                          l10n.t('analytics_kpi_resubmission_hours'),
                                          '${s.totalResubmissionHours} h',
                                        ),
                                        _KpiStatRow(
                                          l10n.t('pc_kpi_stat_avg_resubmission'),
                                          s.avgResubmissionHours != null
                                              ? '${s.avgResubmissionHours} h'
                                              : '—',
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              )),
                        ] else
                          _EmptyState(
                            icon: Icons.data_thresholding_rounded,
                            title: l10n.t('pc_kpi_empty_title'),
                            subtitle: l10n.t('pc_kpi_empty_subtitle'),
                          ),
                        ] else
                          _EmptyState(
                            icon: Icons.error_outline_rounded,
                            title: l10n.t('pc_kpi_error_title'),
                            subtitle: l10n.t('pc_kpi_error_subtitle'),
                          ),
                        const SizedBox(height: 8),
                        Container(
                          margin: const EdgeInsets.only(top: 8, bottom: 4),
                          height: 1,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Colors.transparent,
                                Colors.white.withValues(alpha: 0.12),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        const WorkspaceCancellationsAnalyticsPanel(),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class _ExpensesTab extends StatelessWidget {
  const _ExpensesTab();

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
      children: [
        if (pc.canManageStaff) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: const Color(0xFF12122A).withAlpha(220),
              border: Border.all(color: Colors.white.withAlpha(12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.t('pc_ticket_expenses_settings'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.t('pc_expenses_tab_settings_hint'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(160),
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _showTicketExpensesSettingsDialog(context),
                  icon: const Icon(Icons.edit_note_rounded, size: 18, color: Color(0xFF00D4AA)),
                  label: Text(l10n.t('pc_expenses_configure_dialog')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00D4AA),
                    side: const BorderSide(color: Color(0xFF00D4AA)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (pc.isPrivateWorkspaceFieldStaff) ...[
          Text(
            l10n.t('pc_expenses_my_expenses'),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.t('pc_expenses_my_expenses_hint'),
            style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12),
          ),
          const SizedBox(height: 12),
          const WorkspaceExpensesAnalyticsPanel(compact: true),
        ] else
          const WorkspaceExpensesAnalyticsPanel(),
      ],
    );
  }
}

class _ManagerDeptFieldSettingsCard extends StatefulWidget {
  const _ManagerDeptFieldSettingsCard({this.department});
  final PrivateCompanyDepartment? department;

  @override
  State<_ManagerDeptFieldSettingsCard> createState() =>
      _ManagerDeptFieldSettingsCardState();
}

class _ManagerDeptFieldSettingsCardState extends State<_ManagerDeptFieldSettingsCard> {
  late bool _siteArrivalAuto;
  late TextEditingController _radius;

  @override
  void initState() {
    super.initState();
    final d = widget.department;
    _siteArrivalAuto = d?.siteArrivalAutoOnSiteEnabled != false;
    _radius = TextEditingController(text: '${d?.maintenanceProximityRadiusM ?? 500}');
  }

  @override
  void dispose() {
    _radius.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final d = widget.department;
    if (d == null) return;
    final r = int.tryParse(_radius.text.trim());
    final radius = (r != null && r >= 10 && r <= 5000) ? r : 500;
    final pc = context.read<PrivateCompanyProvider>();
    final ok = await pc.updateDepartment(
      d.id,
      maintenanceProximityRadiusM: radius,
      siteArrivalAutoOnSiteEnabled: _siteArrivalAuto,
    );
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Department field settings saved.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.department;
    if (d == null) return const SizedBox.shrink();
    final pc = context.watch<PrivateCompanyProvider>();
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Department field settings'),
            Text(
              '${d.name} — site arrival distance and auto ON_SITE for maintenance / QC tickets.',
              style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11, height: 1.35),
            ),
            const SizedBox(height: 10),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Auto ON_SITE near job site',
                style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
              ),
              value: _siteArrivalAuto,
              activeThumbColor: const Color(0xFF00D4AA),
              onChanged: (v) => setState(() => _siteArrivalAuto = v),
            ),
            _DarkField(
              controller: _radius,
              label: 'Site arrival radius (m)',
              hint: '500',
              icon: Icons.radar_rounded,
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 8),
            _GradientButton(
              onPressed: pc.submitting ? null : _save,
              label: pc.submitting ? 'Saving…' : 'Save field settings',
              icon: Icons.save_rounded,
              stretch: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _KpiStatRow extends StatelessWidget {
  const _KpiStatRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: Colors.white.withAlpha(160),
                fontSize: 12,
              ),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WAREHOUSE TAB
//
// Sub-tabs (6 or 7):
//   • Dashboard — aggregate counters + recent activity
//   • Inventory — stock search / filters; tools Excel export; tool assignment from stock
//   • Tools — staff tools catalog (serial-focused add flow; category fixed as Tools)
//   • Materials — consumables / parts (bulk or serial; Excel import)
//   • Request tools — material requests (staff submit; keepers review)
//   • Reasons — material-use preset reasons (owners / managers / coordinators only)
//   • Activity — full movement log
//   • Budgets — per-staff caps (managers edit; everyone can view self)
//
// Ticket expenses activation and expense reasons: Expenses top-level hub tab.
//
// Visibility rules:
//   • Owner / manager / coordinator: full warehouse per role flags
//   • Engineer / technician / worker: assigned inventory and their movements
// ═════════════════════════════════════════════════════════════════════════════

class _WorkspaceTechniqueExpenseTile extends StatefulWidget {
  const _WorkspaceTechniqueExpenseTile({
    required this.row,
    required this.l10n,
    required this.pc,
  });

  final Map<String, dynamic> row;
  final AppLocalizations l10n;
  final PrivateCompanyProvider pc;

  @override
  State<_WorkspaceTechniqueExpenseTile> createState() => _WorkspaceTechniqueExpenseTileState();
}

class _WorkspaceTechniqueExpenseTileState extends State<_WorkspaceTechniqueExpenseTile> {
  late bool _on;
  late List<String> _reasons;
  final TextEditingController _addCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _syncFromRow();
  }

  void _syncFromRow() {
    _on = widget.row['on'] == true;
    _reasons = List<String>.from(
      (widget.row['reasons'] as List<dynamic>? ?? const []).map((e) => e.toString()),
    );
  }

  @override
  void didUpdateWidget(covariant _WorkspaceTechniqueExpenseTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.row['id'] != widget.row['id']) {
      _syncFromRow();
    }
  }

  @override
  void dispose() {
    _addCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ok = await widget.pc.patchExpenseSettings(
      techniquePatch: {
        'techniqueId': widget.row['id'],
        'ticketExpensesEnabled': _on,
        'reasons': _reasons,
      },
    );
    if (!mounted) return;
    if (ok) {
      widget.row['on'] = _on;
      widget.row['reasons'] = List<String>.from(_reasons);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.l10n.t('pc_expenses_save_type')),
          backgroundColor: const Color(0xFF00D4AA),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.row['label'] as String? ?? '';
    final category = widget.row['category'] as String? ?? '';
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      collapsedIconColor: Colors.white54,
      iconColor: Colors.white70,
      title: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        category,
        style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
      ),
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            widget.l10n.t('pc_expenses_allow_for_this_type'),
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
          value: _on,
          onChanged: widget.pc.submitting ? null : (v) => setState(() => _on = v),
        ),
        ..._reasons.map(
          (r) => ListTile(
            dense: true,
            title: Text(r, style: const TextStyle(color: Colors.white, fontSize: 13)),
            trailing: IconButton(
              icon: const Icon(Icons.close, color: Colors.white54, size: 18),
              onPressed: widget.pc.submitting
                  ? null
                  : () => setState(() => _reasons = [..._reasons]..remove(r)),
            ),
          ),
        ),
        TextField(
          controller: _addCtrl,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          enabled: !widget.pc.submitting,
          decoration: InputDecoration(
            hintText: widget.l10n.t('pc_expenses_reason_add_hint'),
            hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
            suffixIcon: IconButton(
              icon: const Icon(Icons.add_circle_outline, color: Color(0xFF6C63FF), size: 20),
              onPressed: widget.pc.submitting
                  ? null
                  : () {
                      final s = _addCtrl.text.trim();
                      if (s.isEmpty) return;
                      if (_reasons.any((x) => x.toLowerCase() == s.toLowerCase())) return;
                      setState(() {
                        _reasons = [..._reasons, s];
                        _addCtrl.clear();
                      });
                    },
            ),
          ),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: widget.pc.submitting ? null : _save,
            child: Text(widget.l10n.t('pc_expenses_save_type')),
          ),
        ),
      ],
    );
  }
}

Future<void> _showTicketExpensesSettingsDialog(BuildContext context) async {
  final pc = context.read<PrivateCompanyProvider>();
  final l10n = AppLocalizations.of(context);
  final snap = await pc.fetchExpenseSettingsDetail();
  if (!context.mounted) return;
  if (snap == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.t('action_failed')),
        backgroundColor: const Color(0xFFFF4757),
      ),
    );
    return;
  }

  Map<String, dynamic> settingsMap = {};
  final rawSettings = snap['settings'];
  if (rawSettings is Map) {
    settingsMap = Map<String, dynamic>.from(rawSettings);
  }

  final initial = (settingsMap['reasons'] as List<dynamic>?)
          ?.map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .toList() ??
      <String>[];
  final editCtrl = TextEditingController();
  var live = List<String>.from(initial);
  var enabled = settingsMap['enabled'] == true;
  final pending = settingsMap['activationPending'] == true;
  final role = (pc.membership.role ?? '').toUpperCase();
  final isCoordinator = role == 'COORDINATOR';
  final canEnableDirect = pc.isOwner || role == 'MANAGER';

  final techniques = <Map<String, dynamic>>[];
  for (final raw in (snap['techniques'] as List<dynamic>? ?? [])) {
    if (raw is! Map) continue;
    final m = Map<String, dynamic>.from(raw);
    final id = m['id']?.toString() ?? '';
    if (id.isEmpty) continue;
    final reasons = (m['ticketExpenseReasons'] as List<dynamic>?)
            ?.map((e) => e.toString().trim())
            .where((s) => s.isNotEmpty)
            .toList() ??
        <String>[];
    techniques.add({
      'id': id,
      'label': (m['labelEn'] ?? m['labelAr'] ?? m['slug']).toString(),
      'category': (m['category'] ?? '').toString(),
      'on': m['ticketExpensesEnabled'] != false,
      'reasons': List<String>.from(reasons),
    });
  }

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setLocal) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('pc_ticket_expenses_settings'),
          style: const TextStyle(color: Colors.white, fontSize: 17),
        ),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (pending)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      l10n.t('pc_expenses_activation_pending'),
                      style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 12),
                    ),
                  ),
                if (canEnableDirect)
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      l10n.t('pc_expenses_enable'),
                      style: const TextStyle(color: Colors.white),
                    ),
                    value: enabled,
                    onChanged: (v) => setLocal(() => enabled = v),
                  )
                else if (isCoordinator && !enabled)
                  Text(
                    l10n.t('pc_expenses_coordinator_hint'),
                    style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                  ),
                TextField(
                  controller: editCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: l10n.t('pc_expenses_reason_add_hint'),
                    hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.add_circle_outline, color: Color(0xFF6C63FF)),
                      onPressed: () {
                        final s = editCtrl.text.trim();
                        if (s.isEmpty) return;
                        if (live.any((x) => x.toLowerCase() == s.toLowerCase())) return;
                        setLocal(() {
                          live = [...live, s];
                          editCtrl.clear();
                        });
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                ...live.map(
                  (r) => ListTile(
                    dense: true,
                    title: Text(r, style: const TextStyle(color: Colors.white, fontSize: 14)),
                    trailing: IconButton(
                      icon: const Icon(Icons.close, color: Colors.white54, size: 20),
                      onPressed: () => setLocal(() => live = [...live]..remove(r)),
                    ),
                  ),
                ),
                if (techniques.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    l10n.t('pc_expenses_by_ticket_type'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.t('pc_expenses_type_defaults_hint'),
                    style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11, height: 1.3),
                  ),
                  const SizedBox(height: 8),
                  ListenableBuilder(
                    listenable: pc,
                    builder: (context, _) {
                      return Column(
                        children: techniques
                            .map(
                              (row) => _WorkspaceTechniqueExpenseTile(
                                row: row,
                                l10n: l10n,
                                pc: pc,
                              ),
                            )
                            .toList(),
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel')),
          ),
          if (canEnableDirect && pending)
            TextButton(
              onPressed: () async {
                await pc.patchExpenseSettings(approveActivation: true);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(l10n.t('pc_expenses_approve')),
            ),
          if (isCoordinator && !enabled && !canEnableDirect)
            TextButton(
              onPressed: () async {
                await pc.patchExpenseSettings(
                  reasons: live,
                  requestActivation: true,
                );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(l10n.t('pc_expenses_request_activation')),
            ),
          FilledButton(
            onPressed: () async {
              if (canEnableDirect) {
                await pc.patchExpenseSettings(
                  reasons: live,
                  enabled: enabled,
                  disable: !enabled && (settingsMap['enabled'] == true),
                );
              } else {
                await pc.patchExpenseSettings(reasons: live);
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: Text(l10n.t('submit')),
          ),
        ],
      ),
    ),
  );
  editCtrl.dispose();
}

class _WarehouseTab extends StatefulWidget {
  const _WarehouseTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_WarehouseTab> createState() => _WarehouseTabState();
}

class _WarehouseTabState extends State<_WarehouseTab>
    with SingleTickerProviderStateMixin {
  late TabController _subTabs;
  int _warehouseSubTabLength = 6;
  PrivateCompanyProvider? _pcWhAttached;
  bool _exportingTools = false;
  bool _exportingMaterials = false;

  int _warehouseSubTabCount(PrivateCompanyProvider pc) =>
      7 + (pc.canManageStaff ? 1 : 0);

  void _syncWarehouseSubTabs(PrivateCompanyProvider pc) {
    final n = _warehouseSubTabCount(pc);
    if (n == _warehouseSubTabLength) return;
    final prevIndex = _subTabs.index;
    final oldLen = _warehouseSubTabLength;
    _subTabs.dispose();
    _warehouseSubTabLength = n;
    _subTabs = TabController(length: n, vsync: this);
    int newIndex;
    if (n > oldLen) {
      newIndex = prevIndex >= 5 ? prevIndex + 1 : prevIndex;
    } else {
      if (prevIndex == 5) {
        newIndex = 5;
      } else if (prevIndex > 5) {
        newIndex = prevIndex - 1;
      } else {
        newIndex = prevIndex;
      }
    }
    if (newIndex >= n) newIndex = n - 1;
    if (newIndex < 0) newIndex = 0;
    _subTabs.index = newIndex;
  }

  void _attachWhPc(PrivateCompanyProvider pc) {
    if (_pcWhAttached == pc) return;
    _pcWhAttached?.removeListener(_onWhPcChanged);
    _pcWhAttached = pc;
    pc.addListener(_onWhPcChanged);
  }

  void _onWhPcChanged() {
    final pc = _pcWhAttached;
    if (pc == null || !mounted) return;
    final lenBefore = _warehouseSubTabLength;
    _syncWarehouseSubTabs(pc);
    if (lenBefore != _warehouseSubTabLength) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _subTabs = TabController(length: 7, vsync: this);
  }

  Future<void> _exportWarehouseToolsReport() async {
    if (_exportingTools) return;
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final pc = context.read<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    setState(() => _exportingTools = true);
    final bytes = await wh.downloadWarehouseToolsExport(
      toolsOnly: true,
      departmentId: pc.isOwner ? null : pc.myDepartmentId,
    );
    if (!mounted) return;
    setState(() => _exportingTools = false);
    final messenger = ScaffoldMessenger.of(context);
    if (bytes == null || bytes.isEmpty) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_warehouse_tools_export_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
      return;
    }
    try {
      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/warehouse-tools-${DateTime.now().millisecondsSinceEpoch}.xlsx';
      await File(path).writeAsBytes(bytes);
      if (!mounted) return;
      final shareOrigin = sharePositionOriginForShareSheet(context);
      try {
        await Share.shareXFiles(
          [
            XFile(
              path,
              mimeType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ),
          ],
          subject: l10n.t('pc_warehouse_tools_export'),
          sharePositionOrigin: shareOrigin,
        );
      } catch (_) {
        if (!mounted) return;
        messenger.showSnackBar(
          SnackBar(
            content: Text(l10n.t('pc_expenses_export_share_failed')),
            backgroundColor: const Color(0xFFFBBF24),
          ),
        );
        return;
      }
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('export_success')),
          backgroundColor: const Color(0xFF00D4AA),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_warehouse_tools_export_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  Future<void> _exportWarehouseMaterialsReport() async {
    if (_exportingMaterials) return;
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final pc = context.read<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    setState(() => _exportingMaterials = true);
    final bytes = await wh.downloadWarehouseMaterialsExport(
      departmentId: pc.isOwner ? null : pc.myDepartmentId,
    );
    if (!mounted) return;
    setState(() => _exportingMaterials = false);
    final messenger = ScaffoldMessenger.of(context);
    if (bytes == null || bytes.isEmpty) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_warehouse_materials_export_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
      return;
    }
    try {
      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/warehouse-materials-${DateTime.now().millisecondsSinceEpoch}.xlsx';
      await File(path).writeAsBytes(bytes);
      if (!mounted) return;
      final shareOrigin = sharePositionOriginForShareSheet(context);
      try {
        await Share.shareXFiles(
          [
            XFile(
              path,
              mimeType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ),
          ],
          subject: l10n.t('pc_warehouse_materials_export'),
          sharePositionOrigin: shareOrigin,
        );
      } catch (_) {
        if (!mounted) return;
        messenger.showSnackBar(
          SnackBar(
            content: Text(l10n.t('pc_expenses_export_share_failed')),
            backgroundColor: const Color(0xFFFBBF24),
          ),
        );
        return;
      }
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('export_success')),
          backgroundColor: const Color(0xFF00D4AA),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(l10n.t('pc_warehouse_materials_export_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final pc = context.read<PrivateCompanyProvider>();
    _attachWhPc(pc);
    final lenBefore = _warehouseSubTabLength;
    _syncWarehouseSubTabs(pc);
    if (lenBefore != _warehouseSubTabLength) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final keeperManage = pc.canManageWarehouse;
    final assignTools = pc.canAssignWarehouseToolsToStaff;
    final exportTools = pc.canExportWarehouseToolsReport;
    final dashboardCatalog = keeperManage || assignTools;
    final l10n = AppLocalizations.of(context);
    final showReasons = pc.canManageStaff;
    return Column(
      children: [
        if (wh.error != null)
          _DismissibleBanner(
            text: wh.error!,
            color: const Color(0xFFFF4757),
            icon: Icons.error_outline_rounded,
            onClose: wh.clearMessages,
          ),
        if (wh.lastSuccess != null)
          _DismissibleBanner(
            text: wh.lastSuccess!,
            color: const Color(0xFF00D4AA),
            icon: Icons.check_circle_outline_rounded,
            onClose: wh.clearMessages,
          ),
        if (pc.seesOnlyAssignedWarehouseInventory)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFF38BDF8).withAlpha(35),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFF38BDF8).withAlpha(90),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.info_outline_rounded,
                      color: Color(0xFF38BDF8),
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        l10n.t('pc_ws_warehouse_assigned_only_hint'),
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.35,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        Container(
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          decoration: BoxDecoration(
            color: const Color(0xFF12122A).withAlpha(180),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          child: TabBar(
            controller: _subTabs,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicator: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                colors: [Color(0xFF38BDF8), Color(0xFF6C63FF)],
              ),
            ),
            indicatorSize: TabBarIndicatorSize.tab,
            indicatorPadding: const EdgeInsets.all(4),
            dividerColor: Colors.transparent,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white54,
            labelStyle:
                const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            unselectedLabelStyle:
                const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
            tabs: [
              Tab(
                icon: const Icon(Icons.insights_rounded, size: 16),
                text: l10n.t('pc_wh_tab_dashboard'),
              ),
              Tab(
                icon: const Icon(Icons.inventory_2_rounded, size: 16),
                text: l10n.t('pc_wh_tab_inventory'),
              ),
              Tab(
                icon: const Icon(Icons.handyman_rounded, size: 16),
                text: l10n.t('pc_wh_tab_tools'),
              ),
              Tab(
                icon: const Icon(Icons.category_rounded, size: 16),
                text: l10n.t('pc_wh_tab_materials'),
              ),
              Tab(
                icon: const Icon(Icons.post_add_rounded, size: 16),
                text: l10n.t('pc_wh_tab_request_tools'),
              ),
              if (showReasons)
                Tab(
                  icon: const Icon(Icons.list_alt_rounded, size: 16),
                  text: l10n.t('pc_wh_tab_reasons'),
                ),
              Tab(
                icon: const Icon(Icons.history_rounded, size: 16),
                text: l10n.t('pc_wh_tab_activity'),
              ),
              Tab(
                icon: const Icon(Icons.account_balance_wallet_outlined, size: 16),
                text: l10n.t('pc_wh_tab_budgets'),
              ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _subTabs,
            children: [
              _WarehouseDashboardView(canManage: dashboardCatalog),
              _WarehouseInventoryView(
                keeperManage: keeperManage,
                assignToolsFromStock: assignTools,
                canExportTools: exportTools,
                exportingTools: _exportingTools,
                onExportTools: _exportWarehouseToolsReport,
                exportingMaterials: _exportingMaterials,
                onExportMaterials: _exportWarehouseMaterialsReport,
              ),
              _WarehouseMaterialsView(canManage: dashboardCatalog, toolsCatalogOnly: true),
              _WarehouseMaterialsView(canManage: dashboardCatalog, toolsCatalogOnly: false),
              _WarehouseRequestsView(canManage: keeperManage),
              if (showReasons) const _WarehouseMaterialReasonsView(),
              _WarehouseActivityView(),
              _WarehouseBudgetsView(workspace: widget.workspace),
            ],
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _pcWhAttached?.removeListener(_onWhPcChanged);
    _subTabs.dispose();
    super.dispose();
  }
}

// ─── Material use reasons (warehouse sub-tab) ────────────────────────────────

class _WarehouseMaterialReasonsView extends StatefulWidget {
  const _WarehouseMaterialReasonsView();

  @override
  State<_WarehouseMaterialReasonsView> createState() =>
      _WarehouseMaterialReasonsViewState();
}

class _WarehouseMaterialReasonsViewState extends State<_WarehouseMaterialReasonsView> {
  final _editCtrl = TextEditingController();
  late List<String> _live;
  bool _loaded = false;
  bool _saving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded) return;
    _loaded = true;
    final pc = context.read<PrivateCompanyProvider>();
    _live = List<String>.from(pc.workspace?.materialUseReasons ?? const []);
  }

  @override
  void dispose() {
    _editCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final pc = context.read<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    final ok = await pc.updateMaterialUseReasons(_live);
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? (pc.lastSuccess ?? l10n.t('pc_ws_material_reasons_saved'))
              : (pc.error ?? l10n.t('pc_ws_material_reasons_save_failed')),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    if (!pc.canManageStaff) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.t('pc_wh_reasons_no_access'),
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13, height: 1.4),
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        Text(
          l10n.t('pc_ws_material_use_reasons'),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          l10n.t('pc_wh_reasons_subtitle'),
          style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12, height: 1.35),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _editCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: l10n.t('pc_ws_material_reason_add_hint'),
            hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            suffixIcon: IconButton(
              icon: const Icon(Icons.add_circle_outline, color: Color(0xFF6C63FF)),
              onPressed: () {
                final s = _editCtrl.text.trim();
                if (s.isEmpty) return;
                if (_live.any((x) => x.toLowerCase() == s.toLowerCase())) return;
                setState(() {
                  _live = [..._live, s];
                  _editCtrl.clear();
                });
              },
            ),
          ),
        ),
        const SizedBox(height: 12),
        ..._live.asMap().entries.map((e) {
          final i = e.key;
          final r = e.value;
          return ListTile(
            dense: true,
            tileColor: const Color(0xFF12122A).withAlpha(120),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            title: Text(r, style: const TextStyle(color: Colors.white, fontSize: 14)),
            trailing: IconButton(
              icon: const Icon(Icons.close, color: Colors.white54, size: 20),
              onPressed: () {
                setState(() {
                  _live = [..._live]..removeAt(i);
                });
              },
            ),
          );
        }),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF6C63FF),
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: _saving
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(l10n.t('submit')),
        ),
      ],
    );
  }
}

// ─── Budgets sub-tab (per-staff caps; managers edit, all roles can view self) ─

class _WarehouseBudgetsView extends StatefulWidget {
  const _WarehouseBudgetsView({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_WarehouseBudgetsView> createState() => _WarehouseBudgetsViewState();
}

class _WarehouseBudgetsViewState extends State<_WarehouseBudgetsView> {
  String? _selectedStaffId;
  String? _pickMaterialId;
  final _qtyCtrl = TextEditingController(text: '1');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  @override
  void dispose() {
    _qtyCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final pc = context.read<PrivateCompanyProvider>();
    final uid = context.read<AuthProvider>().user?.id;
    await wh.refreshMaterials();
    if (pc.canManageStaff) {
      if (widget.workspace.staff.isNotEmpty) {
        _selectedStaffId ??= widget.workspace.staff.first.id;
      } else if (pc.isOwner && uid != null) {
        _selectedStaffId = uid;
      }
      await wh.loadStaffMaterialBudgets(staffId: _selectedStaffId);
    } else {
      await wh.loadStaffMaterialBudgets();
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final canEdit = pc.canManageStaff;
    return RefreshIndicator(
      onRefresh: _reload,
      color: const Color(0xFF38BDF8),
      backgroundColor: const Color(0xFF12122A),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Text(
            canEdit
                ? 'Set how many units of each catalog material a staff member may hold in “assigned” status at once. Warehouse assignments are blocked if they would exceed the cap.'
                : 'Your material assignment budget (per catalog SKU). Used, damaged, and returned totals are taken from the warehouse movement log.',
            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12, height: 1.35),
          ),
          if (canEdit && widget.workspace.staff.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('Staff member', style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12)),
            const SizedBox(height: 6),
            DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFF12122A),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withAlpha(20)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: _selectedStaffId,
                  dropdownColor: const Color(0xFF12122A),
                  items: widget.workspace.staff
                      .map(
                        (s) => DropdownMenuItem(
                          value: s.id,
                          child: Text(
                            s.name ?? s.username,
                            style: const TextStyle(color: Colors.white, fontSize: 13),
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) async {
                    if (v == null) return;
                    setState(() => _selectedStaffId = v);
                    await wh.loadStaffMaterialBudgets(staffId: v);
                  },
                ),
              ),
            ),
          ],
          if (canEdit && widget.workspace.staff.isEmpty && pc.isOwner) ...[
            const SizedBox(height: 8),
            Text(
              'No staff rows yet — budgets will apply to your owner account id once you add people, or use the People tab first.',
              style: TextStyle(color: Colors.orange.withAlpha(220), fontSize: 12),
            ),
          ],
          if (canEdit && _selectedStaffId != null) ...[
            const SizedBox(height: 16),
            Text('Add / update budget line', style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12)),
            const SizedBox(height: 8),
            if (wh.materials.isEmpty)
              Text('Add catalog materials first.', style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12))
            else ...[
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: wh.materials.map((m) {
                  final sel = _pickMaterialId == m.id;
                  return GestureDetector(
                    onTap: () => setState(() => _pickMaterialId = m.id),
                    child: _ChipBox(
                      label: m.name,
                      selected: sel,
                      color: _parseHex(m.color) ?? const Color(0xFF6C63FF),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _qtyCtrl,
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Budget quantity (max assigned units)',
                  labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _GradientButton(
                onPressed: wh.submitting || _selectedStaffId == null || _pickMaterialId == null
                    ? null
                    : () async {
                        final q = int.tryParse(_qtyCtrl.text.trim()) ?? 0;
                        if (q < 0) return;
                        final ok = await wh.saveStaffMaterialBudget(
                          staffId: _selectedStaffId!,
                          materialId: _pickMaterialId!,
                          budgetQuantity: q,
                        );
                        if (ok && mounted) setState(() {});
                      },
                label: 'Save budget line',
                icon: Icons.save_rounded,
                stretch: true,
              ),
            ],
          ],
          const SizedBox(height: 20),
          Text('Budget lines', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (wh.staffMaterialBudgetLines.isEmpty)
            Text(
              'No budget rows yet.',
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
            )
          else
            ...wh.staffMaterialBudgetLines.map((row) {
              final mat = row['material'] as Map<String, dynamic>?;
              final name = mat?['name'] as String? ?? 'Material';
              final cap = (row['budgetQuantity'] as num?)?.toInt() ?? 0;
              final assigned = (row['assignedQuantity'] as num?)?.toInt() ?? 0;
              final avail = (row['availableToAssign'] as num?)?.toInt() ?? 0;
              final used = (row['usedLifetimeQuantity'] as num?)?.toInt() ?? 0;
              final dmg = (row['damagedLifetime'] as num?)?.toInt() ?? 0;
              final lost = (row['lostLifetime'] as num?)?.toInt() ?? 0;
              final id = row['id'] as String?;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _GlassCard(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Text(
                          'Cap $cap · assigned $assigned · available $avail · used (lifetime) $used · damaged $dmg · lost $lost',
                          style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11, height: 1.3),
                        ),
                        if (canEdit && id != null && _selectedStaffId != null) ...[
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: wh.submitting
                                  ? null
                                  : () async {
                                      final ok = await _confirm(
                                        context,
                                        'Remove this budget line?',
                                        'Assignments already within the cap stay valid; only future assignments are unrestricted.',
                                      );
                                      if (ok == true) {
                                        await wh.deleteStaffMaterialBudget(id, staffId: _selectedStaffId!);
                                        if (mounted) setState(() {});
                                      }
                                    },
                              child: const Text('Remove', style: TextStyle(color: Color(0xFFFF4757))),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

// ─── Keeper / full-inventory tracking (dashboard) ─────────────────────────

class _WarehouseKeeperTrackingSections extends StatelessWidget {
  const _WarehouseKeeperTrackingSections();

  static String _fmtDate(dynamic raw) {
    if (raw == null) return '—';
    final d = DateTime.tryParse(raw.toString());
    if (d == null) return raw.toString();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    if (pc.seesOnlyAssignedWarehouseInventory) return const SizedBox.shrink();
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final t = wh.keeperTracking;
    if (t == null || t['success'] != true) return const SizedBox.shrink();

    final rollup = (t['materialRollup'] as List?) ?? const [];
    final provRoll = (t['provinceRollup'] as List?) ?? const [];
    final assigned = (t['assignedItems'] as List?) ?? const [];
    final used = (t['recentlyUsedItems'] as List?) ?? const [];
    final dmg = (t['damageAndLoss'] as List?) ?? const [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Keeper tracking — all staff & materials'),
        const SizedBox(height: 6),
        Text(
          'Per SKU counts (in warehouse / assigned / used / damaged / lost), every assignment with holder, recent consumption with ticket site & time, and damage or loss with the reason from the log.',
          style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11, height: 1.35),
        ),
        const SizedBox(height: 12),
        if (provRoll.isNotEmpty)
          _GlassCard(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('By province (counts by status)',
                      style: TextStyle(
                          color: Colors.white.withAlpha(200),
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  for (final raw in provRoll.take(24))
                    Builder(
                      builder: (_) {
                        final m = raw as Map<String, dynamic>;
                        final p = m['province'] as String? ?? '—';
                        final iw = (m['IN_WAREHOUSE'] as num?)?.toInt() ?? 0;
                        final asg = (m['ASSIGNED'] as num?)?.toInt() ?? 0;
                        final u = (m['USED'] as num?)?.toInt() ?? 0;
                        final d = (m['DAMAGED'] as num?)?.toInt() ?? 0;
                        final l = (m['LOST'] as num?)?.toInt() ?? 0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Text(
                            '$p — in stock $iw · assigned $asg · used $u · damaged $d · lost $l',
                            style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.3),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        if (provRoll.isNotEmpty) const SizedBox(height: 14),
        if (rollup.isNotEmpty)
          _GlassCard(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('By material type',
                      style: TextStyle(
                          color: Colors.white.withAlpha(200),
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  for (final raw in rollup.take(40))
                    Builder(
                      builder: (_) {
                        final m = raw as Map<String, dynamic>;
                        final name = m['name'] as String? ?? '—';
                        final iw = (m['IN_WAREHOUSE'] as num?)?.toInt() ?? 0;
                        final asg = (m['ASSIGNED'] as num?)?.toInt() ?? 0;
                        final u = (m['USED'] as num?)?.toInt() ?? 0;
                        final d = (m['DAMAGED'] as num?)?.toInt() ?? 0;
                        final l = (m['LOST'] as num?)?.toInt() ?? 0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Text(
                            '$name — in stock $iw · assigned $asg · used $u · damaged $d · lost $l',
                            style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.3),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 14),
        _GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Assigned to staff (${assigned.length} lines)',
                    style: TextStyle(
                        color: Colors.white.withAlpha(200),
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (assigned.isEmpty)
                  Text('Nothing assigned right now.',
                      style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11))
                else
                  for (final raw in assigned.take(60))
                    Builder(
                      builder: (_) {
                        final row = raw as Map<String, dynamic>;
                        final mat = row['material'] as Map<String, dynamic>?;
                        final matName = mat?['name'] as String? ?? 'Material';
                        final sn = row['serialNumber'] as String? ?? '';
                        final qty = (row['quantity'] as num?)?.toInt() ?? 1;
                        final prov = row['province'] as String? ?? '';
                        final as = row['assignedTo'] as Map<String, dynamic>?;
                        final holder = as?['name'] as String? ?? as?['username'] as String? ?? '—';
                        final role = as?['role'] as String? ?? '';
                        final ho = row['handoverConfirmedAt'];
                        final hoOk = ho != null;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            '· $matName ($sn) ×$qty — $holder${role.isNotEmpty ? ' ($role)' : ''} · $prov · handover ${hoOk ? '✓' : 'pending'}',
                            style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.35),
                          ),
                        );
                      },
                    ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        _GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Recently used on tickets (${used.length})',
                    style: TextStyle(
                        color: Colors.white.withAlpha(200),
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (used.isEmpty)
                  Text('No usage records yet.',
                      style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11))
                else
                  for (final raw in used.take(50))
                    Builder(
                      builder: (_) {
                        final row = raw as Map<String, dynamic>;
                        final mat = row['material'] as Map<String, dynamic>?;
                        final matName = mat?['name'] as String? ?? 'Material';
                        final sn = row['serialNumber'] as String? ?? '';
                        final qty = (row['quantity'] as num?)?.toInt() ?? 1;
                        final usedAt = _fmtDate(row['usedAt']);
                        final tk = row['usedTicket'] as Map<String, dynamic>?;
                        final site = tk?['siteName'] as String? ?? '';
                        final tec = tk?['technique'] as String? ?? '';
                        final tprov = tk?['province'] as String? ?? '';
                        final tid = tk?['id'] as String? ?? '';
                        final where = [site, tec, tprov].where((e) => e.trim().isNotEmpty).join(' · ');
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            '· $matName ($sn) ×$qty — when $usedAt — where: ${where.isNotEmpty ? where : tid}',
                            style: const TextStyle(color: Colors.white70, fontSize: 11, height: 1.35),
                          ),
                        );
                      },
                    ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        _GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Damage & loss (with reason from log)',
                    style: TextStyle(
                        color: Colors.white.withAlpha(200),
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (dmg.isEmpty)
                  Text('No damage or loss movements.',
                      style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11))
                else
                  for (final raw in dmg.take(50))
                    Builder(
                      builder: (_) {
                        final mv = raw as Map<String, dynamic>;
                        final typ = mv['type'] as String? ?? '';
                        final at = _fmtDate(mv['createdAt']);
                        final note = mv['note'] as String? ?? '';
                        final item = mv['item'] as Map<String, dynamic>?;
                        final mat = item?['material'] as Map<String, dynamic>?;
                        final matName = mat?['name'] as String? ?? 'Item';
                        final sn = item?['serialNumber'] as String? ?? '';
                        final from = mv['fromStaff'] as Map<String, dynamic>?;
                        final holder =
                            from?['name'] as String? ?? from?['username'] as String? ?? '—';
                        final act = mv['actor'] as Map<String, dynamic>?;
                        final actor =
                            act?['name'] as String? ?? act?['username'] as String? ?? '—';
                        final tk = mv['ticket'] as Map<String, dynamic>?;
                        final tks = tk == null
                            ? ''
                            : [
                                tk['siteName'],
                                tk['province'],
                                tk['technique'],
                              ].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');
                        final why =
                            note.trim().isNotEmpty ? note : '(no note — ask the reporter)';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '$typ · $matName ($sn) · $at',
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Held by: $holder · Recorded by: $actor',
                                style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 10),
                              ),
                              if (tks.isNotEmpty)
                                Text('Ticket: $tks',
                                    style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 10)),
                              Text('Why: $why',
                                  style: const TextStyle(
                                      color: Color(0xFFFFB4A8), fontSize: 11, height: 1.35)),
                            ],
                          ),
                        );
                      },
                    ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Dashboard sub-tab ─────────────────────────────────────────────────────

Future<void> _showProvinceWarehouseInventory(
    BuildContext context, String province) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.38,
      maxChildSize: 0.95,
      builder: (_, scrollCtrl) =>
          _ProvinceInventorySheet(province: province, scrollController: scrollCtrl),
    ),
  );
}

class _ProvinceInventorySheet extends StatefulWidget {
  const _ProvinceInventorySheet({
    required this.province,
    required this.scrollController,
  });
  final String province;
  final ScrollController scrollController;

  @override
  State<_ProvinceInventorySheet> createState() => _ProvinceInventorySheetState();
}

class _ProvinceInventorySheetState extends State<_ProvinceInventorySheet> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _payload;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        if (_payload != null) _loading = true;
        _error = null;
      });
    }
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final res = await wh.fetchProvinceInventory(widget.province);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res == null) {
        _error = 'Could not load inventory for this province.';
      } else {
        _payload = res;
      }
    });
  }

  String _statusLabel(String apiKey) =>
      materialItemStatusLabel(materialItemStatusFromString(apiKey));

  String _statusTotalChipLabel(MapEntry<String, dynamic> e) {
    final m = e.value is Map
        ? Map<String, dynamic>.from(e.value as Map)
        : const <String, dynamic>{};
    final q = (m['quantity'] as num?)?.toInt() ?? 0;
    final lines = (m['lines'] as num?)?.toInt() ?? 0;
    return '${_statusLabel(e.key)} · $q qty · $lines lines';
  }

  List<Widget> _provinceInventoryListChildren() {
    final p = _payload!;
    final st = (p['statusTotals'] as Map?)?.cast<String, dynamic>() ?? {};
    final raw = (p['materials'] as List?) ?? const [];
    final out = <Widget>[];

    if (st.isNotEmpty) {
      out.addAll([
        Text(
          'Totals by status',
          style: TextStyle(
            color: Colors.white.withAlpha(170),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final e in st.entries)
              _StaffBadge(
                label: _statusTotalChipLabel(e),
                color: _statusColor(materialItemStatusFromString(e.key)),
              ),
          ],
        ),
        const SizedBox(height: 18),
      ]);
    }

    out.addAll([
      Text(
        'Materials (quantities in this province)',
        style: TextStyle(
          color: Colors.white.withAlpha(170),
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 8),
    ]);

    if (raw.isEmpty) {
      out.add(
        Text(
          'No stock rows in this province.',
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
        ),
      );
      return out;
    }

    final lineItems = (p['items'] as List?) ?? const [];
    if (lineItems.isNotEmpty) {
      out.addAll([
        Text(
          'Stock lines (assigned / in warehouse / used)',
          style: TextStyle(
            color: Colors.white.withAlpha(170),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
      ]);
      for (final rawLine in lineItems) {
        final line = Map<String, dynamic>.from(rawLine as Map);
        final matName = line['materialName']?.toString() ?? '—';
        final sn = line['serialNumber']?.toString() ?? '';
        final qty = (line['quantity'] as num?)?.toInt() ?? 1;
        final st = line['status']?.toString() ?? '';
        final assignState = line['assignmentState']?.toString() ?? '';
        final holder = line['assignedToName']?.toString();
        final stockCond = line['stockCondition']?.toString();
        final site = line['usedSiteName']?.toString();
        final usedProv = line['usedTicketProvince']?.toString();
        final pendingHo = line['handoverPending'] == true;
        final pendingRet = line['returnPending'] == true;
        final buf = <String>[
          materialItemStatusLabel(materialItemStatusFromString(st)),
          if (assignState == 'assigned_pending_receipt') 'awaiting receipt',
          if (assignState == 'assigned_confirmed') 'received',
          if (holder != null && holder.isNotEmpty) 'held by $holder',
          if (stockCond == 'new') 'new (returned)',
          if (stockCond == 'used') 'used (returned)',
          if (st == 'USED' && site != null && site.isNotEmpty)
            'used at site: $site${usedProv != null && usedProv.isNotEmpty ? ' ($usedProv)' : ''}',
          if (pendingHo) 'handover pending',
          if (pendingRet) 'return approval pending',
        ];
        out.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(8),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$matName · $sn ×$qty',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    buf.join(' · '),
                    style: TextStyle(
                      color: Colors.white.withAlpha(160),
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }
      out.add(const SizedBox(height: 18));
    }

    for (final row in raw) {
      final m = Map<String, dynamic>.from(row as Map);
      final name = m['name']?.toString() ?? '—';
      final unit = m['unit']?.toString();
      final total = (m['totalQuantity'] as num?)?.toInt() ?? 0;
      final lines = (m['lineCount'] as num?)?.toInt() ?? 0;
      final by = (m['byStatus'] as Map?)?.cast<String, dynamic>() ?? {};
      final colorHex = m['color']?.toString();
      final dot = _parseHex(colorHex) ?? const Color(0xFF6C63FF);
      final detail = by.entries
          .map((e) =>
              '${_statusLabel(e.key)}: ${(e.value as num?)?.toInt() ?? 0}')
          .join(' · ');
      out.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(10),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: dot,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      '$total${unit != null && unit.isNotEmpty ? ' $unit' : ''}',
                      style: const TextStyle(
                        color: Color(0xFF38BDF8),
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '$lines stock line(s)',
                  style: TextStyle(
                    color: Colors.white.withAlpha(130),
                    fontSize: 11,
                  ),
                ),
                if (detail.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    detail,
                    style: TextStyle(
                      color: Colors.white.withAlpha(160),
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 44,
            height: 5,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.province,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: Colors.white54),
                ),
              ],
            ),
          ),
          if (_loading)
            const Expanded(
              child: Center(
                child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
              ),
            )
          else if (_error != null)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 14),
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: RefreshIndicator(
                color: const Color(0xFF38BDF8),
                backgroundColor: const Color(0xFF12122A),
                onRefresh: _load,
                child: ListView(
                  controller: widget.scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
                  children: _provinceInventoryListChildren(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _WarehouseDashboardView extends StatelessWidget {
  const _WarehouseDashboardView({required this.canManage});
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final d = wh.dashboard;
    return RefreshIndicator(
      onRefresh: wh.refreshAll,
      color: const Color(0xFF38BDF8),
      backgroundColor: const Color(0xFF12122A),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          if (d == null && wh.loading) ...const [
            SizedBox(height: 80),
            Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF))),
          ] else if (d == null) ...[
            const SizedBox(height: 60),
            const Center(
              child: Icon(Icons.inventory_2_rounded,
                  color: Colors.white24, size: 72),
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(
                'Your warehouse is empty.',
                style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 14),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(
                canManage
                    ? 'Add materials and stock items to get started.'
                    : 'Once your managers stock items, your assignments will appear here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
              ),
            ),
            if (canManage) ...[
              const SizedBox(height: 24),
              Center(
                child: _GradientButton(
                  onPressed: () => _openAddMaterial(context),
                  label: 'Add material',
                  icon: Icons.add_box_rounded,
                ),
              ),
            ],
          ] else ...[
            // Headline counters
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    label: 'Total items',
                    value: '${d.total}',
                    icon: Icons.inventory_2_rounded,
                    color: const Color(0xFF38BDF8),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _MetricCard(
                    label: 'In warehouse',
                    value: '${d.byStatus[MaterialItemStatus.inWarehouse] ?? 0}',
                    icon: Icons.warehouse_rounded,
                    color: const Color(0xFF6C63FF),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    label: 'Assigned',
                    value: '${d.byStatus[MaterialItemStatus.assigned] ?? 0}',
                    icon: Icons.person_pin_circle_rounded,
                    color: const Color(0xFFFFA53A),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _MetricCard(
                    label: 'Used',
                    value: '${d.byStatus[MaterialItemStatus.used] ?? 0}',
                    icon: Icons.task_alt_rounded,
                    color: const Color(0xFF00D4AA),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    label: 'Damaged',
                    value: '${d.byStatus[MaterialItemStatus.damaged] ?? 0}',
                    icon: Icons.report_problem_rounded,
                    color: const Color(0xFFFF4757),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _MetricCard(
                    label: 'Lost',
                    value: '${d.byStatus[MaterialItemStatus.lost] ?? 0}',
                    icon: Icons.help_outline_rounded,
                    color: const Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const _SectionTitle('Stock by province'),
            const SizedBox(height: 8),
            if (d.byProvince.isEmpty)
              _EmptyBlock(text: 'No items stocked yet.')
            else
              _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      for (final r in d.byProvince)
                        _BarRow(
                          label: r.province,
                          value: r.count,
                          maxValue: d.byProvince.first.count,
                          color: const Color(0xFF38BDF8),
                          icon: Icons.public_rounded,
                          onTap: pc.seesOnlyAssignedWarehouseInventory
                              ? null
                              : () => _showProvinceWarehouseInventory(
                                    context,
                                    r.province,
                                  ),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 18),
            const _SectionTitle('Top materials'),
            const SizedBox(height: 8),
            if (d.byMaterial.isEmpty)
              _EmptyBlock(text: 'No materials yet.')
            else
              _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      for (final r in d.byMaterial)
                        _BarRow(
                          label: r.name,
                          value: r.count,
                          maxValue: d.byMaterial.first.count,
                          color: _parseHex(r.color) ?? const Color(0xFF6C63FF),
                          icon: Icons.category_rounded,
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 18),
            const _SectionTitle('Held by staff'),
            const SizedBox(height: 8),
            if (d.heldByStaff.isEmpty)
              _EmptyBlock(text: 'No staff are currently holding items.')
            else
              _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      for (final r in d.heldByStaff)
                        _BarRow(
                          label: (r.name?.trim().isNotEmpty == true)
                              ? r.name!
                              : (r.username ?? '—'),
                          subLabel: [
                            if (r.role != null && r.role!.isNotEmpty) r.role!,
                            if (r.province != null && r.province!.isNotEmpty)
                              r.province!,
                          ].join(' • '),
                          value: r.count,
                          maxValue: d.heldByStaff.first.count,
                          color: const Color(0xFFFFA53A),
                          icon: Icons.person_rounded,
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 18),
            const _WarehouseKeeperTrackingSections(),
            const SizedBox(height: 18),
            const _SectionTitle('Tickets consuming most items'),
            const SizedBox(height: 8),
            if (d.topUsageTickets.isEmpty)
              _EmptyBlock(text: 'No materials have been used on tickets yet.')
            else
              _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      for (final r in d.topUsageTickets)
                        _BarRow(
                          label: r.siteName?.isNotEmpty == true
                              ? r.siteName!
                              : (r.technique ?? r.ticketId ?? '—'),
                          subLabel: [
                            if (r.technique != null) r.technique!,
                            if (r.province != null) r.province!,
                            if (r.status != null) r.status!,
                          ].join(' • '),
                          value: r.used,
                          maxValue: d.topUsageTickets.first.used,
                          color: const Color(0xFF00D4AA),
                          icon: Icons.confirmation_number_rounded,
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 18),
            const _SectionTitle('Recent activity'),
            const SizedBox(height: 8),
            if (d.recentMovements.isEmpty)
              _EmptyBlock(text: 'No movements yet.')
            else
              ...d.recentMovements.map((m) => _MovementCard(movement: m)),
          ],
        ],
      ),
    );
  }

  void _openAddMaterial(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _MaterialEditorSheet(),
    );
  }
}

// ─── Inventory sub-tab ─────────────────────────────────────────────────────

class _WarehouseInventoryView extends StatefulWidget {
  const _WarehouseInventoryView({
    required this.keeperManage,
    required this.assignToolsFromStock,
    required this.canExportTools,
    required this.exportingTools,
    required this.onExportTools,
    required this.exportingMaterials,
    required this.onExportMaterials,
  });
  final bool keeperManage;
  final bool assignToolsFromStock;
  final bool canExportTools;
  final bool exportingTools;
  final VoidCallback onExportTools;
  final bool exportingMaterials;
  final VoidCallback onExportMaterials;

  @override
  State<_WarehouseInventoryView> createState() =>
      _WarehouseInventoryViewState();
}

class _WarehouseInventoryViewState extends State<_WarehouseInventoryView> {
  final _search = TextEditingController();

  bool get _inventoryElevated =>
      widget.keeperManage || widget.assignToolsFromStock;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        if (widget.canExportTools)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: widget.exportingTools ? null : widget.onExportTools,
                    icon: widget.exportingTools
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF8B83FF),
                            ),
                          )
                        : const Icon(Icons.table_chart_outlined, size: 16, color: Color(0xFF8B83FF)),
                    label: Text(
                      l10n.t('pc_warehouse_tools_export'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF8B83FF),
                      side: const BorderSide(color: Color(0xFF6C63FF)),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: widget.exportingMaterials ? null : widget.onExportMaterials,
                    icon: widget.exportingMaterials
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF00D4AA),
                            ),
                          )
                        : const Icon(Icons.inventory_2_outlined, size: 16, color: Color(0xFF00D4AA)),
                    label: Text(
                      l10n.t('pc_warehouse_materials_export'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF00D4AA),
                      side: const BorderSide(color: Color(0xFF00B894)),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _search,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Search serial, note, or material',
                    hintStyle:
                        TextStyle(color: Colors.white.withAlpha(80), fontSize: 13),
                    prefixIcon: const Icon(Icons.search_rounded,
                        color: Color(0xFF8B83FF), size: 18),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear_rounded,
                                color: Colors.white54, size: 18),
                            onPressed: () {
                              _search.clear();
                              wh.setFilters(query: '');
                              wh.refreshItems();
                            },
                          ),
                    filled: true,
                    fillColor: const Color(0xFF12122A),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  onChanged: (v) {
                    wh.setFilters(query: v);
                  },
                  onSubmitted: (_) => wh.refreshItems(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Filters',
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF12122A),
                  foregroundColor: const Color(0xFF8B83FF),
                ),
                onPressed: () => _openFilters(context),
                icon: const Icon(Icons.tune_rounded, size: 20),
              ),
              if (widget.keeperManage) ...[
                const SizedBox(width: 6),
                IconButton(
                  tooltip: 'Stock items',
                  style: IconButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () => _openStockSheet(context),
                  icon: const Icon(Icons.add_box_rounded, size: 20),
                ),
              ],
            ],
          ),
        ),
        if (wh.hasAnyFilter)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: _activeFilterChips(wh),
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.clear_all_rounded,
                      color: Color(0xFF8B83FF), size: 16),
                  label: const Text(
                    'Reset',
                    style: TextStyle(color: Color(0xFF8B83FF), fontSize: 12),
                  ),
                  onPressed: () {
                    wh.resetFilters();
                    _search.clear();
                    wh.refreshItems();
                  },
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              await wh.refreshItems();
              if (!context.mounted) return;
              final pc = context.read<PrivateCompanyProvider>();
              if (!pc.seesOnlyAssignedWarehouseInventory) {
                await wh.loadKeeperTracking();
              }
            },
            color: const Color(0xFF38BDF8),
            backgroundColor: const Color(0xFF12122A),
            child: wh.items.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 60),
                      const Center(
                        child: Icon(Icons.inbox_rounded,
                            color: Colors.white24, size: 72),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: Text(
                          wh.hasAnyFilter
                              ? 'No items match the current filters.'
                              : (_inventoryElevated
                                  ? 'Stock your first item to get started.'
                                  : 'You don\'t hold any items right now.'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.white.withAlpha(160), fontSize: 13),
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: wh.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final item = wh.items[i];
                      return _InventoryRow(
                        item: item,
                        keeperManage: widget.keeperManage,
                        inventoryElevated: _inventoryElevated,
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }

  List<Widget> _activeFilterChips(PrivateCompanyWarehouseProvider wh) {
    final chips = <Widget>[];
    if (wh.mineOnly) {
      chips.add(const _FilterChipBadge(label: 'Mine only'));
    }
    if (wh.filterProvince != null) {
      chips.add(_FilterChipBadge(label: 'Province: ${wh.filterProvince}'));
    }
    if (wh.filterStatus != null) {
      chips.add(_FilterChipBadge(
        label: 'Status: ${materialItemStatusLabel(materialItemStatusFromString(wh.filterStatus))}',
      ));
    }
    if (wh.filterMaterialId != null) {
      final mat = wh.materials.cast<WarehouseMaterial?>().firstWhere(
            (m) => m?.id == wh.filterMaterialId,
            orElse: () => null,
          );
      chips.add(_FilterChipBadge(label: 'Material: ${mat?.name ?? '—'}'));
    }
    return chips;
  }

  void _openFilters(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _InventoryFiltersSheet(),
    );
  }

  void _openStockSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _StockItemsSheet(),
    );
  }
}

class _InventoryRow extends StatelessWidget {
  const _InventoryRow({
    required this.item,
    required this.keeperManage,
    required this.inventoryElevated,
  });
  final WarehouseItem item;
  final bool keeperManage;
  final bool inventoryElevated;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(item.status);
    return _GlassCard(
      child: InkWell(
        onTap: () => _openActions(context, item, keeperManage),
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: statusColor.withAlpha(40),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: statusColor.withAlpha(80)),
                    ),
                    alignment: Alignment.center,
                    child: Icon(
                      _statusIcon(item.status),
                      color: statusColor,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.materialName ?? 'Material',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'SN: ${item.serialNumber}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: Colors.white.withAlpha(160), fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  if (inventoryElevated)
                    const Icon(Icons.more_horiz_rounded,
                        color: Colors.white54, size: 20),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  _StaffBadge(
                    label: materialItemStatusLabel(item.status),
                    color: statusColor,
                  ),
                  if (item.province.isNotEmpty)
                    _StaffBadge(
                      label: item.province,
                      color: const Color(0xFF38BDF8),
                    ),
                  if (item.assignedToName != null)
                    _StaffBadge(
                      label: item.assignedToName!,
                      color: const Color(0xFFFFA53A),
                    ),
                  if (item.usedTicketSiteName != null)
                    _StaffBadge(
                      label: 'Ticket: ${item.usedTicketSiteName}',
                      color: const Color(0xFF00D4AA),
                    ),
                  if (item.handoverPending)
                    _StaffBadge(
                      label: 'Awaiting your receipt',
                      color: const Color(0xFFE11D48),
                    ),
                  if (item.returnPending)
                    _StaffBadge(
                      label: 'Return approval needed',
                      color: const Color(0xFF38BDF8),
                    ),
                  if (item.quantity > 1)
                    _StaffBadge(
                      label: '×${item.quantity}${item.materialUnit != null ? ' ${item.materialUnit}' : ''}',
                      color: const Color(0xFF94A3B8),
                    ),
                ],
              ),
              if (item.notes != null && item.notes!.trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  item.notes!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _openActions(BuildContext context, WarehouseItem item, bool keeperManage) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ItemActionsSheet(
        item: item,
        keeperManage: keeperManage,
        anchorContext: context,
      ),
    );
  }
}

// ─── Requests sub-tab ──────────────────────────────────────────────────────

class _WarehouseRequestsView extends StatefulWidget {
  const _WarehouseRequestsView({required this.canManage});
  final bool canManage;

  @override
  State<_WarehouseRequestsView> createState() => _WarehouseRequestsViewState();
}

class _WarehouseRequestsViewState extends State<_WarehouseRequestsView> {
  String _scope = 'mine';

  @override
  void initState() {
    super.initState();
    if (widget.canManage) _scope = 'pending';
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<void> _reload() async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    await wh.refreshMaterialRequests(_scope);
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final canSeeQueues = pc.canManageWarehouse;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      if (canSeeQueues) ...[
                        ChoiceChip(
                          label: const Text('Pending'),
                          selected: _scope == 'pending',
                          onSelected: (_) {
                            setState(() => _scope = 'pending');
                            _reload();
                          },
                        ),
                        const SizedBox(width: 8),
                        ChoiceChip(
                          label: const Text('All'),
                          selected: _scope == 'all',
                          onSelected: (_) {
                            setState(() => _scope = 'all');
                            _reload();
                          },
                        ),
                        const SizedBox(width: 8),
                      ],
                      ChoiceChip(
                        label: const Text('Mine'),
                        selected: _scope == 'mine',
                        onSelected: (_) {
                          setState(() => _scope = 'mine');
                          _reload();
                        },
                      ),
                    ],
                  ),
                ),
              ),
              IconButton(
                tooltip: 'New request',
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  foregroundColor: Colors.white,
                ),
                onPressed: () => _openNewRequest(context),
                icon: const Icon(Icons.add_rounded, size: 22),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            color: const Color(0xFF38BDF8),
            backgroundColor: const Color(0xFF12122A),
            child: wh.requestsLoading && wh.materialRequests.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: const [
                      SizedBox(height: 80),
                      Center(
                          child: CircularProgressIndicator(color: Color(0xFF6C63FF))),
                    ],
                  )
                : wh.materialRequests.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(24),
                        children: [
                          const SizedBox(height: 60),
                          const Center(
                            child: Icon(Icons.inbox_rounded,
                                color: Colors.white24, size: 72),
                          ),
                          const SizedBox(height: 14),
                          Center(
                            child: Text(
                              _scope == 'pending'
                                  ? 'No pending requests.'
                                  : 'No requests in this view.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: Colors.white.withAlpha(160), fontSize: 13),
                            ),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                        itemCount: wh.materialRequests.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final r = wh.materialRequests[i];
                          return _MaterialRequestTile(
                            request: r,
                            canRespond: canSeeQueues,
                            onTap: () => _openRequestDetail(context, r),
                          );
                        },
                      ),
          ),
        ),
      ],
    );
  }

  Future<void> _openNewRequest(BuildContext context) async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _NewMaterialRequestSheet(
        materials: wh.materials,
        inWarehouseCount: (mid) => wh.countInWarehouseForMaterial(mid),
      ),
    );
    await _reload();
  }

  Future<void> _openRequestDetail(BuildContext context, MaterialRequest r) async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _MaterialRequestDetailSheet(request: r),
    );
    await _reload();
    await wh.refreshAll();
  }
}

class _MaterialRequestTile extends StatelessWidget {
  const _MaterialRequestTile({
    required this.request,
    required this.canRespond,
    required this.onTap,
  });
  final MaterialRequest request;
  final bool canRespond;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final stColor = switch (request.status) {
      MaterialRequestStatus.pending => const Color(0xFFFFA53A),
      MaterialRequestStatus.accepted => const Color(0xFF38BDF8),
      MaterialRequestStatus.awaitingReceipt => const Color(0xFFC084FC),
      MaterialRequestStatus.fulfilled => const Color(0xFF00D4AA),
      MaterialRequestStatus.rejected => const Color(0xFFFF4757),
      MaterialRequestStatus.cancelled => const Color(0xFF94A3B8),
    };
    return _GlassCard(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      request.summaryLine,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  _StaffBadge(
                    label: materialRequestStatusLabel(request.status),
                    color: stColor,
                  ),
                  if (request.hasOpenReceiptIssue) ...[
                    const SizedBox(width: 6),
                    _StaffBadge(
                      label: 'Receipt issue',
                      color: const Color(0xFFFF4757),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              Text(
                request.kind == MaterialRequestKind.custom
                    ? 'Not in catalog'
                    : 'From catalog',
                style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
              ),
              if (request.requesterUsername != null ||
                  request.requesterName != null) ...[
                const SizedBox(height: 4),
                Text(
                  'By: ${request.requesterName?.trim().isNotEmpty == true ? request.requesterName! : request.requesterUsername ?? request.requesterId}',
                  style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
                ),
              ],
              if (request.responseNote != null &&
                  request.responseNote!.trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Response: ${request.responseNote}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _NewMaterialRequestSheet extends StatefulWidget {
  const _NewMaterialRequestSheet({
    required this.materials,
    required this.inWarehouseCount,
  });
  final List<WarehouseMaterial> materials;
  final int Function(String materialId) inWarehouseCount;

  @override
  State<_NewMaterialRequestSheet> createState() => _NewMaterialRequestSheetState();
}

class _NewMaterialRequestSheetState extends State<_NewMaterialRequestSheet> {
  bool _fromCatalog = true;
  String? _materialId;
  final _qty = TextEditingController(text: '1');
  final _customTitle = TextEditingController();
  final _customDesc = TextEditingController();
  final _notes = TextEditingController();
  String? _province;

  @override
  void dispose() {
    _qty.dispose();
    _customTitle.dispose();
    _customDesc.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 18,
            bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(context, 'Request materials'),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('In catalog'),
                        selected: _fromCatalog,
                        onSelected: (v) => setState(() {
                          _fromCatalog = true;
                        }),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Not in catalog'),
                        selected: !_fromCatalog,
                        onSelected: (v) => setState(() {
                          _fromCatalog = false;
                        }),
                      ),
                    ),
                  ],
                ),
                if (_fromCatalog) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Pick a material that exists in your workspace catalog. '
                    'The keeper will confirm availability.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  ...widget.materials.map((m) {
                    final sel = _materialId == m.id;
                    final n = widget.inWarehouseCount(m.id);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: InkWell(
                        onTap: () => setState(() => _materialId = m.id),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF12122A),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: sel
                                  ? const Color(0xFF6C63FF)
                                  : Colors.white10,
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  m.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                              Text(
                                'In WH: $n',
                                style: TextStyle(
                                  color: n > 0
                                      ? const Color(0xFF00D4AA)
                                      : Colors.white54,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                ] else ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Describe what you need if it is not listed in the catalog.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  _DarkField(
                    controller: _customTitle,
                    label: 'Title *',
                    hint: 'e.g. 10m ladder',
                    icon: Icons.title_rounded,
                  ),
                  const SizedBox(height: 10),
                  _DarkField(
                    controller: _customDesc,
                    label: 'Description',
                    hint: 'Specs, brand, size…',
                    icon: Icons.notes_rounded,
                    maxLines: 2,
                  ),
                ],
                const SizedBox(height: 10),
                _DarkField(
                  controller: _qty,
                  label: 'Quantity',
                  hint: '1',
                  icon: Icons.numbers_rounded,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 10),
                const Text('Province (optional)',
                    style: TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ChoiceChip(
                      label: const Text('Any'),
                      selected: _province == null,
                      onSelected: (_) => setState(() => _province = null),
                    ),
                    ...kIraqProvinces.map((p) {
                      final selected = _province == p;
                      return ChoiceChip(
                        label: Text(p, style: const TextStyle(fontSize: 11)),
                        selected: selected,
                        onSelected: (_) =>
                            setState(() => _province = selected ? null : p),
                      );
                    }),
                  ],
                ),
                const SizedBox(height: 10),
                _DarkField(
                  controller: _notes,
                  label: 'Notes (optional)',
                  hint: 'When / where you need it',
                  icon: Icons.chat_bubble_outline_rounded,
                  maxLines: 2,
                ),
                const SizedBox(height: 18),
                Consumer<PrivateCompanyWarehouseProvider>(
                  builder: (context, wh, _) {
                    return _GradientButton(
                      onPressed: wh.submitting
                          ? null
                          : () async {
                              final qty = int.tryParse(_qty.text.trim()) ?? 1;
                              if (qty < 1) return;
                              if (_fromCatalog) {
                                if (_materialId == null) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Select a material.')),
                                  );
                                  return;
                                }
                              } else {
                                if (_customTitle.text.trim().isEmpty) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Add a short title.')),
                                  );
                                  return;
                                }
                              }
                              final ok = await wh.createMaterialRequest(
                                kind: _fromCatalog
                                    ? 'INVENTORY_MATERIAL'
                                    : 'CUSTOM_UNAVAILABLE',
                                materialId: _fromCatalog ? _materialId : null,
                                customTitle:
                                    _fromCatalog ? null : _customTitle.text.trim(),
                                customDescription: _fromCatalog
                                    ? null
                                    : (_customDesc.text.trim().isEmpty
                                        ? null
                                        : _customDesc.text.trim()),
                                quantity: qty,
                                province: _province,
                                notes: _notes.text.trim().isEmpty
                                    ? null
                                    : _notes.text.trim(),
                              );
                              if (!context.mounted) return;
                              if (ok) Navigator.pop(context);
                            },
                      label: 'Submit request',
                      icon: Icons.send_rounded,
                      stretch: true,
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MaterialRequestDetailSheet extends StatelessWidget {
  const _MaterialRequestDetailSheet({required this.request});
  final MaterialRequest request;

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final uid = context.watch<AuthProvider>().user?.id;
    final canRespond = pc.canManageWarehouse;
    final isMine = uid != null && uid == request.requesterId;
    final isPending = request.status == MaterialRequestStatus.pending;
    final isAccepted = request.status == MaterialRequestStatus.accepted;
    final isAwaitingReceipt = request.status == MaterialRequestStatus.awaitingReceipt;
    final keeperCanProgress = canRespond && (isPending || isAccepted);

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                request.summaryLine,
                style: const TextStyle(
                    color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                materialRequestStatusLabel(request.status),
                style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
              ),
              const SizedBox(height: 12),
              if (request.customDescription != null &&
                  request.customDescription!.trim().isNotEmpty)
                Text(request.customDescription!,
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
              if (request.notes != null && request.notes!.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Notes: ${request.notes}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
              if (request.responseNote != null &&
                  request.responseNote!.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Text('Keeper reply: ${request.responseNote}',
                    style: const TextStyle(color: Color(0xFF00D4AA), fontSize: 12)),
              ],
              if (request.receivedAt != null) ...[
                const SizedBox(height: 10),
                Text(
                  'Receipt confirmed: ${request.receivedAt!.toLocal().toString().split('.').first}',
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
                if (request.receivedNote != null &&
                    request.receivedNote!.trim().isNotEmpty)
                  Text('Your note: ${request.receivedNote}',
                      style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12)),
              ],
              if (request.hasOpenReceiptIssue) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF4757).withAlpha(35),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFF4757).withAlpha(90)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Receipt problem reported',
                        style: TextStyle(
                          color: Color(0xFFFF8A94),
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        request.notReceivedNote ?? '',
                        style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.35),
                      ),
                      if (request.receiptIssueAcknowledgedAt != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Keeper acknowledged: ${request.receiptIssueAcknowledgedAt!.toLocal().toString().split('.').first}',
                          style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 11),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              if (canRespond && isAwaitingReceipt) ...[
                const SizedBox(height: 14),
                Text(
                  request.hasOpenReceiptIssue
                      ? 'The requester reported a receipt problem. Acknowledge after you contact them, or clear the flag after re-delivery so they can confirm.'
                      : 'Materials were dispatched. The requester must confirm receipt (Yes) or report a problem (No) on their device.',
                  style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12),
                ),
                if (request.hasOpenReceiptIssue) ...[
                  const SizedBox(height: 10),
                  if (request.receiptIssueAcknowledgedAt == null)
                    _GradientButton(
                      onPressed: wh.submitting
                          ? null
                          : () async {
                              final ok = await wh.patchMaterialRequest(
                                request.id,
                                action: 'keeper_ack_receipt_issue',
                              );
                              if (ok && context.mounted) Navigator.pop(context);
                            },
                      label: 'Acknowledge receipt issue',
                      icon: Icons.thumb_up_alt_outlined,
                      stretch: true,
                    ),
                  if (request.receiptIssueAcknowledgedAt == null) const SizedBox(height: 8),
                  _GradientButton(
                    onPressed: wh.submitting
                        ? null
                        : () async {
                            final ok = await wh.patchMaterialRequest(
                              request.id,
                              action: 'keeper_clear_receipt_issue',
                            );
                            if (ok && context.mounted) Navigator.pop(context);
                          },
                    label: 'Clear issue flag (after fix / re-delivery)',
                    icon: Icons.cleaning_services_rounded,
                    stretch: true,
                  ),
                ],
              ],
              if (keeperCanProgress) ...[
                const SizedBox(height: 18),
                if (isPending)
                  _GradientButton(
                    onPressed: wh.submitting
                        ? null
                        : () async {
                            final ok = await wh.patchMaterialRequest(
                              request.id,
                              action: 'accept',
                              responseNote: 'Accepted — we will prepare or source this.',
                            );
                            if (ok && context.mounted) Navigator.pop(context);
                          },
                    label: 'Accept',
                    icon: Icons.check_rounded,
                    stretch: true,
                  ),
                if (isPending) const SizedBox(height: 8),
                _GradientButton(
                  onPressed: wh.submitting
                      ? null
                      : () async {
                          final note = await _promptNote(
                              context, 'Reject — message to requester (required)');
                          if (note == null || note.trim().isEmpty) return;
                          final ok = await wh.patchMaterialRequest(
                            request.id,
                            action: 'reject',
                            responseNote: note,
                          );
                          if (ok && context.mounted) Navigator.pop(context);
                        },
                  label: 'Reject',
                  icon: Icons.close_rounded,
                  stretch: true,
                ),
                const SizedBox(height: 8),
                _GradientButton(
                  onPressed: wh.submitting
                      ? null
                      : () async {
                          final note = await _promptNote(
                              context, 'Dispatch — note to requester (required)');
                          if (note == null || note.trim().isEmpty) return;
                          if (!context.mounted) return;
                          final itemId = await _promptNote(
                            context,
                            'Optional: paste an inventory item ID to link this dispatch (leave blank if none)',
                          );
                          final ok = await wh.patchMaterialRequest(
                            request.id,
                            action: 'fulfill',
                            responseNote: note,
                            fulfilledItemId:
                                itemId == null || itemId.trim().isEmpty ? null : itemId.trim(),
                          );
                          if (ok && context.mounted) Navigator.pop(context);
                        },
                  label: 'Dispatch materials',
                  icon: Icons.local_shipping_rounded,
                  stretch: true,
                ),
              ],
              if (isMine && isAwaitingReceipt) ...[
                const SizedBox(height: 18),
                Text(
                  'Did you receive ${request.summaryLine}?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'If Yes, inventory stays aligned with your confirmation. If No, warehouse keepers are notified and can acknowledge or clear the flag after helping you.',
                  style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 11, height: 1.35),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _GradientButton(
                        onPressed: wh.submitting
                            ? null
                            : () async {
                                final note = await _promptNote(
                                  context,
                                  'Optional note (e.g. received in good condition)',
                                );
                                if (!context.mounted) return;
                                final ok = await wh.patchMaterialRequest(
                                  request.id,
                                  action: 'confirm_received',
                                  receivedNote: note,
                                );
                                if (ok && context.mounted) Navigator.pop(context);
                              },
                        label: 'Yes — received',
                        icon: Icons.check_circle_outline_rounded,
                        stretch: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: wh.submitting
                            ? null
                            : () async {
                                final msg = await _promptNote(
                                  context,
                                  'What is missing or wrong? (required)',
                                );
                                if (msg == null || msg.trim().isEmpty) return;
                                if (!context.mounted) return;
                                final ok = await wh.patchMaterialRequest(
                                  request.id,
                                  action: 'report_not_received',
                                  message: msg.trim(),
                                );
                                if (ok && context.mounted) Navigator.pop(context);
                              },
                        icon: const Icon(Icons.error_outline_rounded, color: Color(0xFFFF8A94)),
                        label: const Text('No — not received'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFFF8A94),
                          side: const BorderSide(color: Color(0xFFFF4757)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (isMine && isPending) ...[
                const SizedBox(height: 18),
                _GradientButton(
                  onPressed: wh.submitting
                      ? null
                      : () async {
                          final ok = await wh.patchMaterialRequest(
                            request.id,
                            action: 'cancel',
                            responseNote: 'Cancelled by requester.',
                          );
                          if (ok && context.mounted) Navigator.pop(context);
                        },
                  label: 'Cancel my request',
                  icon: Icons.cancel_outlined,
                  stretch: true,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Materials sub-tab ─────────────────────────────────────────────────────

class _WarehouseMaterialsView extends StatefulWidget {
  const _WarehouseMaterialsView({
    required this.canManage,
    required this.toolsCatalogOnly,
  });
  final bool canManage;
  /// `true` — staff tools only (tool-tagged catalog rows). `false` — consumable materials only.
  final bool toolsCatalogOnly;

  @override
  State<_WarehouseMaterialsView> createState() => _WarehouseMaterialsViewState();
}

class _WarehouseMaterialsViewState extends State<_WarehouseMaterialsView> {
  List<WarehouseMaterial> _visibleMaterials(PrivateCompanyWarehouseProvider wh) {
    if (widget.toolsCatalogOnly) {
      return wh.materials.where((m) => m.isToolTagged).toList();
    }
    return wh.materials.where((m) => !m.isToolTagged).toList();
  }

  Future<void> _pickAndImportExcel(BuildContext context) async {
    final pick = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['xlsx', 'xls', 'csv'],
      withData: true,
    );
    if (!context.mounted || pick == null || pick.files.isEmpty) return;
    final f = pick.files.single;
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    await wh.importMaterialsFromExcel(
      filePath: f.path,
      fileBytes: f.bytes,
      filename: f.name,
    );
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final l10n = AppLocalizations.of(context);
    final visible = _visibleMaterials(wh);
    final intro = widget.toolsCatalogOnly
        ? l10n.t('pc_wh_tools_catalog_intro')
        : l10n.t('pc_wh_materials_catalog_intro');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Text(
            intro,
            style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12, height: 1.35),
          ),
        ),
        if (widget.canManage)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 10,
              runSpacing: 8,
              children: [
                if (!widget.toolsCatalogOnly)
                  OutlinedButton.icon(
                    onPressed: wh.submitting ? null : () => _pickAndImportExcel(context),
                    icon: const Icon(Icons.upload_file_rounded, color: Color(0xFF38BDF8)),
                    label: Text(l10n.t('pc_wh_import_materials_only')),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withAlpha(60)),
                    ),
                  ),
                _GradientButton(
                  onPressed: () => _openEditor(context),
                  label: widget.toolsCatalogOnly
                      ? l10n.t('pc_wh_editor_add_tool')
                      : l10n.t('pc_wh_editor_material_title_new'),
                  icon: widget.toolsCatalogOnly ? Icons.handyman_rounded : Icons.add_box_rounded,
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: wh.refreshMaterials,
            color: const Color(0xFF38BDF8),
            backgroundColor: const Color(0xFF12122A),
            child: visible.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 40),
                      Center(
                        child: Icon(
                          widget.toolsCatalogOnly ? Icons.handyman_rounded : Icons.category_rounded,
                          color: Colors.white24,
                          size: 72,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: Text(
                          widget.toolsCatalogOnly
                              ? (widget.canManage
                                  ? l10n.t('pc_wh_tools_catalog_empty_manage')
                                  : l10n.t('pc_wh_tools_catalog_empty'))
                              : (widget.canManage
                                  ? l10n.t('pc_wh_materials_catalog_empty_manage')
                                  : l10n.t('pc_wh_materials_catalog_empty')),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: visible.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final m = visible[i];
                      return _MaterialRow(
                        material: m,
                        canManage: widget.canManage,
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }

  void _openEditor(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _MaterialEditorSheet(catalogToolMode: widget.toolsCatalogOnly),
    );
  }
}

class _MaterialRow extends StatelessWidget {
  const _MaterialRow({required this.material, required this.canManage});
  final WarehouseMaterial material;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    final color = _parseHex(material.color) ?? const Color(0xFF6C63FF);
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withAlpha(40),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: color.withAlpha(80)),
              ),
              alignment: Alignment.center,
              child: Icon(
                    material.isToolTagged ? Icons.handyman_rounded : Icons.category_rounded,
                    color: color,
                    size: 20,
                  ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    material.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14),
                  ),
                  const SizedBox(height: 3),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      _StaffBadge(
                        label: material.tracking == MaterialTracking.bulk
                            ? 'BULK'
                            : 'SERIAL',
                        color: color,
                      ),
                      if (material.category != null && material.category!.isNotEmpty)
                        _StaffBadge(
                            label: material.category!,
                            color: const Color(0xFF94A3B8)),
                      if (material.unit != null && material.unit!.isNotEmpty)
                        _StaffBadge(
                            label: material.unit!,
                            color: const Color(0xFF94A3B8)),
                      _StaffBadge(
                        label: '${material.itemCount} items',
                        color: const Color(0xFF38BDF8),
                      ),
                    ],
                  ),
                  if (material.description != null &&
                      material.description!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      material.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: Colors.white.withAlpha(140), fontSize: 11),
                    ),
                  ],
                ],
              ),
            ),
            if (canManage)
              PopupMenuButton<String>(
                color: const Color(0xFF12122A),
                iconColor: Colors.white60,
                onSelected: (v) async {
                  final wh = context.read<PrivateCompanyWarehouseProvider>();
                  switch (v) {
                    case 'edit':
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (_) => _MaterialEditorSheet(
                              existing: material,
                              catalogToolMode: material.isToolTagged,
                            ),
                      );
                      break;
                    case 'delete':
                      final ok = await _confirm(
                        context,
                        'Delete material?',
                        material.itemCount > 0
                            ? 'This material has ${material.itemCount} item(s). You must retire or remove them first.'
                            : 'This cannot be undone.',
                      );
                      if (ok == true) await wh.deleteMaterial(material.id);
                      break;
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'edit',
                    child: Text('Edit', style: TextStyle(color: Colors.white)),
                  ),
                  PopupMenuItem(
                    value: 'delete',
                    child:
                        Text('Delete', style: TextStyle(color: Color(0xFFFF4757))),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ─── Activity sub-tab ──────────────────────────────────────────────────────

class _WarehouseActivityView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    return RefreshIndicator(
      onRefresh: () async {
        await wh.refreshActivity();
        if (!context.mounted) return;
        final pc = context.read<PrivateCompanyProvider>();
        if (!pc.seesOnlyAssignedWarehouseInventory) {
          await wh.loadKeeperTracking();
        }
      },
      color: const Color(0xFF38BDF8),
      backgroundColor: const Color(0xFF12122A),
      child: wh.activity.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 60),
                const Center(
                  child: Icon(Icons.history_rounded,
                      color: Colors.white24, size: 72),
                ),
                const SizedBox(height: 14),
                Center(
                  child: Text(
                    'No movements recorded yet.',
                    style:
                        TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
                  ),
                ),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: wh.activity.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _MovementCard(movement: wh.activity[i]),
            ),
    );
  }
}

// ─── Shared bits used by the warehouse views ──────────────────────────────

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: color.withAlpha(40),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: color.withAlpha(80)),
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, color: color, size: 16),
                ),
                const Spacer(),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label.toUpperCase(),
              style: TextStyle(
                color: Colors.white.withAlpha(150),
                fontSize: 10,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.icon,
    this.subLabel,
    this.onTap,
  });
  final String label;
  final String? subLabel;
  final int value;
  final int maxValue;
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final pct = maxValue == 0 ? 0.0 : (value / maxValue).clamp(0.0, 1.0);
    Widget core = Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$value',
                style: TextStyle(
                    color: color, fontSize: 12, fontWeight: FontWeight.w800),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 4),
                Icon(Icons.chevron_right_rounded,
                    size: 16, color: color.withAlpha(160)),
              ],
            ],
          ),
          if (subLabel != null && subLabel!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 20, top: 2),
              child: Text(
                subLabel!,
                style:
                    TextStyle(color: Colors.white.withAlpha(120), fontSize: 10),
              ),
            ),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct.toDouble(),
              minHeight: 5,
              backgroundColor: Colors.white.withAlpha(15),
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
    if (onTap != null) {
      core = Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: core,
        ),
      );
    }
    return core;
  }
}

class _EmptyBlock extends StatelessWidget {
  const _EmptyBlock({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded,
                color: Colors.white.withAlpha(110), size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                    color: Colors.white.withAlpha(150), fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChipBadge extends StatelessWidget {
  const _FilterChipBadge({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFF38BDF8).withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF38BDF8).withAlpha(80)),
      ),
      child: Text(
        label,
        style: const TextStyle(
            color: Color(0xFFBAE6FD), fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _MovementCard extends StatelessWidget {
  const _MovementCard({required this.movement});
  final WarehouseMovement movement;

  @override
  Widget build(BuildContext context) {
    final color = _movementColor(movement.type);
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: color.withAlpha(40),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: color.withAlpha(80)),
              ),
              alignment: Alignment.center,
              child:
                  Icon(_movementIcon(movement.type), color: color, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_movementLabel(movement.type)} • ${movement.materialName ?? 'Item'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _movementSummary(movement),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: Colors.white.withAlpha(160), fontSize: 11),
                  ),
                  if (movement.note != null && movement.note!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '“${movement.note!}”',
                        style: TextStyle(
                            color: Colors.white.withAlpha(120), fontSize: 11),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _shortTimeAgo(movement.createdAt),
              style:
                  TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

String _movementSummary(WarehouseMovement m) {
  final parts = <String>[];
  if (m.itemSerial != null) parts.add('SN ${m.itemSerial}');
  if (m.fromStaffName != null) parts.add('from ${m.fromStaffName}');
  if (m.toStaffName != null) parts.add('to ${m.toStaffName}');
  if (m.ticketSiteName != null) parts.add('ticket ${m.ticketSiteName}');
  if (m.actorName != null) parts.add('by ${m.actorName}');
  return parts.join(' · ');
}

String _shortTimeAgo(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${(diff.inDays / 7).floor()}w';
}

Color _statusColor(MaterialItemStatus s) {
  switch (s) {
    case MaterialItemStatus.inWarehouse:
      return const Color(0xFF6C63FF);
    case MaterialItemStatus.assigned:
      return const Color(0xFFFFA53A);
    case MaterialItemStatus.used:
      return const Color(0xFF00D4AA);
    case MaterialItemStatus.damaged:
      return const Color(0xFFFF4757);
    case MaterialItemStatus.lost:
      return const Color(0xFF94A3B8);
    case MaterialItemStatus.retired:
      return const Color(0xFF64748B);
  }
}

IconData _statusIcon(MaterialItemStatus s) {
  switch (s) {
    case MaterialItemStatus.inWarehouse:
      return Icons.warehouse_rounded;
    case MaterialItemStatus.assigned:
      return Icons.person_pin_circle_rounded;
    case MaterialItemStatus.used:
      return Icons.task_alt_rounded;
    case MaterialItemStatus.damaged:
      return Icons.report_problem_rounded;
    case MaterialItemStatus.lost:
      return Icons.help_outline_rounded;
    case MaterialItemStatus.retired:
      return Icons.archive_rounded;
  }
}

Color _movementColor(String type) {
  switch (type) {
    case 'STOCKED':
      return const Color(0xFF38BDF8);
    case 'ASSIGNED':
    case 'TRANSFERRED':
      return const Color(0xFFFFA53A);
    case 'RETURNED':
      return const Color(0xFF6C63FF);
    case 'USED':
      return const Color(0xFF00D4AA);
    case 'DAMAGED':
      return const Color(0xFFFF4757);
    case 'LOST':
      return const Color(0xFF94A3B8);
    case 'HANDOVER_CONFIRMED':
      return const Color(0xFF22C55E);
    case 'HANDOVER_REJECTED':
    case 'RETURN_REJECTED':
      return const Color(0xFFFF4757);
    case 'RETURN_REQUESTED':
      return const Color(0xFF38BDF8);
    case 'ADJUSTED':
    default:
      return const Color(0xFF8B83FF);
  }
}

IconData _movementIcon(String type) {
  switch (type) {
    case 'STOCKED':
      return Icons.inventory_2_rounded;
    case 'ASSIGNED':
      return Icons.person_add_alt_1_rounded;
    case 'TRANSFERRED':
      return Icons.swap_horiz_rounded;
    case 'RETURNED':
      return Icons.assignment_return_rounded;
    case 'USED':
      return Icons.task_alt_rounded;
    case 'DAMAGED':
      return Icons.report_problem_rounded;
    case 'LOST':
      return Icons.help_outline_rounded;
    case 'HANDOVER_CONFIRMED':
      return Icons.how_to_reg_rounded;
    case 'HANDOVER_REJECTED':
      return Icons.block_rounded;
    case 'RETURN_REQUESTED':
      return Icons.outbound_rounded;
    case 'RETURN_REJECTED':
      return Icons.cancel_outlined;
    case 'ADJUSTED':
    default:
      return Icons.tune_rounded;
  }
}

String _movementLabel(String type) {
  switch (type) {
    case 'STOCKED':
      return 'Stocked';
    case 'ASSIGNED':
      return 'Assigned';
    case 'TRANSFERRED':
      return 'Transferred';
    case 'RETURNED':
      return 'Returned';
    case 'USED':
      return 'Used on ticket';
    case 'DAMAGED':
      return 'Damaged';
    case 'LOST':
      return 'Lost';
    case 'HANDOVER_CONFIRMED':
      return 'Assignee confirmed receipt';
    case 'HANDOVER_REJECTED':
      return 'Assignment rejected';
    case 'RETURN_REQUESTED':
      return 'Return requested';
    case 'RETURN_REJECTED':
      return 'Return rejected';
    case 'ADJUSTED':
    default:
      return 'Adjusted';
  }
}

Color? _parseHex(String? input) {
  if (input == null) return null;
  var s = input.trim();
  if (s.isEmpty) return null;
  if (s.startsWith('#')) s = s.substring(1);
  if (s.length == 6) s = 'FF$s';
  if (s.length != 8) return null;
  final v = int.tryParse(s, radix: 16);
  if (v == null) return null;
  return Color(v);
}

Future<bool?> _confirm(BuildContext context, String title, String body) {
  return showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: Text(title, style: const TextStyle(color: Colors.white)),
      content: Text(body, style: TextStyle(color: Colors.white.withAlpha(180))),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Confirm',
              style: TextStyle(color: Color(0xFFFF4757))),
        ),
      ],
    ),
  );
}

// ─── Sheets: Material editor / Stock items / Item actions / Filters ───────

class _MaterialEditorSheet extends StatefulWidget {
  const _MaterialEditorSheet({
    this.existing,
    this.catalogToolMode = false,
  });
  final WarehouseMaterial? existing;
  /// Staff tools catalog: category fixed to `Tools`, serial tracking only.
  final bool catalogToolMode;

  @override
  State<_MaterialEditorSheet> createState() => _MaterialEditorSheetState();
}

class _MaterialEditorSheetState extends State<_MaterialEditorSheet> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _category = TextEditingController();
  final _unit = TextEditingController();
  MaterialTracking _tracking = MaterialTracking.serial;

  static const String _toolCategoryValue = 'Tools';

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _name.text = e.name;
      _description.text = e.description ?? '';
      _category.text = e.category ?? '';
      _unit.text = e.unit ?? '';
      _tracking = e.tracking;
    } else if (widget.catalogToolMode) {
      _category.text = _toolCategoryValue;
      _tracking = MaterialTracking.serial;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _category.dispose();
    _unit.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final tool = widget.catalogToolMode;
    final categoryOut = tool ? _toolCategoryValue : _category.text.trim();
    final trackingOut =
        tool ? materialTrackingApi(MaterialTracking.serial) : materialTrackingApi(_tracking);
    final ok = widget.existing == null
        ? await wh.createMaterial(
            name: name,
            description: _description.text,
            category: categoryOut,
            unit: _unit.text,
            tracking: trackingOut,
          )
        : await wh.updateMaterial(
            widget.existing!.id,
            name: name,
            description: _description.text,
            category: categoryOut,
            unit: _unit.text,
            tracking: trackingOut,
          );
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final l10n = AppLocalizations.of(context);
    final isEdit = widget.existing != null;
    final tool = widget.catalogToolMode;
    final title = tool
        ? (isEdit
            ? l10n.t('pc_wh_editor_tool_title_edit')
            : l10n.t('pc_wh_editor_tool_title_new'))
        : (isEdit
            ? l10n.t('pc_wh_editor_material_title_edit')
            : l10n.t('pc_wh_editor_material_title_new'));
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(context, title),
                const SizedBox(height: 18),
                _DarkField(
                  controller: _name,
                  label: 'Name *',
                  hint: tool ? l10n.t('pc_wh_editor_tool_name_hint') : 'Cat6 Cable',
                  icon: tool ? Icons.handyman_rounded : Icons.category_rounded,
                ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: _description,
                  label: l10n.t('pc_ws_description'),
                  hint: 'Optional notes for your team',
                  icon: Icons.notes_rounded,
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                if (tool) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF12122A),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withAlpha(24)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.label_outline_rounded, color: Color(0xFF00D4AA), size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.t('pc_wh_editor_catalog_kind'),
                                style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
                              ),
                              Text(
                                l10n.t('pc_wh_editor_tool_category_locked'),
                                style: const TextStyle(
                                    color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _DarkField(
                    controller: _unit,
                    label: 'Unit (optional)',
                    hint: 'pcs / ea',
                    icon: Icons.straighten_rounded,
                  ),
                ] else ...[
                  Row(
                    children: [
                      Expanded(
                        child: _DarkField(
                          controller: _category,
                          label: 'Category',
                          hint: 'Cable, parts, …',
                          icon: Icons.label_outline_rounded,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DarkField(
                          controller: _unit,
                          label: 'Unit',
                          hint: 'pcs / m / kg',
                          icon: Icons.straighten_rounded,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                const _SectionTitle('Tracking *'),
                const SizedBox(height: 8),
                if (tool)
                  _ChipBox(
                    label: 'Serial-numbered',
                    selected: true,
                    color: const Color(0xFF38BDF8),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      GestureDetector(
                        onTap: () =>
                            setState(() => _tracking = MaterialTracking.serial),
                        child: _ChipBox(
                          label: 'Serial-numbered',
                          selected: _tracking == MaterialTracking.serial,
                          color: const Color(0xFF38BDF8),
                        ),
                      ),
                      GestureDetector(
                        onTap: () =>
                            setState(() => _tracking = MaterialTracking.bulk),
                        child: _ChipBox(
                          label: 'Bulk (by quantity)',
                          selected: _tracking == MaterialTracking.bulk,
                          color: const Color(0xFFFFA53A),
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 6),
                Text(
                  tool
                      ? l10n.t('pc_wh_editor_tool_tracking_note')
                      : (_tracking == MaterialTracking.serial
                          ? 'Each unit has a unique serial. You will type or scan a serial per item.'
                          : 'Tracked by quantity only — useful for cable on a reel, screws, etc.'),
                  style: TextStyle(
                      color: Colors.white.withAlpha(140), fontSize: 11.5),
                ),
                const SizedBox(height: 22),
                _GradientButton(
                  onPressed: wh.submitting ? null : _submit,
                  label: wh.submitting
                      ? 'Saving…'
                      : (isEdit
                          ? (tool
                              ? l10n.t('pc_wh_editor_save_tool')
                              : 'Save changes')
                          : (tool
                              ? l10n.t('pc_wh_editor_add_tool')
                              : 'Add material')),
                  icon: Icons.save_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StockItemsSheet extends StatefulWidget {
  const _StockItemsSheet();

  @override
  State<_StockItemsSheet> createState() => _StockItemsSheetState();
}

class _StockItemsSheetState extends State<_StockItemsSheet> {
  final _serialsCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _quantityCtrl = TextEditingController(text: '1');
  String? _materialId;
  String? _province;

  @override
  void dispose() {
    _serialsCtrl.dispose();
    _notesCtrl.dispose();
    _quantityCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    if (_materialId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Pick a material first.'),
        backgroundColor: Color(0xFFFF4757),
      ));
      return;
    }
    if (_province == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Pick a province.'),
        backgroundColor: Color(0xFFFF4757),
      ));
      return;
    }
    final material = wh.materials.firstWhere((m) => m.id == _materialId);
    final isBulk = material.tracking == MaterialTracking.bulk;
    final rawSerials = _serialsCtrl.text;
    final serials = rawSerials
        .split(RegExp(r'[\r\n,]+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (!isBulk && serials.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Enter at least one serial number. One per line, or comma-separated.'),
        backgroundColor: Color(0xFFFF4757),
      ));
      return;
    }
    final qty = int.tryParse(_quantityCtrl.text.trim()) ?? 1;
    final created = await wh.stockItems(
      materialId: _materialId!,
      province: _province!,
      serialNumbers: serials,
      quantity: isBulk ? qty : null,
      notes: _notesCtrl.text,
    );
    if (created != null && created > 0 && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final selectedMaterial = _materialId == null
        ? null
        : wh.materials.cast<WarehouseMaterial?>().firstWhere(
              (m) => m?.id == _materialId,
              orElse: () => null,
            );
    final isBulk = selectedMaterial?.tracking == MaterialTracking.bulk;
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(context, 'Stock items'),
                const SizedBox(height: 18),
                const _SectionTitle('Material *'),
                const SizedBox(height: 8),
                if (wh.materials.isEmpty)
                  Text(
                    'No materials yet. Open the “Materials” tab to add one.',
                    style: TextStyle(
                        color: Colors.white.withAlpha(160), fontSize: 12),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: wh.materials.map((m) {
                      final selected = m.id == _materialId;
                      return GestureDetector(
                        onTap: () => setState(() => _materialId = m.id),
                        child: _ChipBox(
                          label: m.name,
                          selected: selected,
                          color: _parseHex(m.color) ?? const Color(0xFF6C63FF),
                        ),
                      );
                    }).toList(),
                  ),
                const SizedBox(height: 14),
                const _SectionTitle('Province *'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kIraqProvinces.map((p) {
                    final selected = _province == p;
                    return GestureDetector(
                      onTap: () => setState(() => _province = p),
                      child: _ChipBox(
                        label: p,
                        selected: selected,
                        color: const Color(0xFF38BDF8),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                if (isBulk)
                  Row(
                    children: [
                      Expanded(
                        child: _DarkField(
                          controller: _quantityCtrl,
                          label: 'Quantity',
                          hint: '1',
                          icon: Icons.numbers_rounded,
                          keyboardType: TextInputType.number,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DarkField(
                          controller: _serialsCtrl,
                          label: 'Lot / SKU (optional)',
                          hint: 'auto-generated if empty',
                          icon: Icons.qr_code_2_rounded,
                        ),
                      ),
                    ],
                  )
                else
                  _DarkField(
                    controller: _serialsCtrl,
                    label: 'Serial numbers *',
                    hint: 'One per line, or comma-separated',
                    icon: Icons.qr_code_2_rounded,
                    maxLines: 4,
                  ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: _notesCtrl,
                  label: 'Notes',
                  hint: 'e.g. received from supplier #123',
                  icon: Icons.notes_rounded,
                  maxLines: 2,
                ),
                const SizedBox(height: 22),
                _GradientButton(
                  onPressed: wh.submitting ? null : _submit,
                  label: wh.submitting ? 'Saving…' : 'Add to stock',
                  icon: Icons.inventory_2_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InventoryFiltersSheet extends StatefulWidget {
  const _InventoryFiltersSheet();

  @override
  State<_InventoryFiltersSheet> createState() => _InventoryFiltersSheetState();
}

class _InventoryFiltersSheetState extends State<_InventoryFiltersSheet> {
  String? _province;
  String? _status;
  String? _materialId;
  bool _mineOnly = false;
  String _materialSearch = '';

  @override
  void initState() {
    super.initState();
    final wh = context.read<PrivateCompanyWarehouseProvider>();
    _province = wh.filterProvince;
    _status = wh.filterStatus;
    _materialId = wh.filterMaterialId;
    _mineOnly = wh.mineOnly;
  }

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _modalSheetTitleRow(context, 'Filter items'),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Switch(
                      value: _mineOnly,
                      activeThumbColor: const Color(0xFF6C63FF),
                      onChanged: (v) => setState(() => _mineOnly = v),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'Show only items currently assigned to me',
                        style: TextStyle(
                            color: Colors.white.withAlpha(200), fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const _SectionTitle('Status'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: MaterialItemStatus.values.map((s) {
                    final code = materialItemStatusApi(s);
                    final selected = _status == code;
                    return GestureDetector(
                      onTap: () =>
                          setState(() => _status = selected ? null : code),
                      child: _ChipBox(
                        label: materialItemStatusLabel(s),
                        selected: selected,
                        color: _statusColor(s),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                const _SectionTitle('Province'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kIraqProvinces.map((p) {
                    final selected = _province == p;
                    return GestureDetector(
                      onTap: () =>
                          setState(() => _province = selected ? null : p),
                      child: _ChipBox(
                        label: p,
                        selected: selected,
                        color: const Color(0xFF38BDF8),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                const _SectionTitle('Material'),
                const SizedBox(height: 8),
                TextField(
                  onChanged: (v) => setState(() => _materialSearch = v),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Search materials…',
                    hintStyle:
                        TextStyle(color: Colors.white.withAlpha(80), fontSize: 13),
                    prefixIcon: const Icon(Icons.search_rounded,
                        color: Color(0xFF8B83FF), size: 18),
                    filled: true,
                    fillColor: const Color(0xFF12122A),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _materialId = null),
                      child: _ChipBox(
                        label: 'Any',
                        selected: _materialId == null,
                        color: const Color(0xFF6B7280),
                      ),
                    ),
                    ...() {
                      final q = _materialSearch.trim().toLowerCase();
                      final mats = q.isEmpty
                          ? wh.materials
                          : wh.materials
                              .where((m) => m.name.toLowerCase().contains(q))
                              .toList();
                      return mats.map((m) {
                        final selected = _materialId == m.id;
                        return GestureDetector(
                          onTap: () => setState(() => _materialId = m.id),
                          child: _ChipBox(
                            label: m.name,
                            selected: selected,
                            color: _parseHex(m.color) ??
                                const Color(0xFF6C63FF),
                          ),
                        );
                      }).toList();
                    }(),
                  ],
                ),
                const SizedBox(height: 22),
                _GradientButton(
                  onPressed: wh.submitting
                      ? null
                      : () {
                          wh.setFilters(
                            province: _province,
                            status: _status,
                            materialId: _materialId,
                            mineOnly: _mineOnly,
                          );
                          wh.refreshItems();
                          Navigator.pop(context);
                        },
                  label: 'Apply filters',
                  icon: Icons.filter_alt_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ItemActionsSheet extends StatelessWidget {
  const _ItemActionsSheet({
    required this.item,
    required this.keeperManage,
    required this.anchorContext,
  });
  final WarehouseItem item;
  final bool keeperManage;
  final BuildContext anchorContext;

  @override
  Widget build(BuildContext context) {
    final wh = context.watch<PrivateCompanyWarehouseProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final uid = context.watch<AuthProvider>().user?.id;
    final isAssigneeSelf = uid != null &&
        item.assignedToId == uid &&
        item.handoverPending &&
        item.status == MaterialItemStatus.assigned;
    final isHolder = item.assignedToId != null &&
        pc.workspace?.staff.any((s) => s.id == item.assignedToId) == true;
    final toolRow = item.isToolTagged;
    final mgrAssign = pc.canAssignWarehouseToolsToStaff;
    final canAssignFromStock = item.status == MaterialItemStatus.inWarehouse &&
        (keeperManage || (mgrAssign && toolRow));
    final canKeeperReassign = keeperManage &&
        item.status == MaterialItemStatus.assigned;
    final canPeerTransfer = pc.canPeerTransferWarehouseTool &&
        uid != null &&
        item.assignedToId == uid &&
        item.handoverConfirmedAt != null &&
        !item.returnPending &&
        item.status == MaterialItemStatus.assigned &&
        toolRow;
    final canAssign =
        canAssignFromStock || canKeeperReassign || canPeerTransfer;
    final canReturn = item.status == MaterialItemStatus.assigned;
    final canUse = item.status == MaterialItemStatus.assigned ||
        (keeperManage && item.status == MaterialItemStatus.inWarehouse);
    final canFieldReportDamagedOrLost = uid != null &&
        item.assignedToId == uid &&
        item.status == MaterialItemStatus.assigned &&
        pc.canRecordWarehouseMaterialOnTicket &&
        !keeperManage;
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _modalSheetTitleRow(context, item.materialName ?? 'Item'),
              const SizedBox(height: 4),
              Text(
                'SN: ${item.serialNumber}',
                style:
                    TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
              ),
              if (item.quantity > 1) ...[
                const SizedBox(height: 4),
                Text(
                  'Quantity on this line: ${item.quantity}${item.materialUnit != null && item.materialUnit!.trim().isNotEmpty ? ' ${item.materialUnit}' : ''}',
                  style: TextStyle(
                    color: const Color(0xFF00D4AA).withAlpha(220),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _StaffBadge(
                    label: materialItemStatusLabel(item.status),
                    color: _statusColor(item.status),
                  ),
                  if (item.province.isNotEmpty)
                    _StaffBadge(
                      label: item.province,
                      color: const Color(0xFF38BDF8),
                    ),
                  if (item.assignedToName != null)
                    _StaffBadge(
                      label: 'Held by ${item.assignedToName!}',
                      color: const Color(0xFFFFA53A),
                    ),
                  if (item.usedTicketSiteName != null)
                    _StaffBadge(
                      label: 'Used on ${item.usedTicketSiteName!}',
                      color: const Color(0xFF00D4AA),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              if (isAssigneeSelf) ...[
                _ActionTile(
                  icon: Icons.how_to_reg_rounded,
                  label: 'I received this — confirm handover',
                  color: const Color(0xFF22C55E),
                  onTap: () async {
                    Navigator.pop(context);
                    final note = await _promptNote(
                      anchorContext,
                      'Optional note (e.g. received complete)',
                    );
                    if (!anchorContext.mounted) return;
                    final success = await wh.confirmAssigneeHandover(
                      item.id,
                      note: note,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          success
                              ? (wh.lastSuccess ?? 'Confirmed.')
                              : (wh.error ?? 'Could not confirm.'),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
                _ActionTile(
                  icon: Icons.block_rounded,
                  label: 'Reject assignment (reason required)',
                  color: const Color(0xFFFF4757),
                  onTap: () async {
                    Navigator.pop(context);
                    final reason = await _promptRequiredReason(
                      anchorContext,
                      'Why are you rejecting this assignment?',
                    );
                    if (reason == null || !anchorContext.mounted) return;
                    final success = await wh.rejectAssigneeHandover(
                      item.id,
                      rejectionReason: reason,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          success
                              ? (wh.lastSuccess ?? 'Rejected.')
                              : (wh.error ?? 'Could not reject.'),
                        ),
                      ),
                    );
                  },
                ),
              ],
              if (isAssigneeSelf && item.returnPending) ...[
                const SizedBox(height: 10),
                _ActionTile(
                  icon: Icons.assignment_return_rounded,
                  label: 'Approve warehouse return request',
                  color: const Color(0xFF6C63FF),
                  onTap: () async {
                    Navigator.pop(context);
                    final label =
                        '${item.materialName ?? 'Item'} — SN ${item.serialNumber}';
                    final pair = await _promptReturnToWarehouse(anchorContext, label);
                    if (pair == null || pair.length < 2) return;
                    if (!anchorContext.mounted) return;
                    final ok = await wh.approveReturnRequest(
                      item.id,
                      returnCondition: pair[0],
                      note: pair[1],
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok
                              ? (wh.lastSuccess ?? 'Returned.')
                              : (wh.error ?? 'Return failed.'),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
                _ActionTile(
                  icon: Icons.cancel_outlined,
                  label: 'Reject return request (reason required)',
                  color: const Color(0xFFFF4757),
                  onTap: () async {
                    Navigator.pop(context);
                    final reason = await _promptRequiredReason(
                      anchorContext,
                      'Why can you not return this now?',
                    );
                    if (reason == null || !anchorContext.mounted) return;
                    final ok = await wh.rejectReturnRequest(
                      item.id,
                      rejectionReason: reason,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok
                              ? (wh.lastSuccess ?? 'Return request rejected.')
                              : (wh.error ?? 'Failed.'),
                        ),
                      ),
                    );
                  },
                ),
              ],
              if (isAssigneeSelf) const SizedBox(height: 10),
              if (canAssign)
                _ActionTile(
                  icon: Icons.person_add_alt_1_rounded,
                  label: isHolder ? 'Transfer to another staff' : 'Assign to staff',
                  color: const Color(0xFFFFA53A),
                  onTap: () async {
                    Navigator.pop(context);
                    final moveQty =
                        await _promptWarehouseMoveQuantity(anchorContext, item);
                    if (moveQty == null) return;
                    if (!anchorContext.mounted) return;
                    final staffId = await _pickStaff(
                      anchorContext,
                      currentHolderId: item.assignedToId,
                      useApiSearch: keeperManage || pc.canAssignWarehouseToolsToStaff,
                    );
                    if (staffId == null) return;
                    if (!anchorContext.mounted) return;
                    if (isHolder) {
                      await wh.transferItem(item.id, staffId,
                          quantity: item.quantity > 1 ? moveQty : null);
                    } else {
                      await wh.assignItem(item.id, staffId,
                          quantity: item.quantity > 1 ? moveQty : null);
                    }
                  },
                ),
              if (keeperManage &&
                  item.status == MaterialItemStatus.assigned &&
                  item.handoverConfirmedAt != null &&
                  !item.returnPending &&
                  item.assignedToId != null)
                _ActionTile(
                  icon: Icons.outbound_rounded,
                  label: 'Request return from assignee',
                  color: const Color(0xFF38BDF8),
                  onTap: () async {
                    Navigator.pop(context);
                    final note = await _promptNote(
                      anchorContext,
                      'Optional note for the assignee',
                    );
                    if (!anchorContext.mounted) return;
                    final ok = await wh.requestReturnFromAssignee(
                      item.id,
                      note: note,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok
                              ? (wh.lastSuccess ?? 'Request sent.')
                              : (wh.error ?? 'Request failed.'),
                        ),
                      ),
                    );
                  },
                ),
              if (canReturn &&
                  (!keeperManage || item.assignedToId == uid) &&
                  !item.returnPending)
                _ActionTile(
                  icon: Icons.assignment_return_rounded,
                  label: 'Return to warehouse',
                  color: const Color(0xFF6C63FF),
                  onTap: () async {
                    Navigator.pop(context);
                    final label =
                        '${item.materialName ?? 'Item'} — SN ${item.serialNumber} ×${item.quantity}';
                    final pair = await _promptReturnToWarehouse(anchorContext, label);
                    if (pair == null || pair.length < 2) return;
                    if (!anchorContext.mounted) return;
                    final ok = await wh.returnItem(
                      item.id,
                      returnCondition: pair[0],
                      note: pair[1],
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok
                              ? (wh.lastSuccess ?? 'Returned.')
                              : (wh.error ?? 'Return failed.'),
                        ),
                      ),
                    );
                  },
                ),
              if (canUse)
                _ActionTile(
                  icon: Icons.task_alt_rounded,
                  label: 'Record use on a ticket',
                  color: const Color(0xFF00D4AA),
                  onTap: () async {
                    Navigator.pop(context);
                    final res = await _pickTicket(anchorContext);
                    if (res == null) return;
                    int? useQty;
                    if (item.supportsPartialConsumption && item.quantity > 1) {
                      useQty = await _promptWarehouseMoveQuantity(
                        anchorContext,
                        item,
                        title: 'Quantity to use on ticket',
                        helperPrefix: 'This line has',
                      );
                      if (useQty == null) return;
                    }
                    if (!anchorContext.mounted) return;
                    final ok = await wh.useOnTicket(
                      item.id,
                      res.$1,
                      note: res.$2,
                      quantity: useQty,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          ok
                              ? (wh.lastSuccess ?? 'Recorded on ticket.')
                              : (wh.error ?? 'Could not record use.'),
                        ),
                      ),
                    );
                  },
                ),
              if (canFieldReportDamagedOrLost) ...[
                _ActionTile(
                  icon: Icons.report_problem_rounded,
                  label: 'Report damaged (my stock)',
                  color: const Color(0xFFFF4757),
                  onTap: () async {
                    final ok = await _confirm(
                      anchorContext,
                      'Report this unit as damaged?',
                      'It will leave your active stock. You can add notes and optionally link a ticket next.',
                    );
                    if (ok != true) return;
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    final note = await _promptNote(
                      anchorContext,
                      'Damaged — note (optional)',
                    );
                    if (note == null || !anchorContext.mounted) return;
                    final pick =
                        await _promptOptionalTicketForMaterial(anchorContext);
                    if (pick == null || pick.cancelled || !anchorContext.mounted) {
                      return;
                    }
                    final success = await wh.markDamaged(
                      item.id,
                      note: note.isEmpty ? null : note,
                      ticketId: pick.ticketId,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          success
                              ? (wh.lastSuccess ?? 'Marked as damaged.')
                              : (wh.error ?? 'Could not update this item.'),
                        ),
                      ),
                    );
                  },
                ),
                _ActionTile(
                  icon: Icons.help_outline_rounded,
                  label: 'Report lost (my stock)',
                  color: const Color(0xFF94A3B8),
                  onTap: () async {
                    final ok = await _confirm(
                      anchorContext,
                      'Report this unit as lost?',
                      'This records a loss. You can add notes and optionally link a ticket next.',
                    );
                    if (ok != true) return;
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    final note = await _promptNote(
                      anchorContext,
                      'Lost — note (optional)',
                    );
                    if (note == null || !anchorContext.mounted) return;
                    final pick =
                        await _promptOptionalTicketForMaterial(anchorContext);
                    if (pick == null || pick.cancelled || !anchorContext.mounted) {
                      return;
                    }
                    final success = await wh.markLost(
                      item.id,
                      note: note.isEmpty ? null : note,
                      ticketId: pick.ticketId,
                    );
                    if (!anchorContext.mounted) return;
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(
                        content: Text(
                          success
                              ? (wh.lastSuccess ?? 'Marked as lost.')
                              : (wh.error ?? 'Could not update this item.'),
                        ),
                      ),
                    );
                  },
                ),
              ],
              if (keeperManage) ...[
                _ActionTile(
                  icon: Icons.report_problem_rounded,
                  label: 'Mark as damaged',
                  color: const Color(0xFFFF4757),
                  onTap: () async {
                    final ok = await _confirm(
                      anchorContext,
                      'Mark this unit as damaged?',
                      'It will leave active inventory. You can add an optional note next.',
                    );
                    if (ok != true) return;
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    final note =
                        await _promptNote(anchorContext, 'Damaged — note (optional)');
                    if (!anchorContext.mounted) return;
                    final success = await wh.markDamaged(item.id, note: note);
                    if (!anchorContext.mounted) return;
                    final msg = success
                        ? (wh.lastSuccess ?? 'Marked as damaged.')
                        : (wh.error ?? 'Could not update this item.');
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(content: Text(msg)),
                    );
                  },
                ),
                _ActionTile(
                  icon: Icons.help_outline_rounded,
                  label: 'Mark as lost',
                  color: const Color(0xFF94A3B8),
                  onTap: () async {
                    final ok = await _confirm(
                      anchorContext,
                      'Mark this unit as lost?',
                      'This records a loss in the warehouse log. You can add an optional note next.',
                    );
                    if (ok != true) return;
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    final note =
                        await _promptNote(anchorContext, 'Lost — note (optional)');
                    if (!anchorContext.mounted) return;
                    final success = await wh.markLost(item.id, note: note);
                    if (!anchorContext.mounted) return;
                    final msg = success
                        ? (wh.lastSuccess ?? 'Marked as lost.')
                        : (wh.error ?? 'Could not update this item.');
                    ScaffoldMessenger.of(anchorContext).showSnackBar(
                      SnackBar(content: Text(msg)),
                    );
                  },
                ),
                _ActionTile(
                  icon: Icons.delete_outline_rounded,
                  label: 'Delete / Retire',
                  color: const Color(0xFFFF4757),
                  onTap: () async {
                    Navigator.pop(context);
                    final ok = await _confirm(context, 'Remove item?',
                        'If it has been used on a ticket it will be retired so the audit trail is preserved.');
                    if (ok == true) await wh.deleteItem(item.id);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withAlpha(60)),
          ),
          child: Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700),
                ),
              ),
              Icon(Icons.arrow_forward_ios_rounded,
                  color: color, size: 14),
            ],
          ),
        ),
      ),
    );
  }
}

class _StaffPickSearchSheet extends StatefulWidget {
  const _StaffPickSearchSheet({this.currentHolderId});
  final String? currentHolderId;

  @override
  State<_StaffPickSearchSheet> createState() => _StaffPickSearchSheetState();
}

class _StaffPickSearchSheetState extends State<_StaffPickSearchSheet> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<WarehouseStaffSearchResult> _results = [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _scheduleSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _loading = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      if (!mounted) return;
      setState(() => _loading = true);
      final wh = context.read<PrivateCompanyWarehouseProvider>();
      final list = await wh.searchStaff(q);
      if (!mounted) return;
      setState(() {
        _results = list;
        _loading = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 18,
            bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Find staff',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'Type at least 2 characters (name, username, or phone).',
                style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _ctrl,
                autofocus: true,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search…',
                  hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
                  prefixIcon:
                      const Icon(Icons.search_rounded, color: Color(0xFF8B83FF)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: _scheduleSearch,
              ),
              const SizedBox(height: 12),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: CircularProgressIndicator(
                      color: Color(0xFF6C63FF),
                      strokeWidth: 2,
                    ),
                  ),
                )
              else
                SizedBox(
                  height: math.min(360, h * 0.42),
                  child: _ctrl.text.trim().length < 2
                      ? Center(
                          child: Text(
                            'Keep typing…',
                            style: TextStyle(
                                color: Colors.white.withAlpha(120), fontSize: 13),
                          ),
                        )
                      : _results.isEmpty
                          ? Center(
                              child: Text(
                                'No matches for that search.',
                                style: TextStyle(
                                    color: Colors.white.withAlpha(160),
                                    fontSize: 13),
                              ),
                            )
                          : ListView.separated(
                              itemCount: _results.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 6),
                              itemBuilder: (_, i) {
                                final s = _results[i];
                                final blocked = s.id == widget.currentHolderId;
                                final label =
                                    s.name?.trim().isNotEmpty == true ? s.name! : s.username;
                                return InkWell(
                                  onTap: blocked
                                      ? null
                                      : () => Navigator.pop(context, s.id),
                                  borderRadius: BorderRadius.circular(12),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF12122A),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: blocked
                                            ? const Color(0xFFFFA53A).withAlpha(80)
                                            : Colors.white10,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        CircleAvatar(
                                          radius: 14,
                                          backgroundColor:
                                              const Color(0xFF6C63FF).withAlpha(60),
                                          child: Text(
                                            label.isNotEmpty
                                                ? label.substring(0, 1).toUpperCase()
                                                : '?',
                                            style: const TextStyle(
                                              color: Color(0xFF8B83FF),
                                              fontWeight: FontWeight.w800,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                label,
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              Text(
                                                [
                                                  s.username,
                                                  s.phone,
                                                  if (s.role != null) s.role!,
                                                  if (s.isOwner) 'Owner',
                                                ].join(' · '),
                                                style: TextStyle(
                                                  color: Colors.white.withAlpha(150),
                                                  fontSize: 11,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        if (blocked)
                                          const Icon(Icons.check_circle_rounded,
                                              color: Color(0xFFFFA53A), size: 16),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// How many units to assign/transfer/use when the inventory line has quantity > 1.
Future<int?> _promptWarehouseMoveQuantity(
  BuildContext context,
  WarehouseItem item, {
  String title = 'Quantity to assign',
  String helperPrefix = 'Enter how many to move to the selected staff',
}) async {
  if (item.quantity <= 1) return 1;
  final ctrl = TextEditingController(text: '${item.quantity}');
  final unit =
      item.materialUnit != null && item.materialUnit!.trim().isNotEmpty
          ? ' ${item.materialUnit!.trim()}'
          : '';
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(
        title,
        style: const TextStyle(
            color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$helperPrefix (1–${item.quantity}$unit). This line has ${item.quantity}$unit.',
            style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 13),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: ctrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Quantity',
              labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.white.withAlpha(40)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF6C63FF)),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text('Cancel', style: TextStyle(color: Colors.white.withAlpha(120))),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF6C63FF),
          ),
          child: const Text('Continue'),
        ),
      ],
    ),
  );
  if (ok != true) return null;
  final n = int.tryParse(ctrl.text.trim());
  if (n == null || n < 1 || n > item.quantity) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Enter a whole number from 1 to ${item.quantity}.'),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
    return null;
  }
  return n;
}

Future<String?> _pickStaff(
  BuildContext context, {
  String? currentHolderId,
  bool useApiSearch = false,
}) async {
  if (useApiSearch) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _StaffPickSearchSheet(currentHolderId: currentHolderId),
    );
  }

  final pc = context.read<PrivateCompanyProvider>();
  final staff = pc.workspace?.staff ?? const [];
  if (staff.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('No staff available in this workspace.'),
    ));
    return null;
  }
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0A0A1F),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Choose a staff member',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              for (final s in staff)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: InkWell(
                    onTap: s.id == currentHolderId
                        ? null
                        : () => Navigator.pop(context, s.id),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF12122A),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: s.id == currentHolderId
                                ? const Color(0xFFFFA53A).withAlpha(80)
                                : Colors.white10),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: const Color(0xFF6C63FF).withAlpha(60),
                            child: Text(
                              (s.name?.isNotEmpty == true
                                      ? s.name!.substring(0, 1)
                                      : s.username.substring(0, 1))
                                  .toUpperCase(),
                              style: const TextStyle(
                                  color: Color(0xFF8B83FF),
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  s.name?.isNotEmpty == true
                                      ? s.name!
                                      : s.username,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                                Text(
                                  [
                                    s.role,
                                    if (s.specialization != null)
                                      s.specialization!,
                                    if (s.province != null) s.province!,
                                  ].join(' • '),
                                  style: TextStyle(
                                      color: Colors.white.withAlpha(150),
                                      fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                          if (s.id == currentHolderId)
                            const Padding(
                              padding: EdgeInsets.only(left: 8),
                              child: Icon(Icons.check_circle_rounded,
                                  color: Color(0xFFFFA53A), size: 16),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

Future<(String, String?)?> _pickTicket(BuildContext context) async {
  // Lightweight ticket-id input — the full ticket picker would require a
  // tickets list fetch which is outside the warehouse provider's scope. The
  // user can paste / type a ticket id (or the share-code). Keeps the
  // dependency surface small while still being functional.
  final idCtrl = TextEditingController();
  final noteCtrl = TextEditingController();
  return showModalBottomSheet<(String, String?)>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A1F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Record on ticket',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  'Paste the ticket ID this item was used on. The system will verify it belongs to your workspace.',
                  style: TextStyle(
                      color: Colors.white.withAlpha(150), fontSize: 12),
                ),
                const SizedBox(height: 14),
                _DarkField(
                  controller: idCtrl,
                  label: 'Ticket ID *',
                  hint: 'cuid…',
                  icon: Icons.confirmation_number_rounded,
                ),
                const SizedBox(height: 12),
                _DarkField(
                  controller: noteCtrl,
                  label: 'Note',
                  hint: 'e.g. installed during maintenance visit',
                  icon: Icons.notes_rounded,
                  maxLines: 2,
                ),
                const SizedBox(height: 18),
                _GradientButton(
                  onPressed: () {
                    final id = idCtrl.text.trim();
                    if (id.isEmpty) return;
                    Navigator.pop(
                      context,
                      (id, noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim()),
                    );
                  },
                  label: 'Confirm',
                  icon: Icons.check_rounded,
                  stretch: true,
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// Returns `[returnCondition, reason]` where [0] is `new_good`, `used`, or `damaged`.
Future<List<String>?> _promptReturnToWarehouse(
  BuildContext context,
  String materialLabel,
) async {
  String condition = 'new_good';
  final reason = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setLocal) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          'Return to warehouse',
          style: TextStyle(color: Colors.white.withAlpha(230)),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                materialLabel,
                style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 13),
              ),
              const SizedBox(height: 14),
              Text(
                'What state is the material in?',
                style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'new_good', label: Text('New')),
                  ButtonSegment(value: 'used', label: Text('Used')),
                  ButtonSegment(value: 'damaged', label: Text('Damaged')),
                ],
                selected: {condition},
                onSelectionChanged: (s) => setLocal(() => condition = s.first),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: reason,
                style: const TextStyle(color: Colors.white),
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'Reason (required)',
                  labelStyle: TextStyle(color: Colors.white.withAlpha(120)),
                  filled: true,
                  fillColor: Colors.white.withAlpha(8),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: Colors.white.withAlpha(160))),
          ),
          FilledButton(
            onPressed: () {
              if (reason.text.trim().isEmpty) return;
              Navigator.pop(ctx, true);
            },
            child: const Text('Return'),
          ),
        ],
      ),
    ),
  );
  if (ok != true) {
    reason.dispose();
    return null;
  }
  final r = reason.text.trim();
  reason.dispose();
  return [condition, r];
}

Future<({bool cancelled, String? ticketId})?> _promptOptionalTicketForMaterial(
    BuildContext context) async {
  final ctrl = TextEditingController();
  final r = await showDialog<({bool cancelled, String? ticketId})>(
    context: context,
    builder: (dCtx) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: const Text(
        'Link to ticket?',
        style: TextStyle(color: Colors.white, fontSize: 17),
      ),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: 'Ticket ID (optional)',
          hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
          filled: true,
          fillColor: Colors.white10,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () =>
              Navigator.pop(dCtx, (cancelled: true, ticketId: null)),
          child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
        ),
        TextButton(
          onPressed: () {
            final t = ctrl.text.trim();
            Navigator.pop(
              dCtx,
              (cancelled: false, ticketId: t.isEmpty ? null : t),
            );
          },
          child: const Text('Continue',
              style: TextStyle(color: Color(0xFF6C63FF))),
        ),
      ],
    ),
  );
  return r;
}

Future<String?> _promptRequiredReason(BuildContext context, String title) async {
  final ctrl = TextEditingController();
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: Text(title, style: const TextStyle(color: Colors.white)),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        style: const TextStyle(color: Colors.white),
        maxLines: 3,
        decoration: InputDecoration(
          hintText: 'Required — visible in warehouse log',
          hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
          filled: true,
          fillColor: Colors.white10,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
        ),
        TextButton(
          onPressed: () {
            final t = ctrl.text.trim();
            if (t.isEmpty) return;
            Navigator.pop(ctx, t);
          },
          child: const Text('Submit',
              style: TextStyle(color: Color(0xFFFF4757))),
        ),
      ],
    ),
  );
  ctrl.dispose();
  return result;
}

Future<String?> _promptNote(BuildContext context, String title) async {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (_) => AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      title: Text(title, style: const TextStyle(color: Colors.white)),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        style: const TextStyle(color: Colors.white),
        maxLines: 3,
        decoration: InputDecoration(
          hintText: 'Optional context',
          hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
          filled: true,
          fillColor: Colors.white10,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, ctrl.text.trim()),
          child: const Text('Confirm',
              style: TextStyle(color: Color(0xFF6C63FF))),
        ),
      ],
    ),
  );
}
