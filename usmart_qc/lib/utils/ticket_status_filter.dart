import '../l10n/app_localizations.dart';
import '../models/ticket.dart';

/// Virtual list filter: assigned lead/crew, DB status still PENDING until on site.
const String kTicketStatusFilterAssigned = 'ASSIGNED';

List<String> ticketStatusFilterOptions(Iterable<Ticket> tickets) {
  final set = <String>{'ALL'};
  var hasAssigned = false;
  for (final t in tickets) {
    if (t.isAssignedAwaitingArrival) {
      hasAssigned = true;
      continue;
    }
    set.add(t.status.toUpperCase());
  }
  if (hasAssigned) set.add(kTicketStatusFilterAssigned);
  const order = [
    'ALL',
    kTicketStatusFilterAssigned,
    'PENDING',
    'ON_SITE',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];
  final rest = set.where((s) => !order.contains(s)).toList()..sort();
  return [...order.where(set.contains), ...rest];
}

String ticketStatusFilterLabel(AppLocalizations l10n, String status) {
  switch (status.toUpperCase()) {
    case 'ALL':
      return 'ALL';
    case kTicketStatusFilterAssigned:
      return l10n.t('status_assigned');
    case 'PENDING':
      return l10n.t('section_pending');
    case 'ON_SITE':
      return l10n.t('section_on_site');
    case 'IN_PROGRESS':
      return l10n.t('section_in_progress');
    case 'COMPLETED':
      return l10n.t('section_completed');
    case 'CANCELLED':
      return l10n.t('section_cancelled');
    default:
      return status;
  }
}

bool ticketMatchesStatusFilter(
  Ticket t,
  String statusFilter, {
  String? currentUserId,
  bool assignedToMeOnly = false,
}) {
  if (statusFilter == 'ALL') return true;
  if (statusFilter == kTicketStatusFilterAssigned) {
    if (!t.isAssignedAwaitingArrival) return false;
    if (currentUserId == null) return true;
    if (assignedToMeOnly) {
      return t.assignedEngineerId == currentUserId ||
          t.maintenanceCrewIds.contains(currentUserId);
    }
    return true;
  }
  return t.status.toUpperCase() == statusFilter.toUpperCase();
}

bool ticketIsMine(Ticket t, String? userId) {
  if (userId == null) return false;
  return t.assignedEngineerId == userId || t.maintenanceCrewIds.contains(userId);
}
