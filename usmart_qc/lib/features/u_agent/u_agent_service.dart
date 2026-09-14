import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api_service.dart';
import '../../config/api_config.dart';

class UAgentTimelineStep {
  UAgentTimelineStep({
    required this.at,
    required this.label,
    required this.status,
    this.tool,
    this.detail,
  });

  final String at;
  final String label;
  final String status;
  final String? tool;
  final String? detail;

  factory UAgentTimelineStep.fromJson(Map<String, dynamic> json) {
    return UAgentTimelineStep(
      at: json['at']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      tool: json['tool']?.toString(),
      detail: json['detail']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'at': at,
        'label': label,
        'status': status,
        if (tool != null) 'tool': tool,
        if (detail != null) 'detail': detail,
      };
}

class UAgentArtifact {
  UAgentArtifact({
    required this.url,
    required this.name,
    this.title,
    this.contentType,
    this.format,
    this.kind,
  });

  final String url;
  final String name;
  final String? title;
  final String? contentType;
  final String? format;
  final String? kind;

  factory UAgentArtifact.fromJson(Map<String, dynamic> json) {
    return UAgentArtifact(
      url: json['url']?.toString() ?? '',
      name: json['name']?.toString() ?? 'file',
      title: json['title']?.toString(),
      contentType: json['contentType']?.toString(),
      format: json['format']?.toString(),
      kind: json['kind']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'url': url,
        'name': name,
        if (title != null) 'title': title,
        if (contentType != null) 'contentType': contentType,
        if (format != null) 'format': format,
        if (kind != null) 'kind': kind,
      };
}

class UAgentPendingFile {
  UAgentPendingFile({
    required this.name,
    this.path,
    this.bytes,
    this.contentType,
  });

  final String name;
  final String? path;
  final List<int>? bytes;
  final String? contentType;
}

class UAgentChatMessage {
  UAgentChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.timeline = const [],
    this.artifacts = const [],
    this.attachmentNames = const [],
  });

  final String id;
  final String role; // user | assistant
  final String content;
  final List<UAgentTimelineStep> timeline;
  final List<UAgentArtifact> artifacts;
  final List<String> attachmentNames;

  factory UAgentChatMessage.fromJson(Map<String, dynamic> json) {
    final arts = <UAgentArtifact>[];
    final rawArts = json['artifacts'];
    if (rawArts is List) {
      for (final a in rawArts) {
        if (a is Map) arts.add(UAgentArtifact.fromJson(Map<String, dynamic>.from(a)));
      }
    }
    final names = <String>[];
    final rawNames = json['attachmentNames'];
    if (rawNames is List) {
      for (final n in rawNames) {
        names.add(n.toString());
      }
    }
    return UAgentChatMessage(
      id: json['id']?.toString() ?? '',
      role: json['role']?.toString() ?? 'assistant',
      content: json['content']?.toString() ?? '',
      artifacts: arts,
      attachmentNames: names,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'content': content,
        'artifacts': artifacts.map((a) => a.toJson()).toList(),
        'attachmentNames': attachmentNames,
      };
}

class UAgentConversationSummary {
  UAgentConversationSummary({
    required this.id,
    this.title,
    this.status,
    this.messageCount = 0,
  });

  final String id;
  final String? title;
  final String? status;
  final int messageCount;

  factory UAgentConversationSummary.fromJson(Map<String, dynamic> json) {
    return UAgentConversationSummary(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString(),
      status: json['status']?.toString(),
      messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class UAgentService {
  UAgentService(this._api);

  final ApiService _api;

  Future<Map<String, dynamic>?> fetchStatus() {
    return _api.getSafe(ApiConfig.agentStatus);
  }

  Future<Map<String, dynamic>?> fetchConversations({int limit = 20}) {
    return _api.getSafe('${ApiConfig.agentConversations}?limit=$limit');
  }

  Future<Map<String, dynamic>?> fetchMessages(String conversationId, {int limit = 80}) {
    return _api.getSafe(
      '${ApiConfig.agentActivity}?conversationId=${Uri.encodeComponent(conversationId)}&limit=$limit',
    );
  }

  Future<Map<String, dynamic>> uploadAgentFile(UAgentPendingFile file) async {
    if (file.path != null && file.path!.isNotEmpty) {
      return _api.postMultipartFile(ApiConfig.agentFiles, filePath: file.path!);
    }
    if (file.bytes != null) {
      return _api.postMultipartBytes(
        ApiConfig.agentFiles,
        bytes: file.bytes!,
        filename: file.name,
      );
    }
    return {'success': false, 'message': 'Empty file'};
  }

  Future<Map<String, dynamic>> sendMessage({
    required String text,
    String? conversationId,
    List<String>? attachmentUrls,
    List<Map<String, dynamic>>? attachments,
    List<Map<String, String>>? deviceContacts,
  }) {
    return _api.post(
      ApiConfig.agentMessage,
      body: {
        'text': text,
        if (conversationId != null) 'conversationId': conversationId,
        if (attachmentUrls != null && attachmentUrls.isNotEmpty)
          'attachmentUrls': attachmentUrls,
        if (attachments != null && attachments.isNotEmpty) 'attachments': attachments,
        if (deviceContacts != null && deviceContacts.isNotEmpty)
          'deviceContacts': deviceContacts,
        'idempotencyKey': 'flutter-${DateTime.now().millisecondsSinceEpoch}',
      },
    );
  }

  Future<Map<String, dynamic>?> fetchTtsStatus() {
    return _api.getSafe(ApiConfig.agentTts);
  }

  Future<List<int>?> fetchHamsaTtsBytes(String text) {
    return _api.postForBytes(
      ApiConfig.agentTts,
      body: {'text': text},
    );
  }

  Future<Map<String, dynamic>?> fetchWhatsAppConsent() {
    return _api.getSafe(ApiConfig.agentWhatsAppConsent);
  }

  Future<Map<String, dynamic>> updateWhatsAppConsent(Map<String, dynamic> body) {
    return _api.patch(ApiConfig.agentWhatsAppConsent, body: body);
  }

  Future<Map<String, dynamic>?> fetchApprovals() {
    return _api.getSafe(ApiConfig.agentApprovals);
  }

  Future<Map<String, dynamic>> approve(String id) {
    return _api.post(ApiConfig.agentApprovalApprove(id));
  }

  Future<Map<String, dynamic>> reject(String id) {
    return _api.post(ApiConfig.agentApprovalReject(id));
  }

  static String _prefsKey(String userId) => 'u_agent_session_$userId';

  Future<void> saveLocalSession({
    required String userId,
    required String? conversationId,
    required List<UAgentChatMessage> messages,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _prefsKey(userId),
      jsonEncode({
        'conversationId': conversationId,
        'messages': messages.map((m) => m.toJson()).toList(),
        'savedAt': DateTime.now().toIso8601String(),
      }),
    );
  }

  Future<({String? conversationId, List<UAgentChatMessage> messages})?> loadLocalSession(
    String userId,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsKey(userId));
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final msgs = <UAgentChatMessage>[];
      final list = map['messages'];
      if (list is List) {
        for (final item in list) {
          if (item is Map) {
            msgs.add(UAgentChatMessage.fromJson(Map<String, dynamic>.from(item)));
          }
        }
      }
      return (
        conversationId: map['conversationId']?.toString(),
        messages: msgs,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> clearLocalSession(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey(userId));
  }
}
