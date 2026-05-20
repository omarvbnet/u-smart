import 'private_company.dart';

/// Resolves major/minor from either `weight` or `severity` (workspace checklists use severity).
String resolveChecklistItemWeight(Map<String, dynamic> json) {
  final w = (json['weight'] as String?)?.trim().toLowerCase();
  if (w == 'major' || w == 'minor') return w!;
  final s = (json['severity'] as String?)?.trim().toLowerCase();
  if (s == 'major') return 'major';
  return 'minor';
}

/// Normalizes raw checklist item maps so both `weight` and `severity` are set.
List<Map<String, dynamic>> normalizeChecklistItemsJson(List<dynamic>? raw) {
  if (raw == null) return [];
  return raw
      .whereType<Map>()
      .map((e) {
        final m = Map<String, dynamic>.from(e);
        final w = resolveChecklistItemWeight(m);
        return {...m, 'weight': w, 'severity': w};
      })
      .toList();
}

/// Resolves item weight using stored response, attached template preview, or workspace checklist.
String resolveTicketChecklistItemWeight(
  Map<String, dynamic> item, {
  Map<String, dynamic>? checklistTemplate,
  List<ChecklistItem>? templateItems,
}) {
  final direct = resolveChecklistItemWeight(item);
  if (direct == 'major') return 'major';

  final id = item['id'] as String?;
  if (id != null && templateItems != null) {
    for (final it in templateItems) {
      if (it.id == id) return it.weight;
    }
  }

  final previewItems = checklistTemplate?['items'];
  if (id != null && previewItems is List) {
    for (final raw in previewItems) {
      if (raw is Map && raw['id'] == id) {
        return resolveChecklistItemWeight(Map<String, dynamic>.from(raw));
      }
    }
  }

  return direct;
}

class ChecklistItem {
  final String id;
  final String label;
  final String weight;

  ChecklistItem({required this.id, required this.label, this.weight = 'minor'});

  bool get isMajor => weight == 'major';

  factory ChecklistItem.fromJson(Map<String, dynamic> json) {
    return ChecklistItem(
      id: json['id'] as String,
      label: json['label'] as String,
      weight: resolveChecklistItemWeight(json),
    );
  }
}

class InspectionChecklist {
  final String id;
  final String name;
  final List<ChecklistItem> items;
  final bool archived;
  final String? createdByRequesterId;

  InspectionChecklist({
    required this.id,
    required this.name,
    required this.items,
    this.archived = false,
    this.createdByRequesterId,
  });

  factory InspectionChecklist.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    List<ChecklistItem> items = [];
    if (rawItems is List) {
      items = rawItems
          .map((e) => ChecklistItem.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return InspectionChecklist(
      id: json['id'] as String,
      name: json['name'] as String,
      items: items,
      archived: json['archived'] == true,
      createdByRequesterId: json['createdByRequesterId'] as String?,
    );
  }
}

InspectionChecklist inspectionChecklistFromWorkspace(PrivateCompanyChecklist checklist) {
  return InspectionChecklist(
    id: checklist.id,
    name: checklist.name,
    items: checklist.items
        .map(
          (it) => ChecklistItem(
            id: it.id,
            label: it.label,
            weight: it.isMajor ? 'major' : 'minor',
          ),
        )
        .toList(),
  );
}
