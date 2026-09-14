import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'u_agent_service.dart';

class UAgentProvider extends ChangeNotifier {
  UAgentProvider(this._service, {this.userId});

  final UAgentService _service;
  final String? userId;

  String status = 'ONLINE';
  String greeting = 'شلون أگدر أساعدك اليوم؟';
  bool aiConfigured = true;
  bool busy = false;
  bool open = false;
  bool voiceMode = false;
  bool listening = false;
  bool speaking = false;
  String? conversationId;
  String? error;
  String? activeProvider;
  String liveTranscript = '';
  final List<UAgentChatMessage> messages = [];
  final List<UAgentPendingFile> pendingFiles = [];
  List<UAgentConversationSummary> conversations = [];
  List<Map<String, dynamic>> approvals = [];
  bool canManageApprovals = false;
  bool historyLoaded = false;

  final List<VoidCallback> _openListeners = [];

  void addOpenListener(VoidCallback cb) => _openListeners.add(cb);
  void removeOpenListener(VoidCallback cb) => _openListeners.remove(cb);

  void _emitOpen() {
    for (final cb in List<VoidCallback>.from(_openListeners)) {
      cb();
    }
  }

  void setOpen(bool value) {
    if (open == value) return;
    open = value;
    if (!value) voiceMode = false;
    notifyListeners();
    _emitOpen();
    if (value) {
      refreshStatus();
      refreshApprovals();
      loadHistory();
    }
  }

  void toggleOpen() => setOpen(!open);

  void setVoiceMode(bool value) {
    if (voiceMode == value) return;
    voiceMode = value;
    if (!value) {
      listening = false;
      liveTranscript = '';
    }
    notifyListeners();
  }

  void setListening(bool value) {
    if (listening == value) return;
    listening = value;
    notifyListeners();
  }

  void setSpeaking(bool value) {
    if (speaking == value) return;
    speaking = value;
    notifyListeners();
  }

  void setLiveTranscript(String value) {
    if (liveTranscript == value) return;
    liveTranscript = value;
    notifyListeners();
  }

  void addPendingFile(UAgentPendingFile file) {
    pendingFiles.add(file);
    notifyListeners();
  }

  void removePendingFile(int index) {
    if (index < 0 || index >= pendingFiles.length) return;
    pendingFiles.removeAt(index);
    notifyListeners();
  }

  void clearPendingFiles() {
    pendingFiles.clear();
    notifyListeners();
  }

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
    final provider = data['activeProvider'];
    if (provider is Map) {
      activeProvider = provider['name']?.toString() ?? provider['kind']?.toString();
    } else {
      activeProvider = null;
    }
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

  Future<void> loadHistory() async {
    if (historyLoaded && messages.isNotEmpty) return;

    // 1) Local cache for instant UI
    final uid = userId;
    if (uid != null && uid.isNotEmpty) {
      final local = await _service.loadLocalSession(uid);
      if (local != null) {
        conversationId = local.conversationId ?? conversationId;
        if (messages.isEmpty && local.messages.isNotEmpty) {
          messages
            ..clear()
            ..addAll(local.messages);
          notifyListeners();
        }
      }
    }

    // 2) Server conversations for this user
    final listData = await _service.fetchConversations();
    if (listData != null && listData['success'] == true) {
      final list = listData['conversations'];
      if (list is List) {
        conversations = list
            .whereType<Map>()
            .map((e) => UAgentConversationSummary.fromJson(Map<String, dynamic>.from(e)))
            .where((c) => c.id.isNotEmpty)
            .toList();
      }
    }

    final targetId = conversationId ??
        (conversations.isNotEmpty ? conversations.first.id : null);
    if (targetId != null) {
      await openConversation(targetId);
    }
    historyLoaded = true;
    notifyListeners();
  }

  Future<void> openConversation(String id) async {
    final data = await _service.fetchMessages(id);
    if (data == null || data['success'] != true) return;
    final raw = data['messages'];
    if (raw is! List) return;
    final loaded = <UAgentChatMessage>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final m = Map<String, dynamic>.from(item);
      final roleRaw = m['role']?.toString().toUpperCase() ?? '';
      if (roleRaw == 'TOOL' || roleRaw == 'SYSTEM') continue;
      final role = roleRaw == 'USER' ? 'user' : 'assistant';
      loaded.add(UAgentChatMessage(
        id: m['id']?.toString() ?? 'm-${loaded.length}',
        role: role,
        content: m['content']?.toString() ?? '',
      ));
    }
    conversationId = id;
    messages
      ..clear()
      ..addAll(loaded);
    await _persistLocal();
    notifyListeners();
  }

  Future<void> startNewConversation() async {
    conversationId = null;
    messages.clear();
    historyLoaded = true;
    final uid = userId;
    if (uid != null) await _service.clearLocalSession(uid);
    notifyListeners();
  }

  Future<void> _persistLocal() async {
    final uid = userId;
    if (uid == null || uid.isEmpty) return;
    try {
      await _service.saveLocalSession(
        userId: uid,
        conversationId: conversationId,
        messages: List<UAgentChatMessage>.from(messages),
      );
    } catch (e) {
      debugPrint('UAgent persist: $e');
    }
  }

  Future<String?> send(String text, {bool fromVoice = false}) async {
    final trimmed = text.trim();
    if ((trimmed.isEmpty && pendingFiles.isEmpty) || busy) return null;
    busy = true;
    error = null;
    status = 'THINKING';
    final filesSnapshot = List<UAgentPendingFile>.from(pendingFiles);
    final prompt = trimmed.isEmpty
        ? (fromVoice
            ? 'Please analyze the attached files and summarize findings.'
            : 'Analyze the attached files and help me with them.')
        : trimmed;
    messages.add(UAgentChatMessage(
      id: 'u-${DateTime.now().millisecondsSinceEpoch}',
      role: 'user',
      content: prompt,
      attachmentNames: filesSnapshot.map((f) => f.name).toList(),
    ));
    pendingFiles.clear();
    liveTranscript = '';
    notifyListeners();
    await _persistLocal();

    String? replyText;
    try {
      final attachments = <Map<String, dynamic>>[];
      for (final file in filesSnapshot) {
        final up = await _service.uploadAgentFile(file);
        if (up['success'] != true || up['url'] == null) {
          error = up['message']?.toString() ?? 'Upload failed';
          status = 'FAILED';
          busy = false;
          notifyListeners();
          return null;
        }
        attachments.add({
          'url': up['url'],
          'name': up['name'] ?? file.name,
          'contentType': up['contentType'] ?? file.contentType,
          'size': up['size'],
        });
      }

      final data = await _service.sendMessage(
        text: prompt,
        conversationId: conversationId,
        attachments: attachments.isEmpty ? null : attachments,
        attachmentUrls: attachments.map((a) => a['url'] as String).toList(),
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
        final artifacts = <UAgentArtifact>[];
        final artRaw = data['artifacts'];
        if (artRaw is List) {
          for (final item in artRaw) {
            if (item is Map) {
              final a = UAgentArtifact.fromJson(Map<String, dynamic>.from(item));
              if (a.url.isNotEmpty) artifacts.add(a);
            }
          }
        }
        replyText = data['reply']?.toString() ?? data['message']?.toString() ?? '';
        messages.add(UAgentChatMessage(
          id: 'a-${DateTime.now().millisecondsSinceEpoch}',
          role: 'assistant',
          content: replyText,
          timeline: timeline,
          artifacts: artifacts,
        ));
        await refreshApprovals();
        await _persistLocal();
        // refresh conversation list quietly
        final listData = await _service.fetchConversations();
        if (listData != null && listData['success'] == true) {
          final list = listData['conversations'];
          if (list is List) {
            conversations = list
                .whereType<Map>()
                .map((e) => UAgentConversationSummary.fromJson(Map<String, dynamic>.from(e)))
                .where((c) => c.id.isNotEmpty)
                .toList();
          }
        }
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
    return replyText;
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
