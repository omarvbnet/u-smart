import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../services/api_service.dart';

class RegistrationRequestProvider extends ChangeNotifier {
  final ApiService _api;

  RegistrationRequestProvider(this._api);

  bool _uploading = false;
  bool _submitting = false;
  String? _error;

  bool get uploading => _uploading;
  bool get submitting => _submitting;
  String? get error => _error;

  /// Upload evidence file (PDF or image). Returns URL or null.
  Future<String?> uploadEvidence(String filePath) async {
    _error = null;
    _uploading = true;
    notifyListeners();
    try {
      final url = await _api.uploadFile(
        ApiConfig.uploadRegistrationEvidence,
        filePath,
      );
      _uploading = false;
      notifyListeners();
      return url;
    } catch (e) {
      _error = e is Exception ? e.toString().replaceFirst('Exception: ', '') : 'Upload failed';
      _uploading = false;
      notifyListeners();
      return null;
    }
  }

  /// Upload evidence from bytes (e.g. when file_picker returns null path on web).
  Future<String?> uploadEvidenceFromBytes(List<int> bytes, String filename) async {
    _error = null;
    _uploading = true;
    notifyListeners();
    try {
      final url = await _api.uploadFileFromBytes(
        ApiConfig.uploadRegistrationEvidence,
        bytes,
        filename,
      );
      _uploading = false;
      notifyListeners();
      return url;
    } catch (e) {
      _error = e is Exception ? e.toString().replaceFirst('Exception: ', '') : 'Upload failed';
      _uploading = false;
      notifyListeners();
      return null;
    }
  }

  /// Submit registration request. Returns true on success.
  Future<bool> submit({
    required String legalName,
    required String phone,
    required String email,
    required String evidenceUrl,
    required String role,
  }) async {
    _error = null;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.registrationRequests, body: {
        'legalName': legalName.trim(),
        'phone': phone.trim(),
        'email': email.trim(),
        'evidenceUrl': evidenceUrl,
        'role': role,
      });
      _submitting = false;
      notifyListeners();
      if (res['success'] == true) return true;
      _error = res['message'] as String? ?? 'Failed to submit';
      notifyListeners();
      return false;
    } catch (e) {
      _error = e is Exception ? e.toString().replaceFirst('Exception: ', '') : 'Failed to submit';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
