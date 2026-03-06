import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/conflicts_provider.dart';
import '../widgets/language_selector.dart';
import '../models/ticket.dart';
import '../widgets/ticket_card.dart';
import '../widgets/stats_card.dart';
import 'notifications_screen.dart';
import 'ticket_detail_screen.dart';
import 'ticket_type_picker_screen.dart';
import 'conflicts_screen.dart';
import 'site_form_screen.dart';
import 'filtered_tickets_screen.dart';

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    final tickets = context.read<TicketsProvider>();
    final conflicts = context.read<ConflictsProvider>();
    final isTechnician = context.read<AuthProvider>().isTechnician;
    final futures = [
      tickets.fetchTickets(),
      tickets.fetchStats(),
      conflicts.fetchConflicts(),
    ];
    if (!isTechnician) {
      futures.add(context.read<SitesProvider>().fetchSites());
    }
    await Future.wait(futures);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isTechnician = context.read<AuthProvider>().isTechnician;
    final tabChildren = isTechnician
        ? const [_TicketsTab(), _StatsTab(), _ConflictsTab(), _ProfileTab()]
        : const [_TicketsTab(), _SitesTab(), _StatsTab(), _ConflictsTab(), _ProfileTab()];
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
              index: _currentTab.clamp(0, tabChildren.length - 1),
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
              currentIndex: _currentTab.clamp(0, (isTechnician ? 3 : 4)),
              onTap: (i) => setState(() => _currentTab = i),
              type: BottomNavigationBarType.fixed,
              backgroundColor: Colors.transparent,
              selectedItemColor: const Color(0xFF6C63FF),
              unselectedItemColor: const Color(0xFF4B5563),
              selectedFontSize: 10,
              unselectedFontSize: 10,
              elevation: 0,
              items: isTechnician
                  ? [
                      _navItem(Icons.assignment_rounded, l10n.t('nav_tickets')),
                      _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
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
      floatingActionButton: _currentTab == 0 &&
              !context.read<AuthProvider>().isTechnician
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
                onPressed: () {
                  showNewTicketTypePicker(context);
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
class _TicketsTab extends StatelessWidget {
  const _TicketsTab();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer<TicketsProvider>(
      builder: (context, provider, _) {
        if (provider.loading && provider.tickets.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        final sections = <_TicketSection>[
          if (provider.pendingTickets.isNotEmpty)
            _TicketSection(
              l10n.t('section_pending'),
              provider.pendingTickets,
              const Color(0xFFFBBF24),
            ),
          if (provider.onSiteTickets.isNotEmpty)
            _TicketSection(
              l10n.t('section_on_site'),
              provider.onSiteTickets,
              const Color(0xFF6C63FF),
            ),
          if (provider.inProgressTickets.isNotEmpty)
            _TicketSection(
              l10n.t('section_in_progress'),
              provider.inProgressTickets,
              const Color(0xFF00D4AA),
            ),
          if (provider.completedTickets.isNotEmpty)
            _TicketSection(
              l10n.t('section_completed'),
              provider.completedTickets,
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
                        'count': '${provider.tickets.length}',
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
            const SizedBox(height: 12),
            Expanded(
              child: sections.isEmpty
                  ? _emptyState(context, l10n)
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

  Widget _emptyState(BuildContext context, AppLocalizations l10n) {
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
            l10n.t('no_tickets'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.t('create_first_ticket'),
            style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 14),
          ),
        ],
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
class _SitesTab extends StatelessWidget {
  const _SitesTab();

  Future<void> _confirmDelete(
    BuildContext context,
    SitesProvider provider,
    site,
    AppLocalizations l10n,
  ) async {
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
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
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
                              const SizedBox(height: 24),
                              ElevatedButton.icon(
                                onPressed: () => Navigator.of(context)
                                    .push(
                                      MaterialPageRoute(
                                        builder: (_) => const SiteFormScreen(),
                                      ),
                                    )
                                    .then((_) => provider.fetchSites()),
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
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: provider.fetchSites,
                          color: const Color(0xFF6C63FF),
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                            itemCount: provider.sites.length,
                            itemBuilder: (context, index) {
                              final site = provider.sites[index];
                              return Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF12122A),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: Colors.white.withAlpha(10),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: [
                                            const Color(
                                              0xFF6C63FF,
                                            ).withAlpha(30),
                                            const Color(
                                              0xFF00D4AA,
                                            ).withAlpha(15),
                                          ],
                                        ),
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: const Icon(
                                        Icons.location_on_rounded,
                                        color: Color(0xFF8B83FF),
                                        size: 22,
                                      ),
                                    ),
                                    const SizedBox(width: 14),
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
                                            '${site.qualityControlCount} ${l10n.t('qc_tickets')}',
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
                                          onPressed: () => Navigator.of(context)
                                              .push(
                                                MaterialPageRoute(
                                                  builder: (_) =>
                                                      SiteFormScreen(
                                                        site: site,
                                                      ),
                                                ),
                                              )
                                              .then(
                                                (_) => provider.fetchSites(),
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
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
            Positioned(
              right: 20,
              bottom: 24,
              child: FloatingActionButton(
                onPressed: () => Navigator.of(context)
                    .push(
                      MaterialPageRoute(builder: (_) => const SiteFormScreen()),
                    )
                    .then((_) => provider.fetchSites()),
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
        final stats = provider.stats;
        final inspection = stats?.inspectionStats;
        final hasFilter = provider.dateFrom != null || provider.dateTo != null;

        return RefreshIndicator(
          onRefresh: () async {
            await provider.fetchStats();
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
                      child: ElevatedButton.icon(
                        onPressed: provider.exporting
                            ? null
                            : () async {
                                final path = await provider
                                    .exportTicketsExcel();
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
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.2,
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
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.2,
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
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.2,
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
                ],
              ),
            ],
          ),
        );
      },
    );
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
              Icons.person_outline_rounded,
              l10n.t('profile_username'),
              user.username,
              const Color(0xFF6C63FF),
            ),
            _profileRow(
              Icons.phone_outlined,
              l10n.t('profile_phone'),
              user.phone ?? '-',
              const Color(0xFF00D4AA),
            ),
            _profileRow(
              Icons.verified_outlined,
              l10n.t('profile_status'),
              user.status,
              const Color(0xFF4ADE80),
            ),
            _profileRow(
              Icons.business_rounded,
              l10n.t('profile_role'),
              l10n.t('role_company'),
              const Color(0xFFFBBF24),
            ),
            const SizedBox(height: 12),
            _languageRow(context, l10n, localeProv),
            const SizedBox(height: 20),
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

  Widget _profileRow(IconData icon, String label, String value, Color color) {
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
          Column(
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
        ],
      ),
    );
  }
}
