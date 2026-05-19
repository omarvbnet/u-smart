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
  static const String requesterOtpSend = '/api/auth/requester-otp/send';

  /// JSON `channel` for [requesterOtpSend]: `sms` | `whatsapp` (matches server Meta Cloud path).
  /// `--dart-define=REQUESTER_OTP_CHANNEL=sms` for Twilio SMS testing.
  static const String requesterOtpDeliveryChannel = String.fromEnvironment(
    'REQUESTER_OTP_CHANNEL',
    defaultValue: 'whatsapp',
  );

  static String get normalizedRequesterOtpDeliveryChannel {
    final c = requesterOtpDeliveryChannel.toLowerCase().trim();
    return (c == 'sms' || c == 'whatsapp') ? c : 'whatsapp';
  }
  static const String requesterOtpVerifyLogin =
      '/api/auth/requester-otp/verify-login';
  static const String requesterOtpRegister =
      '/api/auth/requester-otp/register';
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
  static const String requesterUpdate = '/api/auth/requester-update';
  static const String requesterRoleUpgrade = '/api/auth/requester-role-upgrade';
  static const String ticketApiKeyRequest = '/api/ticket-api-keys/request';

  static const String notifications = '/api/notifications';
  static String notificationMarkRead(String id) => '/api/notifications/$id';

  static const String tickets = '/api/tickets';
  static const String ticketStats = '/api/tickets/stats';
  static String ticketDetail(String id) => '/api/tickets/$id';
  static String ticketQFieldProjects(String id) => '/api/tickets/$id/qfield-projects';
  static String ticketQFieldMapPreview(String id) => '/api/tickets/$id/qfield-map-preview';
  static String ticketStatus(String id) => '/api/tickets/$id/status';
  static String ticketAssign(String id) => '/api/tickets/$id/assign';
  static String ticketMaintenanceCrew(String id) =>
      '/api/tickets/$id/maintenance-crew';
  static String ncrResubmit(String id) => '/api/tickets/$id/ncr-resubmit';
  static String ncrEngineerResponse(String id) =>
      '/api/tickets/$id/ncr-engineer-response';
  static String ticketComments(String ticketId) =>
      '/api/tickets/$ticketId/comments';
  static String ticketEvidence(String ticketId) =>
      '/api/tickets/$ticketId/evidence';
  static String ticketComplete(String ticketId) =>
      '/api/tickets/$ticketId/complete';
  static String ticketMaintenanceConfirmCompletion(String ticketId) =>
      '/api/tickets/$ticketId/maintenance-confirm-completion';
  static String ticketMaintenanceRejectCompletion(String ticketId) =>
      '/api/tickets/$ticketId/maintenance-reject-completion';
  static String ticketReportConflict(String ticketId) =>
      '/api/tickets/$ticketId/report-conflict';
  static String ticketResubmit(String ticketId) =>
      '/api/tickets/$ticketId/resubmit';
  static String ticketRequestEdit(String ticketId) =>
      '/api/tickets/$ticketId/request-edit';
  static String ticketRequesterEdit(String ticketId) =>
      '/api/tickets/$ticketId/requester-edit';
  static String ticketCancellationRequest(String ticketId) =>
      '/api/tickets/$ticketId/cancellation-request';
  static String ticketCancellationRespond(String ticketId) =>
      '/api/tickets/$ticketId/cancellation-respond';

  static const String inspectionChecklists = '/api/inspection-checklists';
  static String inspectionChecklistDetail(String id) => '/api/inspection-checklists/$id';
  static String ticketChecklistTemplate(String ticketId) =>
      '/api/tickets/$ticketId/checklist-template';
  static const String uploadTicketAttachment = '/api/upload/ticket-attachment';
  static const String uploadTicketQfield = '/api/upload/ticket-qfield';

  static const String conflicts = '/api/conflicts';
  static String conflictDetail(String id) => '/api/conflicts/$id';

  static const String sites = '/api/sites';
  static String siteDetail(String id) => '/api/sites/$id';
  static String siteShare(String siteDbId) => '/api/sites/$siteDbId/share';
  static String siteVisitorLink(String siteDbId) => '/api/sites/$siteDbId/visitor-link';

  static const String registrationRequests = '/api/registration-requests';
  static const String companyRequests = '/api/company-requests';
  static const String uploadRegistrationEvidence =
      '/api/upload/registration-evidence';

  static const String otpEmailSend = '/api/otp/email/send';
  static const String otpEmailVerify = '/api/otp/email/verify';
  static const String otpSend = '/api/otp/send';
  static const String otpVerify = '/api/otp/verify';

  static const String provisorTechniques = '/api/provisor-techniques';
  static const String provisorTicketPolicy = '/api/provisor-ticket-policy';

  static const String companyStaff = '/api/company/staff';
  static const String companyBillingPlan = '/api/company/billing/plan';
  static const String companyDashboard = '/api/company/dashboard';

  // ── Private Company workspace (mobile-first feature) ─────────────────────
  static const String privateCompany = '/api/provisor-private-company';
  static const String privateCompanyDepartments = '/api/provisor-private-company/departments';
  static const String privateCompanyStaff = '/api/provisor-private-company/staff';
  static const String privateCompanyChecklists = '/api/provisor-private-company/checklists';
  static String privateCompanyChecklistDetail(String id) =>
      '/api/provisor-private-company/checklists/$id';
  static const String privateCompanyTechniques = '/api/provisor-private-company/techniques';
  static String privateCompanyTechniqueDetail(String id) =>
      '/api/provisor-private-company/techniques/$id';
  static const String privateCompanyNotifications = '/api/provisor-private-company/notifications';
  static const String privateCompanyKpis = '/api/provisor-private-company/kpis';
  static const String privateCompanyConflicts = '/api/provisor-private-company/conflicts';
  static const String privateCompanySiteArrivalCheck =
      '/api/provisor-private-company/site-arrival/check';
  static const String privateCompanySites = '/api/provisor-private-company/sites';
  static String privateCompanySiteDetail(String id) =>
      '/api/provisor-private-company/sites/$id';
  static String privateCompanySiteConfirm(String id) =>
      '/api/provisor-private-company/sites/$id/confirm';
  static const String privateCompanyExpenseSettings =
      '/api/provisor-private-company/expenses/settings';
  static const String privateCompanyExpenses =
      '/api/provisor-private-company/expenses';
  static const String privateCompanyExpensesExport =
      '/api/provisor-private-company/expenses/export';
  static const String privateCompanyExpensesAnalytics =
      '/api/provisor-private-company/expenses/analytics';
  static String privateCompanyExpenseDetail(String id) =>
      '/api/provisor-private-company/expenses/$id';
  static const String privateCompanyCancellationSettings =
      '/api/provisor-private-company/cancellations/settings';
  static const String privateCompanyCancellationsAnalytics =
      '/api/provisor-private-company/cancellations/analytics';
  static const String privateCompanyExport = '/api/provisor-private-company/export';

  // ── Private Company warehouse / materials ────────────────────────────────
  static const String privateCompanyWarehouseMaterials =
      '/api/provisor-private-company/warehouse/materials';
  static const String privateCompanyWarehouseMaterialsImport =
      '/api/provisor-private-company/warehouse/materials/import';
  static const String privateCompanyWarehouseItems =
      '/api/provisor-private-company/warehouse/items';
  static String privateCompanyWarehouseItemDetail(String id) =>
      '/api/provisor-private-company/warehouse/items/$id';
  static const String privateCompanyWarehouseConsumeOnTicket =
      '/api/provisor-private-company/warehouse/consume-on-ticket';
  static const String privateCompanyWarehouseMyHeldMaterials =
      '/api/provisor-private-company/warehouse/my-held-materials';
  static const String privateCompanyWarehouseDashboard =
      '/api/provisor-private-company/warehouse/dashboard';
  static const String privateCompanyWarehouseProvinceInventory =
      '/api/provisor-private-company/warehouse/province-inventory';
  static const String privateCompanyWarehouseActivity =
      '/api/provisor-private-company/warehouse/activity';
  static const String privateCompanyWarehouseStaffMaterialBudgets =
      '/api/provisor-private-company/warehouse/staff-material-budgets';
  static const String privateCompanyWarehouseTicketMaterialSummary =
      '/api/provisor-private-company/warehouse/ticket-material-summary';
  static const String privateCompanyWarehouseKeeperTracking =
      '/api/provisor-private-company/warehouse/keeper-tracking';
  static const String privateCompanyWarehouseToolsExport =
      '/api/provisor-private-company/warehouse/tools/export';
  static const String privateCompanyWarehouseMaterialsExport =
      '/api/provisor-private-company/warehouse/materials/export';
  static const String privateCompanyWarehouseStaffSearch =
      '/api/provisor-private-company/warehouse/staff-search';
  static const String privateCompanyWarehouseMaterialUseReasons =
      '/api/provisor-private-company/warehouse/material-use-reasons';
  static const String privateCompanyWarehouseRequests =
      '/api/provisor-private-company/warehouse/requests';
  static String privateCompanyWarehouseRequestDetail(String id) =>
      '/api/provisor-private-company/warehouse/requests/$id';

  static String publicTicketPage(String id) => '/en/ticket/$id';
}
