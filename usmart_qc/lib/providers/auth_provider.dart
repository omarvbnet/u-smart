import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  /// Signals invalid credentials — UI should localize with `invalid_login_credentials`.
  static const String invalidCredentialsMarker = '__INVALID_LOGIN_CREDENTIALS__';

  final AuthService _authService;
  final ApiService _apiService;
  User? _user;
  bool _loading = true;
  String? _error;
  /// From last `loginWithPhoneOtp` API body when `success` is false (e.g. `NO_ACCOUNT`).
  String? _otpVerifyFailureCode;

  AuthProvider(this._authService, this._apiService);

  User? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get loading => _loading;
  String? get error => _error;
  String? get otpVerifyFailureCode => _otpVerifyFailureCode;
  bool get isEngineer => _user?.isEngineer ?? false;
  bool get isCompany => _user?.isCompany ?? true;
  bool get isPersonal => _user?.isPersonal ?? false;
  bool get isTechnician => _user?.isTechnician ?? false;
  bool get isWorker => _user?.isWorker ?? false;
  bool get isAdmin => _user?.isAdmin ?? false;
  bool get isCoordinator => _user?.isCoordinator ?? false;
  bool get isManager => _user?.isManager ?? false;
  bool get isTeamLeader => _user?.isTeamLeader ?? false;
  bool get isCompanyOwner => _user?.isCompanyOwner ?? false;
  bool get canJoinWorkspaceTicketCrew => _user?.canJoinWorkspaceTicketCrew ?? false;
  bool get mustChangePassword => _user?.mustChangePassword ?? false;

  /// JWT + `/me` include `companyId` for coordinator-platform users (owner, coordinator, admin, technician, …).
  bool get hasCoordinatorCompany {
    final id = _user?.companyId;
    return id != null && id.isNotEmpty;
  }

  /// Company hub (staff, billing): owners, company accounts, coordinators, and platform admins.
  bool get canAccessCompanyHub {
    final role = _user?.role ?? '';
    final hub = role == 'COMPANY_OWNER' || role == 'COMPANY' || role == 'COORDINATOR' || role == 'ADMIN' || role == 'MANAGER' || role == 'TEAM_LEADER';
    return hasCoordinatorCompany && hub;
  }

  /// Coordinator-platform tasks (QC/maintenance/supervision) require checklist + category — owner/coordinator/admin only.
  bool get canCreateCoordinatorTasks =>
      hasCoordinatorCompany &&
      (isCompanyOwner ||
          isCoordinator ||
          isManager ||
          isTeamLeader ||
          (_user?.role == 'ADMIN'));

  Future<void> tryAutoLogin() async {
    _loading = true;
    notifyListeners();
    final minSplashFuture = Future.delayed(const Duration(milliseconds: 2200));
    try {
      final token = await _authService.getSavedToken();
      if (token != null) {
        _apiService.setToken(token);
        _user = await _authService.fetchMe();
      }
    } catch (_) {
      _user = null;
    }
    await minSplashFuture;
    _loading = false;
    notifyListeners();
  }

  Future<({String? error, String? otpChannel})> sendLoginPhoneOtp(String phone) async {
    _error = null;
    notifyListeners();
    try {
      final res = await _authService.sendRequesterPhoneOtp(phone);
      if (res['success'] == true) {
        return (error: null, otpChannel: res['otpChannel']?.toString());
      }
      return (
        error: (res['message'] ?? 'Failed to send code').toString(),
        otpChannel: null,
      );
    } catch (_) {
      return (
        error: 'Connection error. Please try again.',
        otpChannel: null,
      );
    }
  }

  /// Phone + verification code — no password ([finalizeSessionFromAuthResponse] uses /me).
  ///
  /// Does **not** toggle [loading] — doing so would replace `MaterialApp.home` with
  /// [SplashScreen] and dispose [LoginScreen] while awaiting the API, which breaks
  /// post-login navigation (e.g. push to complete registration when code is NO_ACCOUNT).
  Future<bool> loginWithPhoneOtp(String phone, String code) async {
    _error = null;
    _otpVerifyFailureCode = null;
    notifyListeners();
    try {
      final normalizedPhone = phone.trim();
      final raw = await _authService.verifyLoginWithPhoneOtpRaw(phone, code);
      var codeFromApi = raw['code']?.toString();
      final httpStatus = raw['_httpStatus'];
      if (codeFromApi != 'NO_ACCOUNT' &&
          httpStatus == 404 &&
          raw['success'] == false) {
        final msg = (raw['message'] ?? '').toString().toLowerCase();
        if (msg.contains('no account')) codeFromApi = 'NO_ACCOUNT';
      }
      final user = await _authService.finalizeSessionFromAuthResponse(raw, normalizedPhone);
      if (user != null) {
        _otpVerifyFailureCode = null;
        _user = user;
        notifyListeners();
        return true;
      }
      _otpVerifyFailureCode = codeFromApi;
      _error = raw['message']?.toString() ?? invalidCredentialsMarker;
    } catch (e) {
      _error = 'Connection error. Please try again.';
    }
    notifyListeners();
    return false;
  }

  /// Direct sign-up after OTP (self-registration roles only: COMPANY/PERSONAL).
  Future<bool> registerWithPhoneOtp({
    required String phone,
    required String code,
    required String name,
    String? email,
    required String role,
    String? province,
    String? company,
  }) async {
    _error = null;
    notifyListeners();
    try {
      final normalizedPhone = phone.trim();
      final raw = await _authService.registerWithPhoneOtpRaw(
        code: code,
        name: name,
        phone: phone,
        email: email,
        role: role,
        province: province,
        company: company,
      );
      final user = await _authService.finalizeSessionFromAuthResponse(raw, normalizedPhone);
      if (user != null) {
        _user = user;
        notifyListeners();
        return true;
      }
      _error = raw['message']?.toString() ?? 'Registration failed';
    } catch (e) {
      _error = 'Connection error. Please try again.';
    }
    notifyListeners();
    return false;
  }

  Future<bool> login(String username, String password) async {
    _error = null;
    _loading = true;
    notifyListeners();
    try {
      final result = await _authService.login(username, password);
      if (result != null) {
        _user = result.user;
        _loading = false;
        notifyListeners();
        return true;
      }
      _error = invalidCredentialsMarker;
    } catch (e) {
      _error = 'Connection error. Please try again.';
    }
    _loading = false;
    notifyListeners();
    return false;
  }

  Future<void> refreshUser() async {
    try {
      _user = await _authService.fetchMe();
      notifyListeners();
    } catch (_) {}
  }

  /// Update only the cached photoUrl after a successful upload, without a full refetch.
  void applyPhotoUrl(String? url) {
    final current = _user;
    if (current == null) return;
    _user = current.copyWith(photoUrl: url);
    notifyListeners();
  }

  /// Update only the cached contactEmail after a successful PATCH/DELETE on
  /// /api/profile/contact-email, without a full refetch. Pass null/empty to
  /// clear.
  void applyContactEmail(String? email) {
    final current = _user;
    if (current == null) return;
    final trimmed = email?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      _user = current.copyWith(clearContactEmail: true);
    } else {
      _user = current.copyWith(contactEmail: trimmed);
    }
    notifyListeners();
  }

  /// Apply JWT from POST /api/auth/requester-change-password then reload profile.
  Future<void> applyPasswordChangeResponse(Map<String, dynamic> res) async {
    final t = res['token'];
    if (t is String && t.isNotEmpty) {
      await _authService.persistSessionToken(t);
    }
    await refreshUser();
  }

  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    notifyListeners();
  }

  Future<({bool ok, String? message, String? error})> scheduleAccountDeletion() async {
    _error = null;
    notifyListeners();
    final result = await _authService.scheduleAccountDeletion();
    if (result.ok) {
      _user = null;
    } else {
      _error = result.error ?? 'Failed to schedule account deletion.';
    }
    notifyListeners();
    return result;
  }

  Future<({String username, String password})?> getSavedCredentials() async {
    return _authService.getSavedCredentials();
  }
}
