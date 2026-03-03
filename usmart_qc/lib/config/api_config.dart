class ApiConfig {
  static const String baseUrl = 'https://www.usmart-iot.com';

  static const String login = '/api/auth/requester-login';
  static const String me = '/api/auth/requester-me';
  static const String updateProfile = '/api/auth/requester-update';
  static const String logout = '/api/auth/requester-logout';
  static const String requesterRole = '/api/auth/requester-role';
  static const String provinceFilter = '/api/auth/requester-province-filter';

  static const String tickets = '/api/tickets';
  static String ticketDetail(String id) => '/api/tickets/$id';
  static String ticketStatus(String id) => '/api/tickets/$id/status';
  static String ticketAssign(String id) => '/api/tickets/$id/assign';
  static String ticketComplete(String id) => '/api/tickets/$id/complete';
  static String ncrResubmit(String id) => '/api/tickets/$id/ncr-resubmit';
  static String ncrEngineerResponse(String id) => '/api/tickets/$id/ncr-engineer-response';
  static String ticketComments(String id) => '/api/tickets/$id/comments';
  static String ticketEvidence(String id) => '/api/tickets/$id/evidence';
  static const String ticketStats = '/api/tickets/stats';
  static const String inspectionChecklists = '/api/inspection-checklists';
  static const String uploadTicketAttachment = '/api/upload/ticket-attachment';

  // Conflicts (company/admin only)
  static const String conflicts = '/api/conflicts';
  static String conflictDetail(String id) => '/api/conflicts/$id';
  static String ticketReportConflict(String id) => '/api/tickets/$id/report-conflict';

  static const String sites = '/api/sites';
  static String siteDetail(String id) => '/api/sites/$id';

  static const String notifications = '/api/notifications';
  static const String notificationCount = '/api/notifications/count';
  static String notificationMarkRead(String id) => '/api/notifications/$id';

  // Registration requests (public, no auth)
  static const String registrationRequests = '/api/registration-requests';
  static const String uploadRegistrationEvidence =
      '/api/upload/registration-evidence';

  static const String serviceSlug = 'quality-control-supervision';
  static const double geofenceRadiusMeters = 200;
  static const int autoInProgressMinutes = 10;
  static const int pollIntervalSeconds = 30;
}
