import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import '../providers/auth_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/tickets_provider.dart';
import '../screens/notifications_screen.dart';
import '../screens/ticket_detail_screen.dart';
import 'ticket_card.dart';

/// PENDING + unassigned ticket pool with optional province filter toggle.
/// Used by engineer dashboard (QC) and company dashboard (technicians in a workspace).
class AvailableTicketsPoolTab extends StatelessWidget {
  const AvailableTicketsPoolTab({super.key, this.workspaceScopeHint});

  /// Shown under the title when set (e.g. workspace department + scope reminder).
  final String? workspaceScopeHint;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer2<TicketsProvider, AuthProvider>(
      builder: (context, provider, auth, _) {
        if (provider.loading && provider.tickets.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
          );
        }

        final available = provider.availableTickets;
        final hasActive = !provider.canSelfAssignFromPool;
        final engineerProvince = provider.province;
        final filterActive = provider.provinceFilterActive;
        final isTechnician = auth.isTechnician;

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
            if (workspaceScopeHint != null &&
                workspaceScopeHint!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Text(
                  workspaceScopeHint!.trim(),
                  style: TextStyle(
                    color: Colors.white.withAlpha(150),
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 6),
            if (engineerProvince != null && engineerProvince.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        filterActive
                            ? l10n.t(
                                'showing_province', {'province': engineerProvince})
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
                  l10n.t(isTechnician
                      ? 'available_empty_technician'
                      : 'available_empty'),
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
    BuildContext context,
    TicketsProvider provider,
    Ticket ticket,
    AppLocalizations l10n,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(l10n.t('assign_to_me'),
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text(
          l10n.t('assign_take',
              {'site': ticket.siteName ?? l10n.t('unknown_site')}),
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
      final res = await provider.assignTicketToMe(ticket.id);
      if (context.mounted) {
        final msg = res.ok
            ? l10n.t('assign_success')
            : (res.message?.trim().isNotEmpty == true
                ? res.message!.trim()
                : l10n.t('assign_failed'));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor:
                res.ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Widget _emptyState(
      BuildContext context, IconData icon, String title, String subtitle) {
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
