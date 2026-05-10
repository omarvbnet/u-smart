import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/private_company.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';

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
  bool _formOpen = false;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
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
          content: const Text('Workspace request submitted for review.'),
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

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          pinned: false,
          floating: true,
          title: const _Title('Private Workspace'),
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
                title: 'Build your private company',
                subtitle:
                    'Organize your team into departments, assign managers, coordinators, engineers, technicians and workers, and share tickets only with your staff.',
                cta: 'Apply for a workspace',
                onCta: !canRequest
                    ? null
                    : () {
                        setState(() => _formOpen = true);
                      },
                disabled: !canRequest,
              ),
              if (!canRequest)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _MessageBanner(
                    icon: Icons.info_outline_rounded,
                    text: 'Only company-role accounts can open a private workspace.',
                    color: const Color(0xFFFBBF24),
                  ),
                ),
              const SizedBox(height: 22),
              const _SectionTitle('What you get'),
              const SizedBox(height: 10),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                childAspectRatio: 1.05,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                children: const [
                  _FeatureTile(
                    icon: Icons.account_tree_rounded,
                    title: 'Departments',
                    description: 'Group teams by service or specialization.',
                    color: Color(0xFF6C63FF),
                  ),
                  _FeatureTile(
                    icon: Icons.groups_rounded,
                    title: 'Staff roles',
                    description: 'Managers, coordinators, engineers, technicians, workers.',
                    color: Color(0xFF00D4AA),
                  ),
                  _FeatureTile(
                    icon: Icons.checklist_rounded,
                    title: 'Smart checklists',
                    description: 'Reusable inspection lists, attached optionally to tickets.',
                    color: Color(0xFFFBBF24),
                  ),
                  _FeatureTile(
                    icon: Icons.notifications_active_rounded,
                    title: 'Private notifications',
                    description: 'Tickets and alerts visible only to your staff.',
                    color: Color(0xFFFF9F43),
                  ),
                ],
              ),
              const SizedBox(height: 26),
              _ProcessSteps(),
              if (_formOpen) ...[
                const SizedBox(height: 26),
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: const [
                          Icon(Icons.business_center_rounded,
                              color: Color(0xFF6C63FF), size: 22),
                          SizedBox(width: 8),
                          Text(
                            'Workspace details',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _DarkField(
                        controller: _name,
                        label: 'Company / workspace name *',
                        hint: 'e.g. ACME Construction',
                        icon: Icons.apartment_rounded,
                      ),
                      const SizedBox(height: 12),
                      _DarkField(
                        controller: _description,
                        label: 'Description',
                        hint: 'What does your team do?',
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
                                ? 'Submitting…'
                                : 'Submit for admin review',
                            icon: Icons.send_rounded,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(
                          'An admin must approve your request before you can build departments and add staff.',
                          style: TextStyle(
                              color: Colors.white.withAlpha(120),
                              fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),
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
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          pinned: false,
          floating: true,
          title: const _Title('Private Workspace'),
          centerTitle: false,
          actions: [
            IconButton(
              tooltip: 'Refresh',
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
                description: _statusDescription(status, workspace),
              ),
              const SizedBox(height: 18),
              if (workspace.rejectionReason != null && status == PrivateCompanyStatus.rejected)
                _MessageBanner(
                  icon: Icons.report_gmailerrorred_rounded,
                  text: 'Reason: ${workspace.rejectionReason}',
                  color: const Color(0xFFFF4757),
                ),
              const SizedBox(height: 18),
              const _SectionTitle('What happens next'),
              const SizedBox(height: 10),
              const _ProcessSteps(),
              const SizedBox(height: 22),
              _GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Submitted on',
                      style: TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      workspace.createdAt.toLocal().toString().split('.').first,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    if (workspace.description != null && workspace.description!.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      const Text(
                        'Description',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
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

  String _statusDescription(PrivateCompanyStatus status, PrivateCompanyWorkspace ws) {
    switch (status) {
      case PrivateCompanyStatus.pending:
        return 'Your workspace request is in admin review. You will be notified by push notification once it is approved.';
      case PrivateCompanyStatus.rejected:
        return 'Your request was rejected. Please contact the admin or apply again with corrected information.';
      case PrivateCompanyStatus.suspended:
        return 'Your workspace has been suspended by the admin. Reach out to support to reactivate it.';
      case PrivateCompanyStatus.approved:
      case PrivateCompanyStatus.unknown:
        return ws.description ?? '';
    }
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
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final ws = widget.workspace;
    return Column(
      children: [
        _WorkspaceHeader(workspace: ws),
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
            tabs: const [
              Tab(icon: Icon(Icons.dashboard_rounded, size: 18), text: 'Overview'),
              Tab(icon: Icon(Icons.account_tree_rounded, size: 18), text: 'Departments'),
              Tab(icon: Icon(Icons.groups_rounded, size: 18), text: 'Staff'),
              Tab(icon: Icon(Icons.checklist_rounded, size: 18), text: 'Checklists'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _OverviewTab(workspace: ws),
              _DepartmentsTab(workspace: ws),
              _StaffTab(workspace: ws),
              _ChecklistsTab(workspace: ws),
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
                            workspace.status.label,
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
                        child: const Text(
                          'OWNER',
                          style: TextStyle(
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
          IconButton(
            tooltip: 'Refresh',
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

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  void _openBroadcast(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BroadcastSheet(workspace: workspace),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
    final byRole = <String, int>{};
    for (final s in workspace.staff) {
      byRole[s.role] = (byRole[s.role] ?? 0) + 1;
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (pc.canBroadcastNotifications) ...[
          _GradientButton(
            onPressed:
                pc.submitting ? null : () => _openBroadcast(context),
            label: 'Send notification',
            icon: Icons.campaign_rounded,
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
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit', style: TextStyle(color: Colors.white))),
                            PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Color(0xFFFF4757)))),
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
  String _color = '#6C63FF';
  String? _iconKey;

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
    _color = widget.existing?.color ?? _colorOptions[math.Random().nextInt(_colorOptions.length)];
    _iconKey = widget.existing?.iconKey;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
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
      );
    } else {
      ok = await pc.updateDepartment(
        widget.existing!.id,
        name: name,
        description: _description.text.trim(),
        color: _color,
        iconKey: _iconKey ?? '',
      );
    }
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
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
                Text(
                  widget.existing == null ? 'New department' : 'Edit department',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800),
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
              ...['MANAGER', 'COORDINATOR', 'ENGINEER', 'TECHNICIAN', 'WORKER'].map((r) {
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
    if (widget.existing == null) {
      final temp = await pc.createStaff(
        firstName: firstName,
        lastName: _lastName.text.trim(),
        email: _email.text.trim(),
        phone: _phone.text.trim(),
        role: _role,
        departmentId: _departmentId,
        specialization: _specialization,
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
                Text(
                  isEdit ? 'Edit staff' : 'Add staff member',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800),
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
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ChecklistEditorSheet(workspace: widget.workspace),
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
            final color = _categoryColor(c.category);
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
                        child: Icon(Icons.checklist_rounded, color: color, size: 20),
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
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${c.items.length} item${c.items.length == 1 ? '' : 's'}'
                              '${c.category != null ? ' · ${c.category}' : ''}',
                              style: TextStyle(
                                  color: Colors.white.withAlpha(140),
                                  fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      if (pc.canCreateChecklists)
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded,
                              color: Color(0xFFFF4757), size: 20),
                          onPressed: () => _confirmDelete(c),
                        ),
                    ],
                  ),
                  if (c.techniqueTypes.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: c.techniqueTypes.map((t) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white12,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.white24),
                          ),
                          child: Text(
                            t,
                            style: TextStyle(
                                color: Colors.white.withAlpha(180), fontSize: 10),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  if (c.items.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    ...c.items.take(4).map((it) {
                      final severityColor = it.isMajor
                          ? const Color(0xFFFF4757)
                          : const Color(0xFF8B83FF);
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline_rounded,
                                size: 16, color: color),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                it.label,
                                style: TextStyle(
                                    color: Colors.white.withAlpha(220),
                                    fontSize: 12),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: severityColor.withAlpha(28),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: severityColor.withAlpha(70),
                                ),
                              ),
                              child: Text(
                                it.isMajor ? 'MAJOR' : 'MINOR',
                                style: TextStyle(
                                  color: severityColor,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.6,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                    if (c.items.length > 4)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '+ ${c.items.length - 4} more',
                          style: TextStyle(
                              color: Colors.white.withAlpha(120), fontSize: 11),
                        ),
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

class _ChecklistEditorSheet extends StatefulWidget {
  const _ChecklistEditorSheet({required this.workspace});
  final PrivateCompanyWorkspace workspace;

  @override
  State<_ChecklistEditorSheet> createState() => _ChecklistEditorSheetState();
}

class _ChecklistDraftItem {
  _ChecklistDraftItem({String? text}) : controller = TextEditingController(text: text ?? '');

  final TextEditingController controller;
  PrivateCompanyChecklistItemSeverity severity =
      PrivateCompanyChecklistItemSeverity.minor;

  void dispose() => controller.dispose();
}

class _ChecklistEditorSheetState extends State<_ChecklistEditorSheet> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  String? _category;
  String? _departmentId;
  final List<_ChecklistDraftItem> _items = [_ChecklistDraftItem()];

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
    final ok = await pc.createChecklist(
      name: name,
      description: _description.text.trim(),
      category: _category,
      items: items,
      departmentId: _departmentId,
    );
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final pc = context.watch<PrivateCompanyProvider>();
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
                const Text(
                  'New checklist',
                  style: TextStyle(
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
                  label: pc.submitting ? 'Saving…' : 'Save checklist',
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
  });
  final Widget child;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF12122A).withAlpha(180),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withAlpha(15)),
            ),
            child: child,
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
  });

  final List<Color> gradient;
  final String title;
  final String subtitle;
  final String cta;
  final VoidCallback? onCta;
  final bool disabled;

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
                status.label,
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
    final steps = [
      ('Submit a request', 'Tell the admin your company name and what you do.', Icons.send_rounded, const Color(0xFF6C63FF)),
      ('Admin review', 'Admin checks your account and approves the workspace.', Icons.gavel_rounded, const Color(0xFFFBBF24)),
      ('Build & invite', 'Create departments, invite staff, design checklists.', Icons.engineering_rounded, const Color(0xFF00D4AA)),
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
