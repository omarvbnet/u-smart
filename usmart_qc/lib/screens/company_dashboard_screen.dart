import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/conflicts_provider.dart';
import '../widgets/language_selector.dart';
import '../models/ticket.dart';
import '../models/stats.dart';
import '../models/company_dashboard_summary.dart';
import '../models/site.dart';
import '../widgets/ticket_card.dart';
import '../widgets/stats_card.dart';
import 'notifications_screen.dart';
import 'ticket_detail_screen.dart';
import 'ticket_type_picker_screen.dart';
import 'conflicts_screen.dart';
import 'site_form_screen.dart';
import 'create_ticket_screen.dart';
import 'filtered_tickets_screen.dart';
import 'company_provisor_hub_screen.dart';
import 'private_company_hub_screen.dart';
import '../providers/private_company_provider.dart';
import '../widgets/update_password_sheet.dart';
import '../widgets/site_share_dialog.dart';
import '../widgets/site_bulk_import_menu.dart';
import '../widgets/workspace_field_staff_analytics_panel.dart';
import '../widgets/available_tickets_pool_tab.dart';
import 'qfield_project_map_screen.dart';
import '../widgets/workspace_site_detail_sheet.dart';
import '../widgets/personal_company_upgrade_card.dart';
import '../widgets/ticket_api_access_card.dart';
import '../utils/account_deletion_ui.dart';
import '../utils/requester_role_labels.dart';
import '../config/api_config.dart';

class CompanyDashboardScreen extends StatefulWidget {
  const CompanyDashboardScreen({super.key});

  @override
  State<CompanyDashboardScreen> createState() => _CompanyDashboardScreenState();
}

class _CompanyDashboardScreenState extends State<CompanyDashboardScreen> {
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
      _checkMustChangePassword();
    });
  }

  void _checkMustChangePassword() {
    final auth = context.read<AuthProvider>();
    if (!auth.mustChangePassword) return;
    showUpdatePasswordSheet(context, mandatoryRecovery: true);
  }

  Future<void> _loadData() async {
    final tickets = context.read<TicketsProvider>();
    final conflicts = context.read<ConflictsProvider>();
    final auth = context.read<AuthProvider>();
    final pc = context.read<PrivateCompanyProvider>();
    final isTechnician = auth.isTechnician;
    final inApprovedPrivateWorkspace =
        pc.workspace != null && pc.isApproved && (pc.isOwner || pc.isStaff);
    final technicianWorkspacePool =
        isTechnician && inApprovedPrivateWorkspace && !auth.isWorker;
    final futures = <Future<void>>[
      tickets.fetchTickets(),
      tickets.refreshAnalyticsForSession(
        hasCoordinatorCompany: auth.hasCoordinatorCompany,
      ),
      conflicts.fetchConflicts(),
    ];
    if (technicianWorkspacePool) {
      futures.add(tickets.loadProvinceFilter());
    }
    if (!auth.isWorker) {
      futures.add(context.read<SitesProvider>().fetchSites(
            includeWorkspace: pc.canOpenPrivateWorkspace,
          ));
    }
    if (!isTechnician && !auth.isWorker) {
      futures.add(context.read<ProvisorTechniquesProvider>().ensureLoaded());
    }
    await Future.wait(futures);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final auth = context.read<AuthProvider>();
    final pc = context.watch<PrivateCompanyProvider>();
    final isTechnician = auth.isTechnician;
    final isWorker = auth.isWorker;
    final showCompanyTab = auth.canAccessCompanyHub;
    final inApprovedPrivateWorkspace =
        pc.workspace != null && pc.isApproved && (pc.isOwner || pc.isStaff);
    final technicianWorkspacePool =
        isTechnician && inApprovedPrivateWorkspace && !isWorker;
    final readOnlyRole =
        isWorker || (isTechnician && !inApprovedPrivateWorkspace);
    final technicianWithSites = isTechnician && !isWorker;

    // Tab order depends on role
    final tabChildren = technicianWorkspacePool
        ? [
            AvailableTicketsPoolTab(
                workspaceScopeHint: pc.workspaceFieldAssignmentHint),
            const _TicketsTab(),
            const _SitesTab(allowCreateSite: false),
            const _StatsTab(),
            const _ConflictsTab(),
            const _ProfileTab(),
          ]
        : readOnlyRole && !technicianWithSites
            ? const [
                _TicketsTab(),
                _StatsTab(),
                _ConflictsTab(),
                _ProfileTab()
              ]
            : readOnlyRole && technicianWithSites
                ? const [
                    _TicketsTab(),
                    _SitesTab(allowCreateSite: false),
                    _StatsTab(),
                    _ConflictsTab(),
                    _ProfileTab()
                  ]
                : showCompanyTab
                    ? const [
                        _TicketsTab(),
                        _SitesTab(),
                        _StatsTab(),
                        _CompanyTab(),
                        _ConflictsTab(),
                        _ProfileTab()
                      ]
                    : const [
                        _TicketsTab(),
                        _SitesTab(),
                        _StatsTab(),
                        _ConflictsTab(),
                        _ProfileTab()
                      ];
    final tabCount = tabChildren.length;

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        children: [
          // Background gradient orbs
          Positioned(
            top: -120,
            right: -80,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF6C63FF).withAlpha(25),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: IndexedStack(
              index: _currentTab.clamp(0, tabCount - 1),
              children: tabChildren,
            ),
          ),
        ],
      ),
      bottomNavigationBar: ClipRRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0A0A1F).withAlpha(230),
              border: Border(
                top: BorderSide(color: Colors.white.withAlpha(10)),
              ),
            ),
            child: BottomNavigationBar(
              currentIndex: _currentTab.clamp(0, tabCount - 1),
              onTap: (i) => setState(() => _currentTab = i),
              type: BottomNavigationBarType.fixed,
              backgroundColor: Colors.transparent,
              selectedItemColor: const Color(0xFF6C63FF),
              unselectedItemColor: const Color(0xFF4B5563),
              selectedFontSize: 10,
              unselectedFontSize: 10,
              elevation: 0,
              items: technicianWorkspacePool
                  ? [
                      _navItem(Icons.inbox_rounded, l10n.t('nav_available')),
                      _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                      _navItem(Icons.explore_rounded, l10n.t('nav_sites')),
                      _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                      _navItem(Icons.gavel_rounded, l10n.t('conflicts')),
                      _navItem(Icons.person_rounded, l10n.t('nav_profile')),
                    ]
                  : readOnlyRole && !technicianWithSites
                  ? [
                      _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                      _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                      _navItem(Icons.gavel_rounded, l10n.t('conflicts')),
                      _navItem(Icons.person_rounded, l10n.t('nav_profile')),
                    ]
                  : readOnlyRole && technicianWithSites
                      ? [
                          _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                          _navItem(Icons.explore_rounded, l10n.t('nav_sites')),
                          _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                          _navItem(Icons.gavel_rounded, l10n.t('conflicts')),
                          _navItem(Icons.person_rounded, l10n.t('nav_profile')),
                        ]
                      : showCompanyTab
                          ? [
                              _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                              _navItem(Icons.explore_rounded, l10n.t('nav_sites')),
                              _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                              _navItem(Icons.business_center_rounded, l10n.t('nav_company')),
                              _navItem(Icons.gavel_rounded, l10n.t('conflicts')),
                              _navItem(Icons.person_rounded, l10n.t('nav_profile')),
                            ]
                          : [
                              _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                              _navItem(Icons.explore_rounded, l10n.t('nav_sites')),
                              _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                              _navItem(Icons.gavel_rounded, l10n.t('conflicts')),
                              _navItem(Icons.person_rounded, l10n.t('nav_profile')),
                            ],
            ),
          ),
        ),
      ),
      floatingActionButton: _currentTab ==
                  (technicianWorkspacePool ? 1 : 0) &&
              !readOnlyRole
          ? Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)],
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withAlpha(80),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: FloatingActionButton(
                heroTag: 'fab_new_ticket',
                onPressed: () {
                  final maintenanceOnly =
                      auth.isTechnician && inApprovedPrivateWorkspace;
                  showNewTicketTypePicker(
                    context,
                    maintenanceOnly: maintenanceOnly,
                  );
                },
                backgroundColor: Colors.transparent,
                elevation: 0,
                child: const Icon(
                  Icons.add_rounded,
                  color: Colors.white,
                  size: 28,
                ),
              ),
            )
          : null,
    );
  }

  BottomNavigationBarItem _navItem(IconData icon, String label) {
    return BottomNavigationBarItem(
      icon: Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Icon(icon, size: 24),
      ),
      activeIcon: Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
          ).createShader(bounds),
          child: Icon(icon, size: 24, color: Colors.white),
        ),
      ),
      label: label,
    );
  }
}

// ─── Tickets Tab ───
class _TicketsTab extends StatefulWidget {
  const _TicketsTab();

  @override
  State<_TicketsTab> createState() => _TicketsTabState();
}

class _TicketsTabState extends State<_TicketsTab> {
  final TextEditingController _searchController = TextEditingController();
  String _statusFilter = 'ALL';
  String _techniqueFilter = 'ALL';
  /// Workspace tickets: filter by target department id (`ALL` = any).
  String _departmentFilter = 'ALL';
  DateTimeRange? _dateRange;
  bool _showFilters = true;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool _useDepartmentTicketFilter(PrivateCompanyProvider pc) {
    if (!pc.hasWorkspace || !pc.isApproved) return false;
    if (!(pc.isOwner || pc.isStaff)) return false;
    final depts = pc.workspace?.departments ?? [];
    return depts.isNotEmpty;
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 1),
      initialDateRange: _dateRange,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.dark(
              primary: Color(0xFF6C63FF),
              surface: Color(0xFF12122A),
            ),
            dialogTheme: const DialogThemeData(
              backgroundColor: Color(0xFF12122A),
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked == null) return;
    setState(() => _dateRange = picked);
  }

  List<Ticket> _applyFilters(List<Ticket> tickets, PrivateCompanyProvider pc) {
    final query = _searchController.text.trim().toLowerCase();
    final useDept = _useDepartmentTicketFilter(pc);
    final deptNames = {
      for (final d in (pc.workspace?.departments ?? [])) d.id: d.name,
    };
    return tickets.where((t) {
      if (_statusFilter != 'ALL' && t.status != _statusFilter) return false;
      if (useDept) {
        if (_departmentFilter != 'ALL' &&
            t.privateCompanyTargetDepartmentId != _departmentFilter) {
          return false;
        }
      } else {
        if (_techniqueFilter != 'ALL' && t.technique != _techniqueFilter) {
          return false;
        }
      }
      if (_dateRange != null) {
        final start = DateTime(
          _dateRange!.start.year,
          _dateRange!.start.month,
          _dateRange!.start.day,
        );
        final end = DateTime(
          _dateRange!.end.year,
          _dateRange!.end.month,
          _dateRange!.end.day,
          23,
          59,
          59,
        );
        if (t.createdAt.isBefore(start) || t.createdAt.isAfter(end)) return false;
      }
      if (query.isEmpty) return true;
      final targetDeptName = t.privateCompanyTargetDepartmentId == null
          ? ''
          : (deptNames[t.privateCompanyTargetDepartmentId!] ?? '');
      final blob = [
        t.id,
        t.siteName ?? '',
        t.siteCoordinator ?? '',
        t.status,
        t.technique,
        targetDeptName,
        t.requesterName ?? '',
        t.requesterPhone ?? '',
        t.requesterRole ?? '',
        t.inspectionResult ?? '',
        t.assignedEngineerName ?? '',
      ].join(' ').toLowerCase();
      return blob.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer2<TicketsProvider, PrivateCompanyProvider>(
      builder: (context, provider, pc, _) {
        if (provider.loading && provider.tickets.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        final useDept = _useDepartmentTicketFilter(pc);
        final sortedDepts = List.of(pc.workspace?.departments ?? [])
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
        final departmentIds = <String>['ALL', ...sortedDepts.map((d) => d.id)];
        final deptNameById = {for (final d in sortedDepts) d.id: d.name};
        final effectiveDept =
            departmentIds.contains(_departmentFilter) ? _departmentFilter : 'ALL';

        final statuses = <String>{
          'ALL',
          ...provider.tickets.map((t) => t.status),
        }.toList();
        final techniques = <String>{
          'ALL',
          ...provider.tickets.map((t) => t.technique),
        }.toList();
        final effectiveStatus = statuses.contains(_statusFilter) ? _statusFilter : 'ALL';
        final effectiveTechnique = techniques.contains(_techniqueFilter) ? _techniqueFilter : 'ALL';
        if (useDept) {
          if (effectiveDept != _departmentFilter || effectiveStatus != _statusFilter) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              setState(() {
                if (effectiveDept != _departmentFilter) {
                  _departmentFilter = effectiveDept;
                }
                if (effectiveStatus != _statusFilter) {
                  _statusFilter = effectiveStatus;
                }
              });
            });
          }
        } else if (effectiveStatus != _statusFilter || effectiveTechnique != _techniqueFilter) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            setState(() {
              _statusFilter = effectiveStatus;
              _techniqueFilter = effectiveTechnique;
            });
          });
        }
        final filtered = _applyFilters(provider.tickets, pc);

        final sections = <_TicketSection>[
          if (filtered.where((t) => t.isPending).isNotEmpty)
            _TicketSection(
              l10n.t('section_pending'),
              filtered.where((t) => t.isPending).toList(),
              const Color(0xFFFBBF24),
            ),
          if (filtered.where((t) => t.isOnSite).isNotEmpty)
            _TicketSection(
              l10n.t('section_on_site'),
              filtered.where((t) => t.isOnSite).toList(),
              const Color(0xFF6C63FF),
            ),
          if (filtered.where((t) => t.isInProgress).isNotEmpty)
            _TicketSection(
              l10n.t('section_in_progress'),
              filtered.where((t) => t.isInProgress).toList(),
              const Color(0xFF00D4AA),
            ),
          if (filtered.where((t) => t.isCompleted).isNotEmpty)
            _TicketSection(
              l10n.t('section_completed'),
              filtered.where((t) => t.isCompleted).toList(),
              const Color(0xFF4ADE80),
            ),
        ];

        return Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: [
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    ).createShader(bounds),
                    child: Text(
                      l10n.t('nav_tickets'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => setState(() => _showFilters = !_showFilters),
                    icon: Icon(
                      _showFilters ? Icons.tune_rounded : Icons.tune_outlined,
                      color: const Color(0xFF8B83FF),
                    ),
                    tooltip: l10n.t('tooltip_ticket_filters'),
                  ),
                  Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      if (!auth.canAccessCompanyHub) {
                        return const SizedBox.shrink();
                      }
                      return IconButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const CompanyProvisorHubScreen(),
                          ),
                        ),
                        icon: const Icon(Icons.business_center_outlined, color: Color(0xFF8B83FF)),
                        tooltip: l10n.t('tooltip_company_hub'),
                      );
                    },
                  ),
                  Consumer2<AuthProvider, PrivateCompanyProvider>(
                    builder: (context, auth, pc, _) {
                      final role = (auth.user?.role ?? '').toUpperCase();
                      final canRequest = role == 'COMPANY';
                      final hasMembership =
                          pc.membership.isOwner || pc.membership.isStaff;
                      if (!canRequest && !hasMembership) {
                        return const SizedBox.shrink();
                      }
                      final pendingDot = pc.workspace?.isPending == true ||
                          pc.workspace?.isRejected == true ||
                          pc.workspace?.isSuspended == true;
                      return Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            IconButton(
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) =>
                                      const PrivateCompanyHubScreen(),
                                ),
                              ),
                              icon: ShaderMask(
                                shaderCallback: (b) => const LinearGradient(
                                  colors: [
                                    Color(0xFF6C63FF),
                                    Color(0xFF00D4AA),
                                  ],
                                ).createShader(b),
                                child: const Icon(
                                  Icons.workspaces_rounded,
                                  color: Colors.white,
                                ),
                              ),
                              tooltip: l10n.t('tooltip_private_workspace'),
                            ),
                            if (pendingDot)
                              Positioned(
                                top: 6,
                                right: 6,
                                child: Container(
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    color: pc.workspace?.isPending == true
                                        ? const Color(0xFFFBBF24)
                                        : const Color(0xFFFF4757),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: const Color(0xFF05051A),
                                      width: 1.5,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                  Consumer<NotificationsProvider>(
                    builder: (context, notifProvider, _) {
                      final count = notifProvider.unreadCount;
                      return GestureDetector(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const NotificationsScreen(),
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Icon(
                                Icons.notifications_outlined,
                                color: Colors.white.withAlpha(150),
                                size: 24,
                              ),
                              if (count > 0)
                                Positioned(
                                  top: -4,
                                  right: -6,
                                  child: Container(
                                    padding: const EdgeInsets.all(3),
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFFF4757),
                                      shape: BoxShape.circle,
                                    ),
                                    constraints: const BoxConstraints(
                                      minWidth: 16,
                                      minHeight: 16,
                                    ),
                                    child: Text(
                                      count > 99 ? '99+' : '$count',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF).withAlpha(20),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      l10n.t('total_count', {
                        'count': '${filtered.length}',
                      }),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: !_showFilters
                  ? const SizedBox.shrink()
                  : Container(
                      key: const ValueKey('company-ticket-filters'),
                      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF6C63FF).withAlpha(20),
                            const Color(0xFF00D4AA).withAlpha(8),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: Colors.white.withAlpha(12)),
                      ),
                      child: Column(
                        children: [
                          TextField(
                            controller: _searchController,
                            onChanged: (_) => setState(() {}),
                            style: const TextStyle(color: Colors.white),
                            decoration: InputDecoration(
                              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF8B83FF)),
                              hintText: useDept
                                  ? 'Search by site, ticket ID, requester, status, department...'
                                  : 'Search by site, ticket ID, requester, status, technique...',
                              hintStyle: TextStyle(color: Colors.white.withAlpha(120), fontSize: 13),
                              filled: true,
                              fillColor: Colors.white.withAlpha(8),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _TicketFilterDropdown(
                                  label: 'Status',
                                  value: effectiveStatus,
                                  items: statuses,
                                  onChanged: (v) => setState(() => _statusFilter = v),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: useDept
                                    ? _TicketFilterDropdown(
                                        label: l10n.t('pc_ws_tab_departments'),
                                        value: effectiveDept,
                                        items: departmentIds,
                                        itemLabel: (id) => id == 'ALL'
                                            ? l10n.t('ticket_all_departments')
                                            : (deptNameById[id] ?? id),
                                        onChanged: (v) =>
                                            setState(() => _departmentFilter = v),
                                      )
                                    : _TicketFilterDropdown(
                                        label: 'Technique',
                                        value: effectiveTechnique,
                                        items: techniques,
                                        onChanged: (v) =>
                                            setState(() => _techniqueFilter = v),
                                      ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _pickDateRange,
                                  icon: const Icon(Icons.date_range_rounded, size: 18),
                                  label: Text(
                                    _dateRange == null
                                        ? 'Date range'
                                        : '${_dateRange!.start.year}/${_dateRange!.start.month.toString().padLeft(2, '0')}/${_dateRange!.start.day.toString().padLeft(2, '0')} - ${_dateRange!.end.year}/${_dateRange!.end.month.toString().padLeft(2, '0')}/${_dateRange!.end.day.toString().padLeft(2, '0')}',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: BorderSide(color: Colors.white.withAlpha(20)),
                                    backgroundColor: Colors.white.withAlpha(6),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              TextButton.icon(
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() {
                                    _statusFilter = 'ALL';
                                    _techniqueFilter = 'ALL';
                                    _departmentFilter = 'ALL';
                                    _dateRange = null;
                                  });
                                },
                                icon: const Icon(Icons.restart_alt_rounded, size: 18, color: Color(0xFFFF6B81)),
                                label: const Text('Reset', style: TextStyle(color: Color(0xFFFF6B81))),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              _TicketInfoPill(label: 'Matched', value: '${filtered.length}', color: const Color(0xFF00D4AA)),
                              const SizedBox(width: 8),
                              _TicketInfoPill(label: 'Pending', value: '${filtered.where((t) => t.isPending).length}', color: const Color(0xFFFBBF24)),
                              const SizedBox(width: 8),
                              _TicketInfoPill(label: 'Completed', value: '${filtered.where((t) => t.isCompleted).length}', color: const Color(0xFF4ADE80)),
                            ],
                          ),
                        ],
                      ),
                    ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: sections.isEmpty
                  ? _emptyState(
                      context,
                      l10n,
                      showFilterMessage: filtered.isEmpty && provider.tickets.isNotEmpty,
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchTickets(),
                      color: const Color(0xFF6C63FF),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                        itemCount: sections.fold<int>(
                          0,
                          (sum, s) => sum + 1 + s.tickets.length,
                        ),
                        itemBuilder: (context, index) {
                          int i = 0;
                          for (final section in sections) {
                            if (index == i) {
                              return _sectionHeader(section);
                            }
                            if (index <= i + section.tickets.length) {
                              final ticket = section.tickets[index - i - 1];
                              return TicketCard(
                                ticket: ticket,
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        TicketDetailScreen(ticketId: ticket.id),
                                  ),
                                ),
                                onAssign: null,
                                showAssignToMe:
                                    false, // Requester cannot assign
                              );
                            }
                            i += 1 + section.tickets.length;
                          }
                          return const SizedBox.shrink();
                        },
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _sectionHeader(_TicketSection section) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 18,
            decoration: BoxDecoration(
              color: section.color,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            section.title.toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(140),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: section.color.withAlpha(25),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${section.tickets.length}',
              style: TextStyle(
                color: section.color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyState(
    BuildContext context,
    AppLocalizations l10n, {
    required bool showFilterMessage,
  }) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF6C63FF).withAlpha(15),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.assignment_outlined,
              size: 48,
              color: Color(0xFF6C63FF),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            showFilterMessage ? 'No tickets match your filters' : l10n.t('no_tickets'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            showFilterMessage
                ? 'Try changing date range, status, technique, or search'
                : l10n.t('create_first_ticket'),
            style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class _TicketFilterDropdown extends StatelessWidget {
  final String label;
  final String value;
  final List<String> items;
  final ValueChanged<String> onChanged;
  /// When set, maps each [items] entry (except `ALL`) to a display string.
  final String Function(String item)? itemLabel;

  const _TicketFilterDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.itemLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withAlpha(14)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          dropdownColor: const Color(0xFF12122A),
          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Color(0xFF8B83FF)),
          style: const TextStyle(color: Colors.white, fontSize: 13),
          items: items
              .map((item) => DropdownMenuItem<String>(
                    value: item,
                    child: Text(
                      item == 'ALL'
                          ? '$label: ALL'
                          : (itemLabel?.call(item) ?? item),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ))
              .toList(),
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

class _TicketInfoPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _TicketInfoPill({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withAlpha(30),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withAlpha(70)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
            Text(value, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _TicketSection {
  final String title;
  final List<Ticket> tickets;
  final Color color;
  _TicketSection(this.title, this.tickets, this.color);
}

// ─── Sites Tab ───
class _SitesTab extends StatefulWidget {
  const _SitesTab({this.allowCreateSite = true});

  /// Technicians can open the Sites tab but cannot register new sites from the app.
  final bool allowCreateSite;

  @override
  State<_SitesTab> createState() => _SitesTabState();
}

class _SitesTabState extends State<_SitesTab> {
  final TextEditingController _siteSearchCtrl = TextEditingController();

  @override
  void dispose() {
    _siteSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _reloadSites(SitesProvider provider) {
    final pc = context.read<PrivateCompanyProvider>();
    return provider.fetchSites(includeWorkspace: pc.canOpenPrivateWorkspace);
  }

  Future<void> _openAddSite(SitesProvider provider) async {
    if (provider.canManageWorkspaceSites) {
      await showWorkspaceSiteCreateSheet(context);
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SiteFormScreen()),
      );
    }
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

  static String _fmtSiteHours(double h) {
    if (h <= 0) return '0';
    return h < 1 ? h.toStringAsFixed(2) : h.toStringAsFixed(1);
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
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: Text(
          l10n.t('site_delete_confirm', {'name': site.siteId}),
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              l10n.t('cancel'),
              style: TextStyle(color: Colors.white.withAlpha(120)),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF4757),
            ),
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
              success ? l10n.t('site_deleted') : l10n.t('site_delete_failed'),
            ),
            backgroundColor: success
                ? const Color(0xFF00D4AA)
                : const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          l10n.t('site_remove_share_title'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        content: Text(
          l10n.t('site_remove_share_confirm', {'name': site.siteId}),
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
          content: Text(success ? l10n.t('site_remove_share_done') : l10n.t('site_share_failed')),
          backgroundColor:
              success ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer<SitesProvider>(
      builder: (context, provider, _) {
        if (provider.loading && provider.sites.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        return Stack(
          children: [
            Column(
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
                      prefixIcon: Icon(Icons.search_rounded, color: Colors.white.withAlpha(120)),
                      filled: true,
                      fillColor: const Color(0xFF12122A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: Colors.white.withAlpha(14)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: Color(0xFF6C63FF)),
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
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
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF00D4AA).withAlpha(20),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.gps_fixed,
                              color: Color(0xFF00D4AA),
                              size: 14,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              l10n.t('gps_count', {
                                'count':
                                    '${provider.sitesWithCoordinates.length}',
                              }),
                              style: const TextStyle(
                                color: Color(0xFF00D4AA),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (widget.allowCreateSite) const SiteBulkImportMenu(),
                    ],
                  ),
                ),
                Expanded(
                  child: provider.sites.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(24),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF6C63FF).withAlpha(15),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.explore_off_rounded,
                                  size: 48,
                                  color: Color(0xFF6C63FF),
                                ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                l10n.t('no_sites'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (widget.allowCreateSite && provider.canAddSite) ...[
                                const SizedBox(height: 24),
                                ElevatedButton.icon(
                                  onPressed: () => _openAddSite(provider),
                                  icon: const Icon(Icons.add_rounded, size: 20),
                                  label: Text(l10n.t('site_add')),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF6C63FF),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 24,
                                      vertical: 12,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _reloadSites(provider),
                          color: const Color(0xFF6C63FF),
                          child: Builder(
                            builder: (context) {
                              final q = _siteSearchCtrl.text.trim().toLowerCase();
                              final all = provider.sites;
                              final visible = q.isEmpty
                                  ? all
                                  : all
                                      .where(
                                        (s) =>
                                            s.siteId.toLowerCase().contains(q) ||
                                            s.id.toLowerCase().contains(q),
                                      )
                                      .toList();
                              if (visible.isEmpty) {
                                return ListView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  children: [
                                    const SizedBox(height: 48),
                                    Center(
                                      child: Text(
                                        l10n.t('no_sites'),
                                        style: TextStyle(
                                          color: Colors.white.withAlpha(160),
                                          fontSize: 15,
                                        ),
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
                              return InkWell(
                                onTap: () => _openSite(context, site),
                                borderRadius: BorderRadius.circular(14),
                                child: Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Color(0xFF18182C),
                                      Color(0xFF12122A),
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: Colors.white.withAlpha(20),
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withAlpha(26),
                                      blurRadius: 10,
                                      offset: const Offset(0, 3),
                                    ),
                                  ],
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: [
                                            const Color(
                                              0xFF6C63FF,
                                            ).withAlpha(36),
                                            const Color(
                                              0xFF00D4AA,
                                            ).withAlpha(18),
                                          ],
                                        ),
                                        borderRadius:
                                            BorderRadius.circular(12),
                                      ),
                                      child: const Icon(
                                        Icons.location_on_rounded,
                                        color: Color(0xFF8B83FF),
                                        size: 20,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            site.siteId,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          if (site.sharedWithMe &&
                                              site.ownerUsername != null &&
                                              site.ownerUsername!.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Text(
                                              l10n.t(
                                                'site_shared_badge',
                                                {'owner': site.ownerUsername!},
                                              ),
                                              style: TextStyle(
                                                color: Colors.amberAccent
                                                    .withAlpha(230),
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                          const SizedBox(height: 2),
                                          Text(
                                            '${site.location} - ${site.province}',
                                            style: TextStyle(
                                              color: Colors.white.withAlpha(
                                                100,
                                              ),
                                              fontSize: 13,
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            l10n.t('site_row_inspection', {
                                              'n': '${site.inspectionQcCount}',
                                              'h': _fmtSiteHours(
                                                  site.inspectionHoursTotal),
                                            }),
                                            style: TextStyle(
                                              color: Colors.white.withAlpha(60),
                                              fontSize: 11,
                                            ),
                                          ),
                                          Text(
                                            l10n.t('site_row_maintenance', {
                                              'n': '${site.maintenanceQcCount}',
                                              'h': _fmtSiteHours(
                                                  site.maintenanceHoursTotal),
                                            }),
                                            style: TextStyle(
                                              color: Colors.white.withAlpha(60),
                                              fontSize: 11,
                                            ),
                                          ),
                                          if (site.updatedAt != null) ...[
                                            const SizedBox(height: 4),
                                            Text(
                                              '${l10n.t('site_updated_on')} ${_formatDate(site.updatedAt!)}',
                                              style: TextStyle(
                                                color: Colors.white.withAlpha(
                                                  50,
                                                ),
                                                fontSize: 10,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        IconButton(
                                          onPressed: () => Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (_) => CreateTicketScreen(
                                                prefillSite: site,
                                              ),
                                            ),
                                          ),
                                          icon: const Icon(
                                            Icons.note_add_outlined,
                                            color: Color(0xFF00D4AA),
                                            size: 20,
                                          ),
                                          tooltip: l10n.t('site_create_ticket_here'),
                                        ),
                                        if (site.hasQfield &&
                                            site.qfieldProjects.isNotEmpty) ...[
                                          IconButton(
                                            onPressed: () {
                                              final proj = site.qfieldProjects.first;
                                              Navigator.of(context).push(
                                                MaterialPageRoute(
                                                  fullscreenDialog: true,
                                                  builder: (_) => QFieldProjectMapScreen(
                                                    workspaceSiteId: site.isWorkspace
                                                        ? site.workspaceSiteId
                                                        : null,
                                                    ownedSiteId: site.isWorkspace
                                                        ? null
                                                        : site.id,
                                                    project: proj,
                                                    canWrite: site.canEdit ||
                                                        site.isWorkspace,
                                                    onSaved: () => _reloadSites(provider),
                                                  ),
                                                ),
                                              );
                                            },
                                            icon: const Icon(Icons.map_rounded,
                                                color: Color(0xFF00D4AA), size: 20),
                                            tooltip: l10n.t('pc_site_view_qfield_map'),
                                          ),
                                        ],
                                        if (site.canEdit && !site.isWorkspace) ...[
                                          IconButton(
                                            onPressed: () => Navigator.of(
                                                    context)
                                                .push(
                                                  MaterialPageRoute(
                                                    builder: (_) =>
                                                        SiteFormScreen(
                                                            site: site),
                                                  ),
                                                )
                                                .then(
                                                  (_) =>
                                                      _reloadSites(provider),
                                                ),
                                            icon: const Icon(
                                              Icons.edit_rounded,
                                              color: Color(0xFF6C63FF),
                                              size: 20,
                                            ),
                                            tooltip: l10n.t('site_edit'),
                                          ),
                                          IconButton(
                                            onPressed: () => _confirmDelete(
                                              context,
                                              provider,
                                              site,
                                              l10n,
                                            ),
                                            icon: const Icon(
                                              Icons.delete_outline_rounded,
                                              color: Color(0xFFFF4757),
                                              size: 20,
                                            ),
                                            tooltip: l10n.t('site_delete'),
                                          ),
                                          IconButton(
                                            onPressed: () => promptShareSite(
                                              context: context,
                                              provider: provider,
                                              site: site,
                                              l10n: l10n,
                                            ),
                                            icon: const Icon(
                                              Icons.person_add_alt_1_rounded,
                                              color: Color(0xFF00D4AA),
                                              size: 20,
                                            ),
                                            tooltip: l10n.t('site_share_title'),
                                          ),
                                        ] else ...[
                                          IconButton(
                                            onPressed: () => Navigator.of(
                                                    context)
                                                .push(
                                                  MaterialPageRoute(
                                                    builder: (_) =>
                                                        SiteFormScreen(
                                                      site: site,
                                                      readOnly: true,
                                                    ),
                                                  ),
                                                )
                                                .then(
                                                  (_) =>
                                                      _reloadSites(provider),
                                                ),
                                            icon: const Icon(
                                              Icons.visibility_rounded,
                                              color: Color(0xFF6C63FF),
                                              size: 20,
                                            ),
                                            tooltip:
                                                l10n.t('site_view_shared'),
                                          ),
                                          IconButton(
                                            onPressed: () =>
                                                _confirmRemoveShare(
                                              context,
                                              provider,
                                              site,
                                              l10n,
                                            ),
                                            icon: const Icon(
                                              Icons.link_off_rounded,
                                              color: Color(0xFFFFA502),
                                              size: 20,
                                            ),
                                            tooltip:
                                                l10n.t('site_remove_share'),
                                          ),
                                        ],
                                        const SizedBox(width: 4),
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            color: site.hasCoordinates
                                                ? const Color(
                                                    0xFF00D4AA,
                                                  ).withAlpha(20)
                                                : Colors.white.withAlpha(8),
                                            borderRadius: BorderRadius.circular(
                                              10,
                                            ),
                                          ),
                                          child: Icon(
                                            site.hasCoordinates
                                                ? Icons.gps_fixed
                                                : Icons.gps_off,
                                            color: site.hasCoordinates
                                                ? const Color(0xFF00D4AA)
                                                : const Color(0xFF4B5563),
                                            size: 18,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                            },
                          );
                            },
                          ),
                        ),
                ),
              ],
            ),
            if (widget.allowCreateSite && provider.canAddSite)
              Positioned(
                right: 20,
                bottom: 24,
                child: FloatingActionButton(
                  heroTag: 'fab_new_site',
                  onPressed: () => _openAddSite(provider),
                  backgroundColor: const Color(0xFF6C63FF),
                  child: const Icon(Icons.add_rounded, color: Colors.white),
                ),
              ),
          ],
        );
      },
    );
  }

  String _formatDate(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
}

/// Backend coordinator/company-owner metrics from `/api/tickets/stats`.
class _CompanyInsightsBlock extends StatelessWidget {
  const _CompanyInsightsBlock({
    required this.l10n,
    required this.stats,
    this.coordinatorSession = false,
  });

  final AppLocalizations l10n;
  final TicketStats stats;
  final bool coordinatorSession;

  Widget _kvRow(String k, int v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: TextStyle(
                color: Colors.white.withAlpha(180),
                fontSize: 13,
              ),
            ),
          ),
          Text(
            '$v',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(String title, Map<String, int> m) {
    if (m.isEmpty) return const SizedBox.shrink();
    final entries = m.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: Colors.white.withAlpha(200),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          ...entries.map((e) => _kvRow(e.key, e.value)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF00D4AA).withAlpha(45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.apartment_rounded,
                  color: Color(0xFF00D4AA), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.t('company_insights'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _section(l10n.t('insight_staff_by_role'), stats.usersByRole),
          _section(l10n.t('insight_tickets_by_category'), stats.ticketsByCategory),
          _section(l10n.t('insight_tickets_by_status'), stats.ticketsByStatus),
          _section(l10n.t('insight_tickets_by_scope'), stats.ticketsByRoleScope),
          if (coordinatorSession && !stats.hasCompanyInsights)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l10n.t('coordinator_insights_empty'),
                style: TextStyle(
                  color: Colors.white.withAlpha(140),
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// From `GET /api/company/dashboard` (staff performance + totals).
class _CompanyDashboardApiBlock extends StatelessWidget {
  const _CompanyDashboardApiBlock({
    required this.l10n,
    required this.summary,
  });

  final AppLocalizations l10n;
  final CompanyDashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final rows = List<StaffPerformanceRow>.from(summary.staffPerformance)
      ..sort((a, b) => b.assigned.compareTo(a.assigned));

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF6C63FF).withAlpha(50)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.dashboard_customize_outlined,
                  color: Color(0xFF6C63FF), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.t('dashboard_live_title'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _miniMetric(
                  l10n.t('dashboard_total_staff'),
                  '${summary.totalStaff}',
                  const Color(0xFF6C63FF),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _miniMetric(
                  l10n.t('dashboard_total_company_tickets'),
                  '${summary.totalTickets}',
                  const Color(0xFF00D4AA),
                ),
              ),
            ],
          ),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(
              l10n.t('dashboard_staff_performance'),
              style: TextStyle(
                color: Colors.white.withAlpha(200),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(
                  const Color(0xFF1a1a35),
                ),
                dataRowMinHeight: 40,
                dataRowMaxHeight: 48,
                columnSpacing: 16,
                columns: [
                  DataColumn(
                    label: Text(
                      l10n.t('dashboard_col_member'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  DataColumn(
                    label: Text(
                      l10n.t('dashboard_col_role'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  DataColumn(
                    numeric: true,
                    label: Text(
                      l10n.t('dashboard_col_assigned'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  DataColumn(
                    numeric: true,
                    label: Text(
                      l10n.t('dashboard_col_done'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  DataColumn(
                    numeric: true,
                    label: Text(
                      l10n.t('dashboard_col_needs_edit'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  DataColumn(
                    numeric: true,
                    label: Text(
                      l10n.t('dashboard_col_resubmit'),
                      style: const TextStyle(
                        color: Color(0xFF8B83FF),
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
                rows: rows
                    .map(
                      (r) => DataRow(
                        cells: [
                          DataCell(Text(
                            r.shortUserLabel,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          )),
                          DataCell(Text(
                            r.role,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                            ),
                          )),
                          DataCell(Text(
                            '${r.assigned}',
                            style: const TextStyle(color: Colors.white),
                          )),
                          DataCell(Text(
                            '${r.completed}',
                            style: const TextStyle(color: Color(0xFF4ADE80)),
                          )),
                          DataCell(Text(
                            '${r.needsEdit}',
                            style: const TextStyle(color: Color(0xFFFFB347)),
                          )),
                          DataCell(Text(
                            '${r.resubmitted}',
                            style: const TextStyle(color: Color(0xFF8B83FF)),
                          )),
                        ],
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _miniMetric(String label, String value, Color accent) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withAlpha(18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withAlpha(55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withAlpha(170),
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              color: accent,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Stats Tab ───
class _StatsTab extends StatelessWidget {
  const _StatsTab();

  static String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _formatTotalInspectionHours(double h) {
    if (h < 1) return '${(h * 60).round()} min';
    return '${h.toStringAsFixed(1)} h';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isTechnician = context.read<AuthProvider>().isTechnician;
    if (isTechnician) {
      return _TechnicianStatsContent(l10n: l10n);
    }
    return Consumer<TicketsProvider>(
      builder: (context, provider, _) {
        final auth = context.read<AuthProvider>();
        final stats = provider.stats;
        final inspection = stats?.inspectionStats;
        final hasFilter = provider.dateFrom != null || provider.dateTo != null;

        return RefreshIndicator(
          onRefresh: () async {
            final authRefresh = context.read<AuthProvider>();
            await provider.refreshAnalyticsForSession(
              hasCoordinatorCompany: authRefresh.hasCoordinatorCompany,
            );
            await provider.fetchTickets();
          },
          color: const Color(0xFF6C63FF),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ShaderMask(
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                  ).createShader(bounds),
                  child: Text(
                    l10n.t('nav_analytics'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              if (kDebugMode)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Debug: role=${auth.user?.role ?? "?"} · companyId=${auth.user?.companyId ?? "none"} · API ${ApiConfig.baseUrl}',
                      style: TextStyle(
                        color: Colors.amber.withAlpha(204),
                        fontSize: 10,
                        height: 1.25,
                      ),
                    ),
                  ),
                ),
              // Date range filter
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withAlpha(10)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.date_range_rounded,
                          size: 18,
                          color: Colors.white.withAlpha(160),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          l10n.t('filter_date_range'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(200),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate:
                                    provider.dateFrom ??
                                    DateTime.now().subtract(
                                      const Duration(days: 30),
                                    ),
                                firstDate: DateTime(2020),
                                lastDate: DateTime.now(),
                              );
                              if (picked != null && context.mounted) {
                                provider.setDateRange(
                                  picked,
                                  provider.dateTo ?? picked,
                                );
                                await provider.fetchStats();
                                await provider.fetchTickets();
                              }
                            },
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withAlpha(8),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.calendar_today_rounded,
                                    size: 16,
                                    color: Colors.white.withAlpha(140),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    provider.dateFrom != null
                                        ? _formatDate(provider.dateFrom!)
                                        : l10n.t('filter_date_from'),
                                    style: TextStyle(
                                      color: provider.dateFrom != null
                                          ? Colors.white
                                          : Colors.white.withAlpha(100),
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: provider.dateTo ?? DateTime.now(),
                                firstDate: provider.dateFrom ?? DateTime(2020),
                                lastDate: DateTime.now(),
                              );
                              if (picked != null && context.mounted) {
                                provider.setDateRange(
                                  provider.dateFrom ?? picked,
                                  picked,
                                );
                                await provider.fetchStats();
                                await provider.fetchTickets();
                              }
                            },
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withAlpha(8),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.calendar_today_rounded,
                                    size: 16,
                                    color: Colors.white.withAlpha(140),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    provider.dateTo != null
                                        ? _formatDate(provider.dateTo!)
                                        : l10n.t('filter_date_to'),
                                    style: TextStyle(
                                      color: provider.dateTo != null
                                          ? Colors.white
                                          : Colors.white.withAlpha(100),
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        if (hasFilter) ...[
                          const SizedBox(width: 8),
                          IconButton(
                            onPressed: () async {
                              provider.clearDateRange();
                              await provider.fetchStats();
                              await provider.fetchTickets();
                            },
                            icon: const Icon(
                              Icons.clear_rounded,
                              color: Color(0xFFFF4757),
                              size: 22,
                            ),
                            tooltip: l10n.t('filter_clear'),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: Builder(
                        builder: (exportBtnContext) {
                          return ElevatedButton.icon(
                            onPressed: provider.exporting
                                ? null
                                : () async {
                                    final path = await provider.exportTicketsExcel(
                                      exportBtnContext,
                                    );
                                    if (context.mounted && path != null) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(l10n.t('export_success')),
                                          backgroundColor: const Color(0xFF00D4AA),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                    }
                                  },
                            icon: provider.exporting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.download_rounded, size: 20),
                            label: Text(
                              provider.exporting
                                  ? l10n.t('exporting')
                                  : l10n.t('export_excel'),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00D4AA),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              // SLA compliance bar
              if (stats != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 20),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        const Color(0xFF6C63FF).withAlpha(15),
                        const Color(0xFF00D4AA).withAlpha(10),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withAlpha(10)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            l10n.t('sla_compliance'),
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${stats.slaCompliancePercent.toStringAsFixed(1)}%',
                            style: const TextStyle(
                              color: Color(0xFF00D4AA),
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: stats.slaCompliancePercent / 100,
                          minHeight: 8,
                          backgroundColor: Colors.white.withAlpha(15),
                          valueColor: const AlwaysStoppedAnimation(
                            Color(0xFF00D4AA),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (stats != null &&
                  (stats.hasCompanyInsights || auth.hasCoordinatorCompany)) ...[
                const SizedBox(height: 16),
                _CompanyInsightsBlock(
                  l10n: l10n,
                  stats: stats,
                  coordinatorSession: auth.hasCoordinatorCompany,
                ),
              ],
              Builder(
                builder: (context) {
                  final dash = provider.companyDashboard;
                  if (dash == null) {
                    return const SizedBox.shrink();
                  }
                  return Column(
                    children: [
                      const SizedBox(height: 16),
                      _CompanyDashboardApiBlock(l10n: l10n, summary: dash),
                    ],
                  );
                },
              ),
              ResponsiveStatsGrid(
                spacing: 12,
                children: [
                  StatsCard(
                    label: l10n.t('within_sla'),
                    value: '${stats?.withinSla ?? 0}',
                    icon: Icons.check_circle_outline_rounded,
                    color: const Color(0xFF4ADE80),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('within_sla'),
                          tickets: provider.ticketsWithinSla,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('out_of_sla'),
                    value: '${stats?.outOfSla ?? 0}',
                    icon: Icons.warning_amber_rounded,
                    color: const Color(0xFFFF4757),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('out_of_sla'),
                          tickets: provider.ticketsOutOfSla,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('total_tickets'),
                    value: '${stats?.total ?? 0}',
                    icon: Icons.assignment_rounded,
                    color: const Color(0xFF6C63FF),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('total_tickets'),
                          tickets: provider.tickets,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('section_active'),
                    value:
                        '${(provider.onSiteTickets.length + provider.inProgressTickets.length)}',
                    icon: Icons.play_circle_outline_rounded,
                    color: const Color(0xFF00D4AA),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('section_active'),
                          tickets: provider.activeTickets,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('total_maintenance_time'),
                    value: _formatTotalInspectionHours(
                      provider.totalMaintenanceHoursCompleted,
                    ),
                    icon: Icons.handyman_outlined,
                    color: const Color(0xFF818CF8),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('total_maintenance_time'),
                          tickets: provider.completedMaintenanceTickets,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('section_pending'),
                    value: '${provider.pendingTickets.length}',
                    icon: Icons.hourglass_empty_rounded,
                    color: const Color(0xFFFBBF24),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('section_pending'),
                          tickets: provider.pendingTickets,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF6C63FF).withAlpha(20),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFF6C63FF).withAlpha(40),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6C63FF).withAlpha(30),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.timer_rounded,
                        color: Color(0xFF8B83FF),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.t('total_inspection_time'),
                            style: TextStyle(
                              color: Colors.white.withAlpha(180),
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _formatTotalInspectionHours(
                              provider.totalInspectionHours,
                            ),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (inspection != null) ...[
                const SizedBox(height: 28),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    l10n.t('inspection_results'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                ResponsiveStatsGrid(
                  spacing: 12,
                  children: [
                    StatsCard(
                      label: l10n.t('accepted'),
                      value: '${inspection.accepted}',
                      icon: Icons.thumb_up_rounded,
                      color: const Color(0xFF4ADE80),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => FilteredTicketsScreen(
                            title: l10n.t('accepted'),
                            tickets: provider.ticketsAccepted,
                          ),
                        ),
                      ),
                    ),
                    StatsCard(
                      label: l10n.t('ncr'),
                      value: '${inspection.ncr}',
                      icon: Icons.report_problem_rounded,
                      color: const Color(0xFFFF4757),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => FilteredTicketsScreen(
                            title: l10n.t('ncr'),
                            tickets: provider.ncrTickets,
                          ),
                        ),
                      ),
                    ),
                    StatsCard(
                      label: l10n.t('with_comments'),
                      value: '${inspection.acceptedWithComments}',
                      icon: Icons.chat_bubble_rounded,
                      color: const Color(0xFF00D4AA),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => FilteredTicketsScreen(
                            title: l10n.t('with_comments'),
                            tickets: provider.ticketsAcceptedWithComments,
                          ),
                        ),
                      ),
                    ),
                    StatsCard(
                      label: l10n.t('not_accepted'),
                      value: '${inspection.notAccepted}',
                      icon: Icons.cancel_rounded,
                      color: const Color(0xFFFBBF24),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => FilteredTicketsScreen(
                            title: l10n.t('not_accepted'),
                            tickets: provider.ticketsNotAccepted,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

// ─── Technician Stats (simplified: total, over SLA, conflicted) ───
class _TechnicianStatsContent extends StatelessWidget {
  final AppLocalizations l10n;

  const _TechnicianStatsContent({required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Consumer2<TicketsProvider, ConflictsProvider>(
      builder: (context, ticketsProvider, conflictsProvider, _) {
        final stats = ticketsProvider.stats;
        final totalTickets = stats?.total ?? ticketsProvider.tickets.length;
        final overSla = stats?.outOfSla ?? ticketsProvider.ticketsOutOfSla.length;
        final conflictedCount = conflictsProvider.conflicts.length;

        return RefreshIndicator(
          onRefresh: () async {
            await ticketsProvider.fetchTickets();
            await ticketsProvider.fetchStats();
            await conflictsProvider.fetchConflicts();
            if (!context.mounted) return;
            final pc = context.read<PrivateCompanyProvider>();
            if (pc.hasWorkspace && pc.isApproved) {
              await refreshWorkspaceFieldStaffAnalytics(context);
            }
          },
          color: const Color(0xFF6C63FF),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ShaderMask(
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                  ).createShader(bounds),
                  child: Text(
                    l10n.t('nav_analytics'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              ResponsiveStatsGrid(
                spacing: 12,
                children: [
                  StatsCard(
                    label: l10n.t('total_tickets'),
                    value: '$totalTickets',
                    icon: Icons.assignment_rounded,
                    color: const Color(0xFF6C63FF),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('total_tickets'),
                          tickets: ticketsProvider.tickets,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('out_of_sla'),
                    value: '$overSla',
                    icon: Icons.warning_amber_rounded,
                    color: const Color(0xFFFF4757),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('out_of_sla'),
                          tickets: ticketsProvider.ticketsOutOfSla,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('conflicted_tickets'),
                    value: '$conflictedCount',
                    icon: Icons.gavel_rounded,
                    color: const Color(0xFFFBBF24),
                    onTap: conflictedCount > 0
                        ? () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ConflictsScreen(),
                              ),
                            )
                        : null,
                  ),
                  StatsCard(
                    label: l10n.t('total_maintenance_time'),
                    value: _StatsTab._formatTotalInspectionHours(
                      ticketsProvider.totalMaintenanceHoursCompleted,
                    ),
                    icon: Icons.handyman_outlined,
                    color: const Color(0xFF818CF8),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('total_maintenance_time'),
                          tickets: ticketsProvider.completedMaintenanceTickets,
                        ),
                      ),
                    ),
                  ),
                  StatsCard(
                    label: l10n.t('section_pending'),
                    value: '${ticketsProvider.pendingTickets.length}',
                    icon: Icons.hourglass_empty_rounded,
                    color: const Color(0xFFFBBF24),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FilteredTicketsScreen(
                          title: l10n.t('section_pending'),
                          tickets: ticketsProvider.pendingTickets,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const WorkspaceFieldStaffAnalyticsPanel(),
            ],
          ),
        );
      },
    );
  }
}

// ─── Company Tab (owner / coordinator / admin) ───
class _CompanyTab extends StatelessWidget {
  const _CompanyTab();

  @override
  Widget build(BuildContext context) {
    return const CompanyProvisorHubScreen(embedded: true);
  }
}

// ─── Conflicts Tab ───
class _ConflictsTab extends StatelessWidget {
  const _ConflictsTab();

  @override
  Widget build(BuildContext context) {
    return const ConflictsScreen(embedded: true);
  }
}

// ─── Profile Tab ───
class _ProfileTab extends StatelessWidget {
  const _ProfileTab();

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthProvider, LocaleProvider>(
      builder: (context, auth, localeProv, _) {
        final l10n = AppLocalizations.of(context);
        final user = auth.user;
        if (user == null) return const SizedBox.shrink();

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: [
            const SizedBox(height: 20),
            Center(
              child: Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF6C63FF).withAlpha(60),
                      blurRadius: 30,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    (user.name ?? user.username).substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 36,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Center(
              child: Text(
                user.name ?? user.username,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (user.company != null) ...[
              const SizedBox(height: 4),
              Center(
                child: Text(
                  user.company!,
                  style: TextStyle(
                    color: Colors.white.withAlpha(100),
                    fontSize: 14,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 32),
            _profileRow(
              context,
              Icons.person_outline_rounded,
              l10n.t('profile_username'),
              user.username,
              const Color(0xFF6C63FF),
              copyValue: user.username,
            ),
            _profileRow(
              context,
              Icons.phone_outlined,
              l10n.t('profile_phone'),
              user.phone ?? '-',
              const Color(0xFF00D4AA),
            ),
            _profileRow(
              context,
              Icons.verified_outlined,
              l10n.t('profile_status'),
              user.status,
              const Color(0xFF4ADE80),
            ),
            _profileRow(
              context,
              Icons.business_rounded,
              l10n.t('profile_role'),
              requesterRoleLabel(l10n, user.role),
              const Color(0xFFFBBF24),
            ),
            const SizedBox(height: 12),
            const PersonalCompanyUpgradeCard(),
            const TicketApiAccessCard(),
            _languageRow(context, l10n, localeProv),
            const SizedBox(height: 12),
            _updatePasswordRow(context, l10n),
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFFFF6B6B).withAlpha(70),
                ),
              ),
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  onTap: () => confirmScheduleAccountDeletion(context, auth),
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.delete_forever_rounded,
                          color: Color(0xFFFF6B6B),
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          l10n.t('delete_account_button'),
                          style: TextStyle(
                            color: const Color(0xFFFF6B6B).withAlpha(220),
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFFFF4757).withAlpha(60),
                ),
              ),
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  onTap: () => auth.logout(),
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.logout_rounded,
                          color: Color(0xFFFF4757),
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          l10n.t('sign_out'),
                          style: TextStyle(
                            color: const Color(0xFFFF4757).withAlpha(220),
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Center(
              child: Text(
                l10n.t('app_version'),
                style: TextStyle(
                  color: Colors.white.withAlpha(40),
                  fontSize: 12,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _updatePasswordRow(BuildContext context, AppLocalizations l10n) {
    return Material(
      color: const Color(0xFF12122A),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: () => showUpdatePasswordSheet(context),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF00D4AA).withAlpha(15)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF00D4AA).withAlpha(20),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.lock_reset_rounded,
                  color: Color(0xFF00D4AA),
                  size: 20,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('update_password'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(80),
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      l10n.t('update_password_hint'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 14,
                color: Colors.white.withAlpha(100),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _languageRow(
    BuildContext context,
    AppLocalizations l10n,
    LocaleProvider localeProv,
  ) {
    final code = localeProv.locale.languageCode;
    final langKey = 'lang_$code';
    return Material(
      color: const Color(0xFF12122A),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: () => showLanguageSelector(context),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF6C63FF).withAlpha(15)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF6C63FF).withAlpha(20),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.language_rounded,
                  color: Color(0xFF6C63FF),
                  size: 20,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('language'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(80),
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      l10n.t(langKey),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 14,
                color: Colors.white.withAlpha(100),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profileRow(
    BuildContext context,
    IconData icon,
    String label,
    String value,
    Color color, {
    String? copyValue,
  }) {
    final ml = MaterialLocalizations.of(context);
    final snackL10n = AppLocalizations.of(context);
    final canCopy =
        copyValue != null && copyValue.isNotEmpty;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withAlpha(15)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withAlpha(20),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: Colors.white.withAlpha(80),
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (canCopy)
            IconButton(
              tooltip: ml.copyButtonLabel,
              icon: Icon(
                Icons.copy_rounded,
                color: Colors.white.withAlpha(120),
                size: 20,
              ),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: copyValue));
                ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                  SnackBar(
                    content: Text(snackL10n.t('copied_to_clipboard')),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
