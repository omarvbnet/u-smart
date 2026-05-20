import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../l10n/app_localizations.dart';
import '../providers/notifications_provider.dart';
import 'ticket_detail_screen.dart';
import 'conflict_detail_screen.dart';
import '../providers/private_company_provider.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          l10n.t('notifications'),
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Consumer<NotificationsProvider>(
        builder: (context, provider, _) {
          final items = provider.notifications;

          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.notifications_off_outlined,
                      size: 56, color: Colors.white.withAlpha(30)),
                  const SizedBox(height: 12),
                  Text(
                    l10n.t('no_notifications'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(80),
                      fontSize: 15,
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => provider.refresh(),
            color: const Color(0xFF6C63FF),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final n = items[index];
                return _NotificationTile(notification: n);
              },
            ),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final AppNotification notification;
  const _NotificationTile({required this.notification});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, h:mm a');
    final isUrgentAssign = notification.type == 'ticket_assigned_urgent';
    final isNew = notification.type == 'new_ticket';
    final accent = isUrgentAssign
        ? const Color(0xFFFF4757)
        : (isNew ? const Color(0xFF6C63FF) : const Color(0xFF00D4AA));

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: () {
          if (!notification.read) {
            context
                .read<NotificationsProvider>()
                .markAsRead(notification.id);
          }
          final ticketId = notification.ticketId;
          if (ticketId != null) {
            if (notification.type == 'workspace_conflict_reported') {
              final pc = context.read<PrivateCompanyProvider>();
              if (pc.canManageWorkspaceConflicts) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ConflictDetailScreen(conflictId: ticketId),
                  ),
                );
                return;
              }
            }
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => TicketDetailScreen(ticketId: ticketId),
              ),
            );
          }
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: notification.read
                    ? Colors.white.withAlpha(3)
                    : accent.withAlpha(8),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: notification.read
                      ? Colors.white.withAlpha(8)
                      : accent.withAlpha(30),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: accent.withAlpha(20),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      isUrgentAssign
                          ? Icons.priority_high_rounded
                          : (isNew
                              ? Icons.add_circle_outline_rounded
                              : Icons.sync_rounded),
                      color: accent,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                notification.title,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: notification.read
                                      ? FontWeight.w500
                                      : FontWeight.w700,
                                ),
                              ),
                            ),
                            if (!notification.read)
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: accent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          notification.message,
                          style: TextStyle(
                            color: Colors.white.withAlpha(120),
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          fmt.format(notification.createdAt.toLocal()),
                          style: TextStyle(
                            color: Colors.white.withAlpha(50),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
