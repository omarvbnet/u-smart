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

  AuthProvider(this._authService, this._apiService);

  User? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get loading => _loading;
  String? get error => _error;
  bool get isEngineer => _user?.isEngineer ?? false;
  bool get isCompany => _user?.isCompany ?? true;
  bool get isTechnician => _user?.isTechnician ?? false;
  bool get isWorker => _user?.isWorker ?? false;
  bool get isAdmin => _user?.isAdmin ?? false;
  bool get isCoordinator => _user?.isCoordinator ?? false;
  bool get isCompanyOwner => _user?.isCompanyOwner ?? false;
  bool get mustChangePassword => _user?.mustChangePassword ?? false;

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

  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    notifyListeners();
  }

  Future<bool> deleteAccount() async {
    _error = null;
    notifyListeners();
    final ok = await _authService.deleteAccount();
    if (ok) {
      _user = null;
    } else {
      _error = 'Failed to delete account. Please try again.';
    }
    notifyListeners();
    return ok;
  }

  Future<({String username, String password})?> getSavedCredentials() async {
    return _authService.getSavedCredentials();
  }
}
