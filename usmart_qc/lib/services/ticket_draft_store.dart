import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// A locally-cached snapshot of in-progress field work for a single ticket
/// (selected checklist items, chosen template, and draft before/after photos).
///
/// Used as an offline fallback so staff don't lose work when they leave the
/// screen or close the app. The server "progress" autosave is the primary
/// store; this mirrors it on-device and is restored when the server has none.
class TicketDraft {
  TicketDraft({
    this.checklistTemplateId,
    this.checklistItems = const [],
    this.beforeImageUrls = const [],
    this.finishingImageUrls = const [],
    this.updatedAt,
  });

  final String? checklistTemplateId;

  /// Each item: { id, label, checked, result, comment?, weight? }
  final List<Map<String, dynamic>> checklistItems;
  final List<String> beforeImageUrls;
  final List<String> finishingImageUrls;
  final DateTime? updatedAt;

  bool get isEmpty =>
      (checklistTemplateId == null || checklistTemplateId!.isEmpty) &&
      checklistItems.isEmpty &&
      beforeImageUrls.isEmpty &&
      finishingImageUrls.isEmpty;

  Map<String, dynamic> toJson() => {
        if (checklistTemplateId != null) 'checklistTemplateId': checklistTemplateId,
        'checklistItems': checklistItems,
        'beforeImageUrls': beforeImageUrls,
        'finishingImageUrls': finishingImageUrls,
        'updatedAt': (updatedAt ?? DateTime.now()).toIso8601String(),
      };

  factory TicketDraft.fromJson(Map<String, dynamic> json) {
    return TicketDraft(
      checklistTemplateId: json['checklistTemplateId'] as String?,
      checklistItems: (json['checklistItems'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          const [],
      beforeImageUrls: (json['beforeImageUrls'] as List?)
              ?.whereType<String>()
              .toList() ??
          const [],
      finishingImageUrls: (json['finishingImageUrls'] as List?)
              ?.whereType<String>()
              .toList() ??
          const [],
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString())
          : null,
    );
  }
}

/// Persists [TicketDraft]s in SharedPreferences keyed by ticket id.
class TicketDraftStore {
  static String _key(String ticketId) => 'ticket_draft_$ticketId';

  static Future<void> save(String ticketId, TicketDraft draft) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (draft.isEmpty) {
        await prefs.remove(_key(ticketId));
        return;
      }
      await prefs.setString(_key(ticketId), jsonEncode(draft.toJson()));
    } catch (_) {
      /* best-effort cache; ignore storage errors */
    }
  }

  static Future<TicketDraft?> load(String ticketId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key(ticketId));
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return TicketDraft.fromJson(decoded);
    } catch (_) {}
    return null;
  }

  static Future<void> clear(String ticketId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key(ticketId));
    } catch (_) {}
  }
}
