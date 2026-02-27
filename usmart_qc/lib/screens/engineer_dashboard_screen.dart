import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/notifications_provider.dart';
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
                _navItem(Icons.inbox_rounded, 'Available'),
                _navItem(Icons.assignment_turned_in_rounded, 'My Tickets'),
                _navItem(Icons.person_rounded, 'Profile'),
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
                    child: const Text(
                      'Available',
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
                      '${available.length} pending',
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
                            ? 'Showing tickets in $engineerProvince'
                            : 'Showing all Iraq provinces',
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
                                  ? 'My Province'
                                  : 'All Iraq',
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
                  'Unassigned tickets waiting for an engineer',
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
                        'Complete your current ticket before taking a new one',
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
                      Icons.check_circle_outline_rounded,
                      'No available tickets',
                      'All tickets are assigned or completed',
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
                                    context, provider, ticket),
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
      BuildContext context, TicketsProvider provider, Ticket ticket) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Assign to Me',
            style:
                TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          'Take responsibility for "${ticket.siteName}"?',
          style: TextStyle(color: Colors.white.withAlpha(180)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: TextStyle(color: Colors.white.withAlpha(120))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child:
                const Text('Assign', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      final ok = await provider.assignTicketToMe(ticket.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:
                Text(ok ? 'Ticket assigned to you!' : 'Failed to assign'),
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

  Widget _emptyState(IconData icon, String title, String subtitle) {
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
            _Section('Active', active, const Color(0xFF00D4AA)),
          if (completed.isNotEmpty)
            _Section('Completed', completed, const Color(0xFF4ADE80)),
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
                    child: const Text(
                      'My Tickets',
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
                      '${active.length} active',
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
                          const Text('No tickets yet',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Text('Assign yourself a ticket to get started',
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
    return Consumer2<AuthProvider, TicketsProvider>(
      builder: (context, auth, tickets, _) {
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
                child: const Text(
                  'QC Engineer',
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
                _statChip('Active', '${tickets.myActiveTickets.length}',
                    const Color(0xFF00D4AA)),
                const SizedBox(width: 12),
                _statChip('Completed',
                    '${tickets.myCompletedTickets.length}',
                    const Color(0xFF4ADE80)),
              ],
            ),
            const SizedBox(height: 28),
            _profileRow(Icons.person_outline_rounded, 'Username',
                user.username, const Color(0xFF6C63FF)),
            _profileRow(Icons.phone_outlined, 'Phone',
                user.phone ?? '-', const Color(0xFF00D4AA)),
            _profileRow(Icons.location_on_outlined, 'Province',
                user.province ?? 'All Provinces', const Color(0xFFFBBF24)),
            _profileRow(Icons.verified_outlined, 'Status', user.status,
                const Color(0xFF4ADE80)),
            const SizedBox(height: 32),
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
                          'Sign Out',
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
                'Provisor v1.0.0',
                style: TextStyle(
                    color: Colors.white.withAlpha(40), fontSize: 12),
              ),
            ),
          ],
        );
      },
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
