import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/notifications_provider.dart';
import '../widgets/language_selector.dart';
import '../models/ticket.dart';
import '../models/site.dart';
import '../models/conflict.dart';
import '../widgets/ticket_card.dart';
import 'ticket_detail_screen.dart';
import 'notifications_screen.dart';
import 'site_form_screen.dart';
import 'conflict_detail_screen.dart';
import 'ticket_type_picker_screen.dart';
import '../providers/sites_provider.dart';
import '../providers/provisor_techniques_provider.dart';
import '../providers/conflicts_provider.dart';
import '../widgets/stats_card.dart';
import 'filtered_tickets_screen.dart';
import 'conflicts_screen.dart';
import '../widgets/update_password_sheet.dart';
import '../widgets/site_share_dialog.dart';

class EngineerDashboardScreen extends StatefulWidget {
  const EngineerDashboardScreen({super.key});

  @override
  State<EngineerDashboardScreen> createState() =>
      _EngineerDashboardScreenState();
}

class _EngineerDashboardScreenState extends State<EngineerDashboardScreen> {
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _loadData();
      if (!mounted) return;
      final auth = context.read<AuthProvider>();
      if (!auth.mustChangePassword) return;
      showUpdatePasswordSheet(context, mandatoryRecovery: true);
    });
  }

  Future<void> _loadData() async {
    final tickets = context.read<TicketsProvider>();
    final sites = context.read<SitesProvider>();
    final conflicts = context.read<ConflictsProvider>();
    await Future.wait([
      tickets.fetchTickets(),
      tickets.loadProvinceFilter(),
      sites.fetchSites(),
      conflicts.fetchConflicts(),
      context.read<ProvisorTechniquesProvider>().ensureLoaded(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        children: [
          Positioned(
            top: -120,
            right: -80,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [
                  const Color(0xFF6C63FF).withAlpha(25),
                  Colors.transparent,
                ]),
              ),
            ),
          ),
          SafeArea(
            child: IndexedStack(
              index: _currentTab,
              children: const [
                _EngineerInboxTab(),
                _AvailableTicketsTab(),
                _MyTicketsTab(),
                _EngineerAnalyticsTab(),
                _EngineerSitesTab(),
                _EngineerProfileTab(),
              ],
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
              currentIndex: _currentTab,
              onTap: (i) => setState(() => _currentTab = i),
              type: BottomNavigationBarType.fixed,
              backgroundColor: Colors.transparent,
              selectedItemColor: const Color(0xFF6C63FF),
              unselectedItemColor: const Color(0xFF4B5563),
              selectedFontSize: 10,
              unselectedFontSize: 10,
              elevation: 0,
              items: [
                _navItem(Icons.mail_rounded, l10n.t('nav_inbox')),
                _navItem(Icons.inbox_rounded, l10n.t('nav_available')),
                _navItem(Icons.assignment_turned_in_rounded, l10n.t('nav_my_tickets')),
                _navItem(Icons.insights_rounded, l10n.t('nav_analytics')),
                _navItem(Icons.explore_rounded, l10n.t('nav_sites')),
                _navItem(Icons.person_rounded, l10n.t('nav_profile')),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: _currentTab == 0
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
                onPressed: () => showNewTicketTypePicker(context),
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

// ─── Engineer Inbox Tab (NCR resubmits + conflicts) ───
class _EngineerInboxTab extends StatelessWidget {
  const _EngineerInboxTab();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer3<TicketsProvider, ConflictsProvider, AuthProvider>(
      builder: (context, tickets, conflicts, auth, _) {
        final ncrTickets = tickets.ticketsPendingNcrResponse;
        final currentUserId = auth.user?.id;
        final myConflicts = currentUserId == null
            ? <ConflictCase>[]
            : conflicts.pendingConflicts
                .where((c) => c.assignedEngineerId == currentUserId)
                .toList();
        final hasNcr = ncrTickets.isNotEmpty;
        final hasConflicts = myConflicts.isNotEmpty;
        final isLoading = tickets.loading && tickets.tickets.isEmpty;

        if (isLoading) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        return RefreshIndicator(
          onRefresh: () async {
            await Future.wait([
              tickets.fetchTickets(),
              conflicts.fetchConflicts(),
            ]);
          },
          color: const Color(0xFF6C63FF),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    ShaderMask(
                      shaderCallback: (bounds) => const LinearGradient(
                        colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                      ).createShader(bounds),
                      child: Text(
                        l10n.t('nav_inbox'),
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
                                builder: (_) => const NotificationsScreen()),
                          ),
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Icon(
                                Icons.notifications_outlined,
                                color: Colors.white.withAlpha(150),
                                size: 26,
                              ),
                              if (count > 0)
                                Positioned(
                                  top: -4,
                                  right: -4,
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFFF4757),
                                      shape: BoxShape.circle,
                                    ),
                                    constraints: const BoxConstraints(
                                        minWidth: 18, minHeight: 18),
                                    child: Text(
                                      count > 99 ? '99+' : '$count',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              if (!hasNcr && !hasConflicts)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(48),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.inbox_outlined,
                            size: 64, color: Colors.white.withAlpha(60)),
                        const SizedBox(height: 20),
                        Text(
                          l10n.t('inbox_empty'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(150),
                            fontSize: 16,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                )
              else ...[
                if (hasNcr) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      l10n.t('inbox_ncr_resubmits'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(140),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  ...ncrTickets.map((t) => _InboxNcrCard(ticket: t)),
                  const SizedBox(height: 20),
                ],
                if (hasConflicts) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      l10n.t('inbox_conflicts'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(140),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  ...myConflicts.map((c) => _InboxConflictCard(conflict: c)),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

class _InboxNcrCard extends StatelessWidget {
  final Ticket ticket;
  const _InboxNcrCard({required this.ticket});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => TicketDetailScreen(ticketId: ticket.id),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFF4757).withAlpha(15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x40FF4757)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFF4757).withAlpha(25),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.reply_all_rounded,
                  color: Color(0xFFFF6B81), size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ticket.siteName ?? l10n.t('unknown_site'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.t('ncr_resubmitted_from_requester'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(140),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                color: Color(0xFFFF6B81), size: 24),
          ],
        ),
      ),
    );
  }
}

class _InboxConflictCard extends StatelessWidget {
  final ConflictCase conflict;
  const _InboxConflictCard({required this.conflict});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ConflictDetailScreen(conflictId: conflict.id),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFBBF24).withAlpha(15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x40FBBF24)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFBBF24).withAlpha(25),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.gavel_rounded,
                  color: Color(0xFFFBBF24), size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conflict.siteName ?? conflict.ticketId,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.t('conflict'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(140),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                color: Color(0xFFFBBF24), size: 24),
          ],
        ),
      ),
    );
  }
}

// ─── Available Tickets Tab (PENDING + unassigned) ───
class _AvailableTicketsTab extends StatelessWidget {
  const _AvailableTicketsTab();

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

        final available = provider.availableTickets;
        final hasActive = provider.hasActiveTicket;
        final engineerProvince = provider.province;
        final filterActive = provider.provinceFilterActive;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: [
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    ).createShader(bounds),
                    child: Text(
                      l10n.t('nav_available'),
                      style: TextStyle(
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
                              builder: (_) => const NotificationsScreen()),
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
                                        minWidth: 16, minHeight: 16),
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
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFBBF24).withAlpha(20),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      l10n.t('pending_count', {'count': '${available.length}'}),
                      style: const TextStyle(
                        color: Color(0xFFFBBF24),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            if (engineerProvince != null && engineerProvince.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        filterActive
                            ? l10n.t('showing_province', {'province': engineerProvince})
                            : l10n.t('showing_all'),
                        style: TextStyle(
                            color: Colors.white.withAlpha(80),
                            fontSize: 13),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => provider.toggleProvinceFilter(),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: filterActive
                              ? const Color(0xFF6C63FF).withAlpha(25)
                              : Colors.white.withAlpha(8),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: filterActive
                                ? const Color(0xFF6C63FF).withAlpha(60)
                                : Colors.white.withAlpha(20),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              filterActive
                                  ? Icons.location_on
                                  : Icons.public,
                              size: 14,
                              color: filterActive
                                  ? const Color(0xFF6C63FF)
                                  : Colors.white.withAlpha(120),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              filterActive
                                  ? l10n.t('filter_my_province')
                                  : l10n.t('filter_all_iraq'),
                              style: TextStyle(
                                color: filterActive
                                    ? const Color(0xFF6C63FF)
                                    : Colors.white.withAlpha(120),
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  l10n.t('available_empty'),
                  style: TextStyle(
                      color: Colors.white.withAlpha(80), fontSize: 13),
                ),
              ),
            if (hasActive)
              Container(
                margin: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFBBF24).withAlpha(15),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: const Color(0xFFFBBF24).withAlpha(40)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        color: Color(0xFFFBBF24), size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        l10n.t('complete_current'),
                        style: TextStyle(
                          color: const Color(0xFFFBBF24).withAlpha(220),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Expanded(
              child: available.isEmpty
                  ? _emptyState(
                      context,
                      Icons.check_circle_outline_rounded,
                      l10n.t('no_available'),
                      l10n.t('all_assigned'),
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchTickets(),
                      color: const Color(0xFF6C63FF),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                        itemCount: available.length,
                        itemBuilder: (context, index) {
                          final ticket = available[index];
                          return TicketCard(
                            ticket: ticket,
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => TicketDetailScreen(
                                    ticketId: ticket.id),
                              ),
                            ),
                            onAssign: hasActive
                                ? null
                                : () => _assignTicket(
                                    context, provider, ticket, l10n),
                          );
                        },
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _assignTicket(
      BuildContext context, TicketsProvider provider, Ticket ticket,
      AppLocalizations l10n) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('assign_to_me'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          l10n.t('assign_take', {'site': ticket.siteName ?? l10n.t('unknown_site')}),
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
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(l10n.t('assign'),
                style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      final ok = await provider.assignTicketToMe(ticket.id);
      if (context.mounted) {
        final msg = ok ? l10n.t('assign_success') : l10n.t('assign_failed');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor:
                ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Widget _emptyState(BuildContext context, IconData icon, String title, String subtitle) {
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
            child: Icon(icon, size: 48, color: const Color(0xFF6C63FF)),
          ),
          const SizedBox(height: 20),
          Text(title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(subtitle,
              style:
                  TextStyle(color: Colors.white.withAlpha(100), fontSize: 14)),
        ],
      ),
    );
  }
}

// ─── My Tickets Tab (active + completed) ───
class _MyTicketsTab extends StatefulWidget {
  const _MyTicketsTab();

  @override
  State<_MyTicketsTab> createState() => _MyTicketsTabState();
}

class _MyTicketsTabState extends State<_MyTicketsTab> {
  final TextEditingController _searchController = TextEditingController();
  String _statusFilter = 'ALL';
  String _techniqueFilter = 'ALL';
  DateTimeRange? _dateRange;
  bool _showFilters = true;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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

  List<Ticket> _applyFilters(List<Ticket> tickets) {
    final query = _searchController.text.trim().toLowerCase();
    return tickets.where((t) {
      if (_statusFilter != 'ALL' && t.status != _statusFilter) return false;
      if (_techniqueFilter != 'ALL' && t.technique != _techniqueFilter) return false;
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
      final blob = [
        t.id,
        t.siteName ?? '',
        t.siteCoordinator ?? '',
        t.status,
        t.technique,
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
    return Consumer<TicketsProvider>(
      builder: (context, provider, _) {
        if (provider.loading && provider.tickets.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        final allMyTickets = [...provider.myActiveTickets, ...provider.myCompletedTickets];
        final statuses = <String>{
          'ALL',
          ...allMyTickets.map((t) => t.status),
        }.toList();
        final techniques = <String>{
          'ALL',
          ...allMyTickets.map((t) => t.technique),
        }.toList();
        final effectiveStatus = statuses.contains(_statusFilter) ? _statusFilter : 'ALL';
        final effectiveTechnique = techniques.contains(_techniqueFilter) ? _techniqueFilter : 'ALL';
        if (effectiveStatus != _statusFilter || effectiveTechnique != _techniqueFilter) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            setState(() {
              _statusFilter = effectiveStatus;
              _techniqueFilter = effectiveTechnique;
            });
          });
        }

        final filtered = _applyFilters(allMyTickets);
        final active = filtered.where((t) => !t.isCompleted).toList();
        final completed = filtered.where((t) => t.isCompleted).toList();

        final sections = <_Section>[
          if (active.isNotEmpty)
            _Section(l10n.t('section_active'), active, const Color(0xFF00D4AA)),
          if (completed.isNotEmpty)
            _Section(l10n.t('section_completed'), completed, const Color(0xFF4ADE80)),
        ];

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: [
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    ).createShader(bounds),
                    child: Text(
                      l10n.t('nav_my_tickets'),
                      style: TextStyle(
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
                    tooltip: 'Filters',
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF00D4AA).withAlpha(20),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      l10n.t('active_count', {'count': '${active.length}'}),
                      style: const TextStyle(
                        color: Color(0xFF00D4AA),
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
                      key: const ValueKey('my-ticket-filters'),
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
                              hintText: 'Search by site, ticket ID, requester, status, technique...',
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
                                child: _FilterDropdown(
                                  label: 'Status',
                                  value: effectiveStatus,
                                  items: statuses,
                                  onChanged: (v) => setState(() => _statusFilter = v),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _FilterDropdown(
                                  label: 'Technique',
                                  value: effectiveTechnique,
                                  items: techniques,
                                  onChanged: (v) => setState(() => _techniqueFilter = v),
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
                              _InfoPill(label: 'Matched', value: '${filtered.length}', color: const Color(0xFF00D4AA)),
                              const SizedBox(width: 8),
                              _InfoPill(label: 'Active', value: '${active.length}', color: const Color(0xFF6C63FF)),
                              const SizedBox(width: 8),
                              _InfoPill(label: 'Completed', value: '${completed.length}', color: const Color(0xFF4ADE80)),
                            ],
                          ),
                        ],
                      ),
                    ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: sections.isEmpty
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
                            child: const Icon(Icons.assignment_outlined,
                                size: 48, color: Color(0xFF6C63FF)),
                          ),
                          const SizedBox(height: 20),
                          Text(filtered.isEmpty && allMyTickets.isNotEmpty ? 'No tickets match your filters' : l10n.t('no_tickets'),
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Text(filtered.isEmpty && allMyTickets.isNotEmpty ? 'Try changing date range, status, technique, or search' : l10n.t('assign_first_ticket'),
                              style: TextStyle(
                                  color: Colors.white.withAlpha(100),
                                  fontSize: 14)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchTickets(),
                      color: const Color(0xFF6C63FF),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                        itemCount: sections.fold<int>(
                            0, (sum, s) => sum + 1 + s.tickets.length),
                        itemBuilder: (context, index) {
                          int i = 0;
                          for (final section in sections) {
                            if (index == i) {
                              return _sectionHeader(section);
                            }
                            if (index <= i + section.tickets.length) {
                              final ticket =
                                  section.tickets[index - i - 1];
                              return TicketCard(
                                ticket: ticket,
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => TicketDetailScreen(
                                        ticketId: ticket.id),
                                  ),
                                ),
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

  Widget _sectionHeader(_Section section) {
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
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
}

class _FilterDropdown extends StatelessWidget {
  final String label;
  final String value;
  final List<String> items;
  final ValueChanged<String> onChanged;

  const _FilterDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
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
                    child: Text(item == 'ALL' ? '$label: ALL' : item, overflow: TextOverflow.ellipsis),
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

class _InfoPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _InfoPill({
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

class _Section {
  final String title;
  final List<Ticket> tickets;
  final Color color;
  _Section(this.title, this.tickets, this.color);
}

// ─── Engineer Analytics Tab (total, over SLA, conflicted only) ───
class _EngineerAnalyticsTab extends StatelessWidget {
  const _EngineerAnalyticsTab();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
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
                                builder: (_) => const ConflictsScreen(),
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

// ─── Engineer Sites Tab ───
class _EngineerSitesTab extends StatelessWidget {
  const _EngineerSitesTab();

  Future<void> _confirmDelete(
    BuildContext context,
    SitesProvider provider,
    Site site,
    AppLocalizations l10n,
  ) async {
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
            content: Text(success ? l10n.t('site_deleted') : l10n.t('site_delete_failed')),
            backgroundColor:
                success ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

  String _formatDate(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  static String _fmtSiteHours(double h) {
    if (h <= 0) return '0';
    return h < 1 ? h.toStringAsFixed(2) : h.toStringAsFixed(1);
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
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF00D4AA).withAlpha(20),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.gps_fixed,
                                color: Color(0xFF00D4AA), size: 14),
                            const SizedBox(width: 4),
                            Text(
                              l10n.t('gps_count', {'count': '${provider.sitesWithCoordinates.length}'}),
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
                                child: const Icon(Icons.explore_off_rounded,
                                    size: 48, color: Color(0xFF6C63FF)),
                              ),
                              const SizedBox(height: 20),
                              Text(l10n.t('no_sites'),
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 18,
                                      fontWeight: FontWeight.w600)),
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
                                      color: Colors.white.withAlpha(10)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: [
                                            const Color(0xFF6C63FF).withAlpha(30),
                                            const Color(0xFF00D4AA).withAlpha(15),
                                          ],
                                        ),
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: const Icon(
                                          Icons.location_on_rounded,
                                          color: Color(0xFF8B83FF),
                                          size: 22),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
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
                                              color: Colors.white.withAlpha(100),
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
                                                color: Colors.white.withAlpha(50),
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
                                        if (site.canEdit) ...[
                                          IconButton(
                                            onPressed: () => Navigator.of(context)
                                                .push(MaterialPageRoute(
                                                  builder: (_) =>
                                                      SiteFormScreen(site: site),
                                                ))
                                                .then((_) =>
                                                    provider.fetchSites()),
                                            icon: const Icon(Icons.edit_rounded,
                                                color: Color(0xFF6C63FF),
                                                size: 20),
                                            tooltip: l10n.t('site_edit'),
                                          ),
                                          IconButton(
                                            onPressed: () => _confirmDelete(
                                                context,
                                                provider,
                                                site,
                                                l10n),
                                            icon: const Icon(
                                                Icons.delete_outline_rounded,
                                                color: Color(0xFFFF4757),
                                                size: 20),
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
                                                size: 20),
                                            tooltip:
                                                l10n.t('site_share_title'),
                                          ),
                                        ] else ...[
                                          IconButton(
                                            onPressed: () => Navigator.of(context)
                                                .push(MaterialPageRoute(
                                                  builder: (_) =>
                                                      SiteFormScreen(
                                                          site: site,
                                                          readOnly: true),
                                                ))
                                                .then((_) =>
                                                    provider.fetchSites()),
                                            icon: const Icon(Icons.visibility_rounded,
                                                color: Color(0xFF6C63FF),
                                                size: 20),
                                            tooltip: l10n.t('site_view_shared'),
                                          ),
                                          IconButton(
                                            onPressed: () =>
                                                _confirmRemoveShare(context,
                                                    provider, site, l10n),
                                            icon: const Icon(Icons.link_off_rounded,
                                                color: Color(0xFFFFA502),
                                                size: 20),
                                            tooltip:
                                                l10n.t('site_remove_share'),
                                          ),
                                        ],
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
                      MaterialPageRoute(
                        builder: (_) => const SiteFormScreen(),
                      ),
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
}

// ─── Engineer Profile Tab ───
class _EngineerProfileTab extends StatelessWidget {
  const _EngineerProfileTab();

  @override
  Widget build(BuildContext context) {
    return Consumer3<AuthProvider, TicketsProvider, LocaleProvider>(
      builder: (context, auth, tickets, localeProv, _) {
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
                    (user.name ?? user.username)
                        .substring(0, 1)
                        .toUpperCase(),
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
            const SizedBox(height: 4),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF00D4AA).withAlpha(20),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  l10n.t('role_engineer'),
                  style: TextStyle(
                    color: Color(0xFF00D4AA),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),
            // Quick stats
            Row(
              children: [
                _statChip(l10n.t('section_active'), '${tickets.myActiveTickets.length}',
                    const Color(0xFF00D4AA)),
                const SizedBox(width: 12),
                _statChip(l10n.t('section_completed'),
                    '${tickets.myCompletedTickets.length}',
                    const Color(0xFF4ADE80)),
              ],
            ),
            const SizedBox(height: 28),
            _profileRow(Icons.person_outline_rounded, l10n.t('profile_username'),
                user.username, const Color(0xFF6C63FF)),
            _profileRow(Icons.phone_outlined, l10n.t('profile_phone'),
                user.phone ?? '-', const Color(0xFF00D4AA)),
            _profileRow(Icons.location_on_outlined, l10n.t('profile_province'),
                user.province ?? l10n.t('all_provinces'), const Color(0xFFFBBF24)),
            _profileRow(Icons.verified_outlined, l10n.t('profile_status'), user.status,
                const Color(0xFF4ADE80)),
            const SizedBox(height: 12),
            _languageRow(context, l10n, localeProv),
            const SizedBox(height: 12),
            _updatePasswordRow(context, l10n),
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                    color: const Color(0xFFFF6B6B).withAlpha(70)),
              ),
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  onTap: () => _confirmDeleteAccount(context, auth),
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.delete_forever_rounded,
                            color: Color(0xFFFF6B6B), size: 18),
                        const SizedBox(width: 8),
                        Text(
                          'Delete my account',
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
                    color: const Color(0xFFFF4757).withAlpha(60)),
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
                        const Icon(Icons.logout_rounded,
                            color: Color(0xFFFF4757), size: 18),
                        const SizedBox(width: 8),
                        Text(
                          l10n.t('sign_out'),
                          style: TextStyle(
                            color:
                                const Color(0xFFFF4757).withAlpha(220),
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
                    color: Colors.white.withAlpha(40), fontSize: 12),
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
          margin: const EdgeInsets.only(bottom: 12),
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

  Future<void> _confirmDeleteAccount(
    BuildContext context,
    AuthProvider auth,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: const Text(
          'Delete account',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'This will permanently delete your account and related data from our server. This action cannot be undone.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Delete',
              style: TextStyle(color: Color(0xFFFF6B6B)),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    final ok = await auth.deleteAccount();
    if (!context.mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error ?? 'Failed to delete account.'),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  Widget _languageRow(BuildContext context, AppLocalizations l10n, LocaleProvider localeProv) {
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
            border: Border.all(
                color: const Color(0xFF6C63FF).withAlpha(15)),
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
                          color: Colors.white.withAlpha(80), fontSize: 11),
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

  Widget _statChip(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withAlpha(12),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: color.withAlpha(30)),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 28,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                  color: Colors.white.withAlpha(100), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _profileRow(
      IconData icon, String label, String value, Color color) {
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
              Text(label,
                  style: TextStyle(
                      color: Colors.white.withAlpha(80), fontSize: 11)),
              const SizedBox(height: 2),
              Text(value,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}
