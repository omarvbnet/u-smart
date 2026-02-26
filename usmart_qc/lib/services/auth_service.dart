import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  final ApiService _api;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const _tokenKey = 'requester_token';

  AuthService(this._api);

  Future<String?> getSavedToken() async {
    return _storage.read(key: _tokenKey);
  }

  Future<void> _saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    _api.setToken(token);
  }

  Future<void> clearToken() async {
    await _storage.delete(key: _tokenKey);
    _api.setToken(null);
  }

  Future<String> _fetchRole() async {
    try {
      final data = await _api.get(ApiConfig.requesterRole);
      if (data['success'] == true && data['role'] != null) {
        return data['role'] as String;
      }
    } catch (_) {}
    return 'COMPANY';
  }

  Future<({User user, String token})?> login(
      String username, String password) async {
    final data = await _api.post(ApiConfig.login, body: {
      'username': username,
      'password': password,
    });

    if (data['success'] == true && data['token'] != null) {
      final token = data['token'] as String;
      await _saveToken(token);

      final userJson = data['user'] as Map<String, dynamic>;
      // If login response doesn't include role, fetch it separately
      if (userJson['role'] == null) {
        userJson['role'] = await _fetchRole();
      }

      final user = User.fromJson(userJson);
      return (user: user, token: token);
    }
    return null;
  }

  Future<User?> fetchMe() async {
    final data = await _api.get(ApiConfig.me);
    if (data['success'] == true && data['user'] != null) {
      final userJson = data['user'] as Map<String, dynamic>;
      // If /me response doesn't include role, fetch it separately
      if (userJson['role'] == null) {
        userJson['role'] = await _fetchRole();
      }
      return User.fromJson(userJson);
    }
    return null;
  }

  Future<bool> tryAutoLogin() async {
    final token = await getSavedToken();
    if (token == null) return false;
    _api.setToken(token);
    final user = await fetchMe();
    return user != null;
  }

  Future<void> logout() async {
    try {
      await _api.post(ApiConfig.logout);
    } catch (_) {}
    await clearToken();
  }
}
