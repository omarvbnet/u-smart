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

class UAgentChatMessage {
  UAgentChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.timeline = const [],
  });

  final String id;
  final String role; // user | assistant
  final String content;
  final List<UAgentTimelineStep> timeline;
}

class UAgentService {
  UAgentService(this._api);

  final ApiService _api;

  Future<Map<String, dynamic>?> fetchStatus() {
    return _api.getSafe(ApiConfig.agentStatus);
  }

  Future<Map<String, dynamic>> sendMessage({
    required String text,
    String? conversationId,
    List<String>? attachmentUrls,
  }) {
    return _api.post(
      ApiConfig.agentMessage,
      body: {
        'text': text,
        if (conversationId != null) 'conversationId': conversationId,
        if (attachmentUrls != null && attachmentUrls.isNotEmpty)
          'attachmentUrls': attachmentUrls,
        'idempotencyKey':
            'flutter-${DateTime.now().millisecondsSinceEpoch}',
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
