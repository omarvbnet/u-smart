class ChecklistItem {
  final String id;
  final String label;
  final String weight;

  ChecklistItem({required this.id, required this.label, this.weight = 'minor'});

  factory ChecklistItem.fromJson(Map<String, dynamic> json) {
    return ChecklistItem(
      id: json['id'] as String,
      label: json['label'] as String,
      weight: json['weight'] as String? ?? 'minor',
    );
  }
}

class InspectionChecklist {
  final String id;
  final String name;
  final List<ChecklistItem> items;

  InspectionChecklist({
    required this.id,
    required this.name,
    required this.items,
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
    );
  }
}
