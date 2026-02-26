class TicketEvidence {
  final String id;
  final String uploadedById;
  final String uploadedByName;
  final String fileUrl;
  final String fileType;
  final String? description;
  final DateTime createdAt;

  TicketEvidence({
    required this.id,
    required this.uploadedById,
    required this.uploadedByName,
    required this.fileUrl,
    required this.fileType,
    this.description,
    required this.createdAt,
  });

  bool get isImage => fileType == 'image' || fileUrl.endsWith('.jpg') || fileUrl.endsWith('.jpeg') || fileUrl.endsWith('.png') || fileUrl.endsWith('.webp');

  factory TicketEvidence.fromJson(Map<String, dynamic> json) {
    return TicketEvidence(
      id: json['id'] as String,
      uploadedById: json['uploadedById'] as String,
      uploadedByName: json['uploadedByName'] as String,
      fileUrl: json['fileUrl'] as String,
      fileType: json['fileType'] as String? ?? 'image',
      description: json['description'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
