class QFieldMapNote {
  QFieldMapNote({
    required this.id,
    required this.latitude,
    required this.longitude,
    required this.note,
    required this.createdAt,
    this.byRequesterId,
    this.byName,
  });

  final String id;
  final double latitude;
  final double longitude;
  final String note;
  final String createdAt;
  final String? byRequesterId;
  final String? byName;

  String get authorLabel {
    final n = byName?.trim();
    if (n != null && n.isNotEmpty) return n;
    return 'Engineer';
  }

  factory QFieldMapNote.fromJson(Map<String, dynamic> json) {
    return QFieldMapNote(
      id: json['id'] as String? ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      note: json['note'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      byRequesterId: json['byRequesterId'] as String?,
      byName: json['byName'] as String?,
    );
  }
}

List<QFieldMapNote> parseQFieldMapNotes(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => QFieldMapNote.fromJson(Map<String, dynamic>.from(e)))
      .where((n) => n.id.isNotEmpty && n.note.trim().isNotEmpty)
      .toList();
}
