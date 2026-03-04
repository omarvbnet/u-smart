import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
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
  bool get isAdmin => _user?.isAdmin ?? false;

  Future<void> tryAutoLogin() async {
    _loading = true;
    notifyListeners();
    try {
      final token = await _authService.getSavedToken();
      if (token != null) {
        _apiService.setToken(token);
        _user = await _authService.fetchMe();
      }
    } catch (_) {
      _user = null;
    }
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
      _error = 'Invalid username or password';
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
}
