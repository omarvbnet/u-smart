import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'u_agent_service.dart';

class UAgentProvider extends ChangeNotifier {
  UAgentProvider(this._service);

  final UAgentService _service;

  String status = 'ONLINE';
  String greeting = 'شلون أگدر أساعدك اليوم؟';
  bool aiConfigured = true;
  bool busy = false;
  String? conversationId;
  String? error;
  final List<UAgentChatMessage> messages = [];
  List<Map<String, dynamic>> approvals = [];
  bool canManageApprovals = false;

  Future<void> refreshStatus() async {
    final data = await _service.fetchStatus();
    if (data == null || data['success'] != true) {
      error = data?['message']?.toString() ?? 'U Agent unavailable';
      status = 'OFFLINE';
      notifyListeners();
      return;
    }
    status = data['status']?.toString() ?? 'ONLINE';
    if (data['greeting'] is String) greeting = data['greeting'] as String;
    aiConfigured = data['aiConfigured'] != false;
    error = null;
    notifyListeners();
  }

  Future<void> refreshApprovals() async {
    final data = await _service.fetchApprovals();
    if (data == null || data['success'] != true) return;
    final list = data['approvals'];
    if (list is List) {
      approvals = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    canManageApprovals = data['canManage'] == true;
    notifyListeners();
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || busy) return;
    busy = true;
    error = null;
    status = 'THINKING';
    messages.add(UAgentChatMessage(
      id: 'u-${DateTime.now().millisecondsSinceEpoch}',
      role: 'user',
      content: trimmed,
    ));
    notifyListeners();

    try {
      final data = await _service.sendMessage(
        text: trimmed,
        conversationId: conversationId,
      );
      if (data['success'] != true) {
        error = data['message']?.toString() ?? 'Request failed';
        status = 'FAILED';
      } else {
        conversationId = data['conversationId']?.toString() ?? conversationId;
        status = data['status']?.toString() ?? 'ONLINE';
        final timelineRaw = data['timeline'];
        final timeline = <UAgentTimelineStep>[];
        if (timelineRaw is List) {
          for (final item in timelineRaw) {
            if (item is Map) {
              timeline.add(
                UAgentTimelineStep.fromJson(Map<String, dynamic>.from(item)),
              );
            }
          }
        }
        messages.add(UAgentChatMessage(
          id: 'a-${DateTime.now().millisecondsSinceEpoch}',
          role: 'assistant',
          content: data['reply']?.toString() ?? data['message']?.toString() ?? '',
          timeline: timeline,
        ));
        await refreshApprovals();
      }
    } catch (e) {
      error = 'Network error';
      status = 'FAILED';
      debugPrint('UAgentProvider.send: $e');
    } finally {
      busy = false;
      notifyListeners();
      await refreshStatus();
    }
  }

  Future<void> resolveApproval(String id, {required bool approve}) async {
    final data = approve ? await _service.approve(id) : await _service.reject(id);
    if (data['success'] != true) {
      error = data['message']?.toString();
      notifyListeners();
    }
    await refreshApprovals();
  }
}
