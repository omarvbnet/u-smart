/// Backend routes for the Next.js site (`/api/...`).
/// Override host with `--dart-define=API_BASE_URL=https://your-domain.com`.
class ApiConfig {
  ApiConfig._();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://www.usmart-iot.com',
  );

  static const String serviceSlug = 'quality-control-supervision';

  static const int pollIntervalSeconds = 30;
  static const double geofenceRadiusMeters = 500;

  static const String login = '/api/auth/requester-login';
  static const String logout = '/api/auth/requester-logout';
  static const String me = '/api/auth/requester-me';
  static const String deleteAccount = '/api/auth/requester-me';
  static const String requesterRole = '/api/auth/requester-role';
  static const String forgotPassword = '/api/auth/requester-forgot-password';
  static const String resetPassword = '/api/auth/requester-reset-password';
  static const String sendChangePasswordOtp =
      '/api/auth/requester-send-change-password-otp';
  static const String changePassword = '/api/auth/requester-change-password';
  static const String provinceFilter = '/api/auth/requester-province-filter';
  static const String requesterPushToken = '/api/auth/requester-push-token';

  static const String notifications = '/api/notifications';
  static String notificationMarkRead(String id) => '/api/notifications/$id';

  static const String tickets = '/api/tickets';
  static const String ticketStats = '/api/tickets/stats';
  static String ticketDetail(String id) => '/api/tickets/$id';
  static String ticketStatus(String id) => '/api/tickets/$id/status';
  static String ticketAssign(String id) => '/api/tickets/$id/assign';
  static String ncrResubmit(String id) => '/api/tickets/$id/ncr-resubmit';
  static String ncrEngineerResponse(String id) =>
      '/api/tickets/$id/ncr-engineer-response';
  static String ticketComments(String ticketId) =>
      '/api/tickets/$ticketId/comments';
  static String ticketEvidence(String ticketId) =>
      '/api/tickets/$ticketId/evidence';
  static String ticketComplete(String ticketId) =>
      '/api/tickets/$ticketId/complete';
  static String ticketReportConflict(String ticketId) =>
      '/api/tickets/$ticketId/report-conflict';
  static String ticketResubmit(String ticketId) =>
      '/api/tickets/$ticketId/resubmit';
  static String ticketRequestEdit(String ticketId) =>
      '/api/tickets/$ticketId/request-edit';

  static const String inspectionChecklists = '/api/inspection-checklists';
  static const String uploadTicketAttachment = '/api/upload/ticket-attachment';

  static const String conflicts = '/api/conflicts';
  static String conflictDetail(String id) => '/api/conflicts/$id';

  static const String sites = '/api/sites';
  static String siteDetail(String id) => '/api/sites/$id';

  static const String registrationRequests = '/api/registration-requests';
  static const String companyRequests = '/api/company-requests';
  static const String uploadRegistrationEvidence =
      '/api/upload/registration-evidence';

  static const String otpEmailSend = '/api/otp/email/send';
  static const String otpEmailVerify = '/api/otp/email/verify';

  static const String provisorTechniques = '/api/provisor-techniques';

  static const String companyStaff = '/api/company/staff';
  static String companyStaffMember(String id) => '/api/company/staff/$id';
  static String companyStaffStatus(String id) => '/api/company/staff/$id/status';
  static const String companyBillingPlan = '/api/company/billing/plan';
  static const String companyDashboard = '/api/company/dashboard';
  static const String companyTicketsByRole = '/api/company/tickets-by-role';

  static String publicTicketPage(String id) => '/en/ticket/$id';
}
