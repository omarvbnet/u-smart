import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import 'status_badge.dart';

class TicketCard extends StatelessWidget {
  final Ticket ticket;
  final VoidCallback? onTap;
  final VoidCallback? onAssign;
  /// Requester must not see Assign to Me; pass false for company dashboard.
  final bool showAssignToMe;

  const TicketCard({
    super.key,
    required this.ticket,
    this.onTap,
    this.onAssign,
    this.showAssignToMe = true,
  });

  Color get _accentColor {
    switch (ticket.status.toUpperCase()) {
      case 'PENDING':
        return const Color(0xFFFBBF24);
      case 'ON_SITE':
        return const Color(0xFF6C63FF);
      case 'IN_PROGRESS':
        return const Color(0xFF00D4AA);
      case 'COMPLETED':
        return const Color(0xFF4ADE80);
      default:
        return const Color(0xFF6B7280);
    }
  }

  String _techniqueKey(String t) {
    final lower = t.toLowerCase();
    final upper = t.toUpperCase().replaceAll(' ', '_');
    if (lower == 'fiber_route') return 'maint_fiber_route';
    if (lower == 'fiber_site') return 'maint_fiber_site';
    if (lower == 'electrical') return 'maint_electrical';
    if (lower == 'telecom') return 'maint_telecom';
    if (lower == 'ftth') return 'maint_ftth';
    if (upper.contains('INSPECTION')) return 'tech_inspection';
    if (upper.contains('SUPERVISION')) return 'tech_supervision';
    if (upper.contains('HSE')) return 'tech_hse';
    if (upper.contains('INVESTIGATION')) return 'tech_investigation';
    if (upper.contains('TRACKING')) return 'tech_tracking';
    return 'tech_inspection';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF12122A),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _accentColor.withAlpha(30)),
          boxShadow: [
            BoxShadow(
              color: _accentColor.withAlpha(12),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            // Top accent line
            Container(
              height: 3,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [_accentColor, _accentColor.withAlpha(0)],
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _accentColor.withAlpha(20),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.location_on_rounded,
                            color: _accentColor, size: 18),
                      ),
                      const SizedBox(width: 12),
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
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (ticket.siteCoordinator != null)
                              Text(
                                ticket.siteCoordinator!,
                                style: TextStyle(
                                  color: Colors.white.withAlpha(120),
                                  fontSize: 12,
                                ),
                              ),
                          ],
                        ),
                      ),
                      StatusBadge(status: ticket.status, localizations: l10n),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      _chip(Icons.build_outlined,
                          l10n.t(_techniqueKey(ticket.technique))),
                      _chip(
                          Icons.access_time_rounded,
                          DateFormat('MMM d, HH:mm')
                              .format(ticket.createdAt)),
                      if (ticket.slaHours != null)
                        _chip(Icons.schedule, '${ticket.slaHours}${l10n.t('h_sla')}'),
                      if (ticket.isCompleted && ticket.inspectionHours != null)
                        _chip(Icons.timer_rounded,
                            _formatInspectionHours(ticket.inspectionHours!)),
                      if (ticket.isAssigned)
                        _chip(
                          Icons.person,
                          ticket.assignedEngineerName != null
                              ? (ticket.assignedEngineerId != null
                                  ? '${ticket.assignedEngineerName} (ID: ${_shortId(ticket.assignedEngineerId!)})'
                                  : ticket.assignedEngineerName!)
                              : (ticket.assignedEngineerId != null
                                  ? l10n.t('engineer_id', {'id': _shortId(ticket.assignedEngineerId!)})
                                  : l10n.t('assigned')),
                        ),
                    ],
                  ),
                  if (ticket.isNcr || ticket.canBeAssigned) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (ticket.isNcr)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  const Color(0xFFFF4757).withAlpha(50),
                                  const Color(0xFFFF4757).withAlpha(20),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: const Color(0x60FF4757)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.warning_rounded,
                                    color: Color(0xFFFF6B81), size: 12),
                                const SizedBox(width: 4),
                                Text(
                                  l10n.t('ncr'),
                                  style: TextStyle(
                                    color: Color(0xFFFF6B81),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const Spacer(),
                        if (showAssignToMe && ticket.canBeAssigned && onAssign != null)
                          GestureDetector(
                            onTap: onAssign,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFF6C63FF),
                                    Color(0xFF5A52E0),
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(10),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF6C63FF)
                                        .withAlpha(60),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.person_add_rounded,
                                      color: Colors.white, size: 14),
                                  const SizedBox(width: 4),
                                  Text(
                                    l10n.t('assign_to_me'),
                                    style: TextStyle(
                                      color: Colors.white,
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
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white.withAlpha(100)),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withAlpha(150),
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  String _shortId(String id) =>
      id.length > 8 ? id.substring(id.length - 8) : id;

  static String _formatInspectionHours(double h) {
    if (h < 1) return '${(h * 60).round()}m';
    return '${h.toStringAsFixed(1)}h';
  }
}
