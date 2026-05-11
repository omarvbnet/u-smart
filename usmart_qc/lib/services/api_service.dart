import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiService {
  String? _token;
  String? _requestLocaleCode;

  void setToken(String? token) {
    _token = token;
  }

  /// Backend uses this for localized notification copy (en/ar/tr/ku).
  void setRequestLocale(String? localeCode) {
    final c = localeCode?.trim().toLowerCase();
    _requestLocaleCode = (c != null && c.isNotEmpty) ? c : null;
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
        if (_requestLocaleCode != null && _requestLocaleCode!.isNotEmpty)
          'X-Provisor-Locale': _requestLocaleCode!,
      };

  Uri _uri(String path, [Map<String, String>? queryParams]) {
    final base = Uri.parse(ApiConfig.baseUrl);
    return base.replace(path: path, queryParameters: queryParams);
  }

  Future<Map<String, dynamic>> get(String path,
      {Map<String, String>? query}) async {
    final response =
        await http.get(_uri(path, query), headers: _headers);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Safe get: returns null instead of throwing on HTML or parse errors.
  Future<Map<String, dynamic>?> getSafe(String path,
      {Map<String, String>? query}) async {
    try {
      final response =
          await http.get(_uri(path, query), headers: _headers);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return null;
      }
      var body = response.body.trim();
      // Strip BOM if present (can cause body.startsWith('<') to fail)
      if (body.startsWith('\uFEFF')) body = body.substring(1);
      if (body.isEmpty) return null;
      // Reject HTML (404, auth redirect, error pages)
      if (body.startsWith('<')) return null;
      return jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> post(String path,
      {Map<String, dynamic>? body}) async {
    final response = await http.post(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        data = Map<String, dynamic>.from(decoded);
      } else {
        data = {
          'success': false,
          'message': 'Invalid server response',
        };
      }
    } catch (_) {
      data = {
        'success': false,
        'message': response.statusCode >= 500
            ? 'Server error'
            : 'Invalid server response',
      };
    }
    data['_httpStatus'] = response.statusCode;
    return data;
  }

  Future<Map<String, dynamic>> patch(String path,
      {Map<String, dynamic>? body}) async {
    final response = await http.patch(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> delete(String path,
      {Map<String, String>? query}) async {
    final response =
        await http.delete(_uri(path, query), headers: _headers);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Download raw bytes (e.g. for CSV/Excel export).
  Future<List<int>?> getBytes(String path, {Map<String, String>? query}) async {
    try {
      final response = await http.get(_uri(path, query), headers: _headers);
      if (response.statusCode == 200) return response.bodyBytes;
    } catch (_) {}
    return null;
  }

  Future<String?> uploadFile(String path, String filePath) async {
    try {
      final request = http.MultipartRequest('POST', _uri(path));
      if (_token != null) {
        request.headers['Authorization'] = 'Bearer $_token';
      }
      request.files.add(await http.MultipartFile.fromPath('file', filePath));
      return _handleUploadResponse(request);
    } on FormatException {
      throw Exception('Invalid server response');
    }
  }

  /// Upload from bytes (e.g. when file_picker returns null path on web).
  Future<String?> uploadFileFromBytes(String path, List<int> bytes, String filename) async {
    try {
      final request = http.MultipartRequest('POST', _uri(path));
      if (_token != null) {
        request.headers['Authorization'] = 'Bearer $_token';
      }
      request.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
      return _handleUploadResponse(request);
    } on FormatException {
      throw Exception('Invalid server response');
    }
  }

  /// Multipart POST returning JSON (e.g. warehouse Excel import).
  Future<Map<String, dynamic>> postMultipartFile(
    String path, {
    required String filePath,
    String fieldName = 'file',
  }) async {
    try {
      final request = http.MultipartRequest('POST', _uri(path));
      if (_token != null) {
        request.headers['Authorization'] = 'Bearer $_token';
      }
      if (_requestLocaleCode != null && _requestLocaleCode!.isNotEmpty) {
        request.headers['X-Provisor-Locale'] = _requestLocaleCode!;
      }
      request.files.add(await http.MultipartFile.fromPath(fieldName, filePath));
      return _multipartJsonResponse(request);
    } catch (e) {
      return {'success': false, 'message': e.toString()};
    }
  }

  Future<Map<String, dynamic>> postMultipartBytes(
    String path, {
    required List<int> bytes,
    required String filename,
    String fieldName = 'file',
  }) async {
    try {
      final request = http.MultipartRequest('POST', _uri(path));
      if (_token != null) {
        request.headers['Authorization'] = 'Bearer $_token';
      }
      if (_requestLocaleCode != null && _requestLocaleCode!.isNotEmpty) {
        request.headers['X-Provisor-Locale'] = _requestLocaleCode!;
      }
      request.files.add(http.MultipartFile.fromBytes(fieldName, bytes, filename: filename));
      return _multipartJsonResponse(request);
    } catch (e) {
      return {'success': false, 'message': e.toString()};
    }
  }

  Future<Map<String, dynamic>> _multipartJsonResponse(http.MultipartRequest request) async {
    final streamed = await request.send();
    final body = await streamed.stream.bytesToString();
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map) {
        final m = Map<String, dynamic>.from(decoded);
        m['_httpStatus'] = streamed.statusCode;
        return m;
      }
    } catch (_) {
      /* fall through */
    }
    return {
      'success': false,
      'message': body.isNotEmpty ? body : 'Invalid server response',
      '_httpStatus': streamed.statusCode,
    };
  }

  Future<String?> _handleUploadResponse(http.MultipartRequest request) async {
    final streamed = await request.send();
    final body = await streamed.stream.bytesToString();

    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      try {
        final err = jsonDecode(body) as Map<String, dynamic>;
        final msg = err['message'] as String? ?? 'Upload failed (${streamed.statusCode})';
        throw Exception(msg);
      } catch (e) {
        if (e is Exception) rethrow;
        throw Exception('Upload failed (${streamed.statusCode})');
      }
    }

    final data = jsonDecode(body) as Map<String, dynamic>;
    if (data['success'] == true) {
      return data['url'] as String?;
    }
    final msg = data['message'] as String? ?? 'Upload failed';
    throw Exception(msg);
  }
}
