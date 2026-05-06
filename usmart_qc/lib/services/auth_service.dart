import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'dart:io' show Platform;
import '../config/api_config.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  final ApiService _api;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const _tokenKey = 'requester_token';
  static const _savedUsernameKey = 'saved_username';

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

  /// After password change API returns a fresh JWT (session cookie not used on mobile).
  Future<void> persistSessionToken(String token) async {
    await _saveToken(token);
  }

  /// Prefills the login field on next cold start (email or username).
  Future<void> rememberSavedLoginField(String usernameOrEmail) async {
    final v = usernameOrEmail.trim();
    if (v.isEmpty) return;
    await _storage.write(key: _savedUsernameKey, value: v);
  }

  Future<User?> finalizeSessionFromAuthResponse(
    Map<String, dynamic> data,
    String identifierToSave,
  ) async {
    if (data['success'] != true || data['token'] is! String) return null;
    await persistSessionToken(data['token'] as String);
    await rememberSavedLoginField(identifierToSave);
    return fetchMe();
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
    String? pushToken;
    String phonePlatform = 'unknown';
    try {
      phonePlatform =
          Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown');
      pushToken = await FirebaseMessaging.instance.getToken();
    } catch (_) {}

    final data = await _api.post(ApiConfig.login, body: {
      'usernameOrEmail': username.trim(),
      'username': username.trim(),
      'password': password,
      if (pushToken != null && pushToken.isNotEmpty) 'pushToken': pushToken,
      if (pushToken != null && pushToken.isNotEmpty) 'phonePlatform': phonePlatform,
    });

    if (data['success'] == true && data['token'] != null) {
      final token = data['token'] as String;
      await _saveToken(token);
      await _storage.write(key: _savedUsernameKey, value: username);

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

  Future<Map<String, dynamic>> sendRequesterEmailOtp(String email) async {
    final trimmed = email.trim().toLowerCase();
    return _api.post(ApiConfig.requesterOtpSend, body: {'email': trimmed});
  }

  Future<Map<String, dynamic>> _postEmailOtpVerifyLogin(
      String email, String code) async {
    String? pushToken;
    String phonePlatform = 'unknown';
    try {
      phonePlatform =
          Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown');
      pushToken = await FirebaseMessaging.instance.getToken();
    } catch (_) {}

    final trimmed = email.trim().toLowerCase();
    return _api.post(ApiConfig.requesterOtpVerifyLogin, body: {
      'email': trimmed,
      'code': code.trim(),
      if (pushToken != null && pushToken.isNotEmpty) 'pushToken': pushToken,
      if (pushToken != null && pushToken.isNotEmpty)
        'phonePlatform': phonePlatform,
    });
  }

  /// Parsed API body — use [finalizeSessionFromAuthResponse] on success.
  Future<Map<String, dynamic>> verifyLoginWithEmailOtpRaw(
      String email, String code) {
    return _postEmailOtpVerifyLogin(email, code);
  }

  Future<Map<String, dynamic>> registerWithEmailOtpRaw({
    required String email,
    required String code,
    required String name,
    required String phone,
    required String role,
    String? province,
    String? company,
  }) async {
    String? pushToken;
    String phonePlatform = 'unknown';
    try {
      phonePlatform =
          Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown');
      pushToken = await FirebaseMessaging.instance.getToken();
    } catch (_) {}

    final trimmed = email.trim().toLowerCase();
    return _api.post(ApiConfig.requesterOtpRegister, body: {
      'email': trimmed,
      'code': code.trim(),
      'name': name.trim(),
      'phone': phone.trim(),
      'role': role.trim().toUpperCase(),
      if (province != null && province.trim().isNotEmpty)
        'province': province.trim(),
      if (company != null && company.trim().isNotEmpty)
        'company': company.trim(),
      if (pushToken != null && pushToken.isNotEmpty) 'pushToken': pushToken,
      if (pushToken != null && pushToken.isNotEmpty)
        'phonePlatform': phonePlatform,
    });
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
    // Keep saved credentials for next login (do not delete)
  }

  Future<bool> deleteAccount() async {
    try {
      final data = await _api.delete(ApiConfig.deleteAccount);
      if (data['success'] == true) {
        await clearToken();
        await _storage.delete(key: _savedUsernameKey);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Returns saved username and password for prefilling login form.
  Future<({String username, String password})?> getSavedCredentials() async {
    final username = await _storage.read(key: _savedUsernameKey);
    if (username != null && username.isNotEmpty) {
      return (username: username, password: '');
    }
    return null;
  }
}
