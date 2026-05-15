class QFieldMapAnnotation {
  final double latitude;
  final double longitude;
  final String? note;
  final String updatedAt;
  final String? byRequesterId;
  final String? byName;

  QFieldMapAnnotation({
    required this.latitude,
    required this.longitude,
    this.note,
    required this.updatedAt,
    this.byRequesterId,
    this.byName,
  });

  factory QFieldMapAnnotation.fromJson(Map<String, dynamic> json) {
    return QFieldMapAnnotation(
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      note: json['note'] as String?,
      updatedAt: json['updatedAt'] as String? ?? '',
      byRequesterId: json['byRequesterId'] as String?,
      byName: json['byName'] as String?,
    );
  }
}

class QFieldRevision {
  final String id;
  final String url;
  final String fileName;
  final String at;
  final String? byRequesterId;
  final String? byName;
  final String? note;

  QFieldRevision({
    required this.id,
    required this.url,
    required this.fileName,
    required this.at,
    this.byRequesterId,
    this.byName,
    this.note,
  });

  factory QFieldRevision.fromJson(Map<String, dynamic> json) {
    return QFieldRevision(
      id: json['id'] as String? ?? '',
      url: json['url'] as String? ?? '',
      fileName: json['fileName'] as String? ?? '',
      at: json['at'] as String? ?? '',
      byRequesterId: json['byRequesterId'] as String?,
      byName: json['byName'] as String?,
      note: json['note'] as String?,
    );
  }
}

class QFieldProject {
  final String id;
  final String title;
  final String? description;
  final String currentUrl;
  final String fileName;
  final String createdAt;
  final String updatedAt;
  final List<QFieldRevision> revisions;
  final QFieldMapAnnotation? mapAnnotation;

  QFieldProject({
    required this.id,
    required this.title,
    this.description,
    required this.currentUrl,
    required this.fileName,
    required this.createdAt,
    required this.updatedAt,
    this.revisions = const [],
    this.mapAnnotation,
  });

  factory QFieldProject.fromJson(Map<String, dynamic> json) {
    final revs = json['revisions'];
    return QFieldProject(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      currentUrl: json['currentUrl'] as String? ?? '',
      fileName: json['fileName'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      revisions: revs is List
          ? revs
              .map((e) => QFieldRevision.fromJson(e as Map<String, dynamic>))
              .toList()
          : const [],
      mapAnnotation: json['mapAnnotation'] is Map<String, dynamic>
          ? QFieldMapAnnotation.fromJson(json['mapAnnotation'] as Map<String, dynamic>)
          : null,
    );
  }
}
