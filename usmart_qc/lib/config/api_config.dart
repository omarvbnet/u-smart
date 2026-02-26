class ApiConfig {
  static const String baseUrl = 'https://www.usmart-iot.com';

  static const String login = '/api/auth/requester-login';
  static const String me = '/api/auth/requester-me';
  static const String updateProfile = '/api/auth/requester-update';
  static const String logout = '/api/auth/requester-logout';

  static const String tickets = '/api/tickets';
  static String ticketDetail(String id) => '/api/tickets/$id';
  static String ticketStatus(String id) => '/api/tickets/$id/status';
  static String ticketAssign(String id) => '/api/tickets/$id/assign';
  static String ncrResubmit(String id) => '/api/tickets/$id/ncr-resubmit';
  static const String ticketStats = '/api/tickets/stats';

  static const String sites = '/api/sites';
  static String siteDetail(String id) => '/api/sites/$id';

  static const String serviceSlug = 'quality-control-supervision';
  static const double geofenceRadiusMeters = 200;
  static const int autoInProgressMinutes = 10;
  static const int pollIntervalSeconds = 30;
}
