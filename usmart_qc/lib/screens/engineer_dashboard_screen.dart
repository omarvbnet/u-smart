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
import '../widgets/ticket_card.dart';
import 'ticket_detail_screen.dart';
import 'notifications_screen.dart';

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    final tickets = context.read<TicketsProvider>();
    await Future.wait([
      tickets.fetchTickets(),
      tickets.loadProvinceFilter(),
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
                _AvailableTicketsTab(),
                _MyTicketsTab(),
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
                _navItem(Icons.inbox_rounded, l10n.t('nav_available')),
                _navItem(Icons.assignment_turned_in_rounded, l10n.t('nav_my_tickets')),
                _navItem(Icons.person_rounded, l10n.t('nav_profile')),
              ],
            ),
          ),
        ),
      ),
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
class _MyTicketsTab extends StatelessWidget {
  const _MyTicketsTab();

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

        final active = provider.myActiveTickets;
        final completed = provider.myCompletedTickets;

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
                          Text(l10n.t('no_tickets'),
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Text(l10n.t('assign_first_ticket'),
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

class _Section {
  final String title;
  final List<Ticket> tickets;
  final Color color;
  _Section(this.title, this.tickets, this.color);
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
            const SizedBox(height: 20),
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
