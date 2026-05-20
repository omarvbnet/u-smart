import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import 'ticket_status_filter.dart';

/// Builds ticket list sections with a dedicated "Assigned" group (awaiting on site).
List<({String title, List<Ticket> tickets, int color})> buildTicketListSections(
  List<Ticket> filtered,
  AppLocalizations l10n, {
  String? currentUserId,
  bool highlightMineInAssigned = false,
}) {
  final assigned = filtered.where((t) {
    if (!t.isAssignedAwaitingArrival) return false;
    if (!highlightMineInAssigned || currentUserId == null) return true;
    return ticketIsMine(t, currentUserId);
  }).toList();

  final pendingPool = filtered
      .where((t) => t.isPending && !t.isAssigned)
      .toList();
  final onSite = filtered.where((t) => t.isOnSite).toList();
  final inProgress = filtered.where((t) => t.isInProgress).toList();
  final completed = filtered.where((t) => t.isCompleted).toList();
  final cancelled = filtered.where((t) => t.isCancelled).toList();

  final out = <({String title, List<Ticket> tickets, int color})>[];
  if (assigned.isNotEmpty) {
    out.add((
      title: l10n.t('status_assigned'),
      tickets: assigned,
      color: 0xFF8B83FF,
    ));
  }
  if (pendingPool.isNotEmpty) {
    out.add((
      title: l10n.t('section_pending'),
      tickets: pendingPool,
      color: 0xFFFBBF24,
    ));
  }
  if (onSite.isNotEmpty) {
    out.add((
      title: l10n.t('section_on_site'),
      tickets: onSite,
      color: 0xFF6C63FF,
    ));
  }
  if (inProgress.isNotEmpty) {
    out.add((
      title: l10n.t('section_in_progress'),
      tickets: inProgress,
      color: 0xFF00D4AA,
    ));
  }
  if (completed.isNotEmpty) {
    out.add((
      title: l10n.t('section_completed'),
      tickets: completed,
      color: 0xFF4ADE80,
    ));
  }
  if (cancelled.isNotEmpty) {
    out.add((
      title: l10n.t('section_cancelled'),
      tickets: cancelled,
      color: 0xFFFF6B81,
    ));
  }
  return out;
}
