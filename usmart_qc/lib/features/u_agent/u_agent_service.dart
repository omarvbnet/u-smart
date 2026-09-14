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
}

class UAgentService {
  UAgentService(this._api);

  final ApiService _api;

  Future<Map<String, dynamic>?> fetchStatus() {
    return _api.getSafe(ApiConfig.agentStatus);
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
  }) {
    return _api.post(
      ApiConfig.agentMessage,
      body: {
        'text': text,
        if (conversationId != null) 'conversationId': conversationId,
        if (attachmentUrls != null && attachmentUrls.isNotEmpty)
          'attachmentUrls': attachmentUrls,
        if (attachments != null && attachments.isNotEmpty) 'attachments': attachments,
        'idempotencyKey': 'flutter-${DateTime.now().millisecondsSinceEpoch}',
      },
    );
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
}
