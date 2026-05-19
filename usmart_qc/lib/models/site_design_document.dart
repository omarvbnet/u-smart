class SiteDesignDocument {
  const SiteDesignDocument({
    required this.id,
    required this.url,
    required this.fileName,
    this.title,
    this.uploadedAt,
    this.mimeType,
  });

  final String id;
  final String url;
  final String fileName;
  final String? title;
  final String? uploadedAt;
  final String? mimeType;

  String get displayName {
    final t = title?.trim();
    if (t != null && t.isNotEmpty) return t;
    return fileName;
  }

  bool get isPdf =>
      (mimeType?.contains('pdf') ?? false) ||
      fileName.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().contains('.pdf');

  factory SiteDesignDocument.fromJson(Map<String, dynamic> json) {
    return SiteDesignDocument(
      id: json['id'] as String? ?? '',
      url: json['url'] as String? ?? '',
      fileName: json['fileName'] as String? ?? '',
      title: json['title'] as String?,
      uploadedAt: json['uploadedAt'] as String?,
      mimeType: json['mimeType'] as String?,
    );
  }

  Map<String, dynamic> toPayload() => {
        if (id.isNotEmpty) 'id': id,
        'url': url,
        'fileName': fileName,
        if (title != null && title!.trim().isNotEmpty) 'title': title!.trim(),
        if (uploadedAt != null) 'uploadedAt': uploadedAt,
        if (mimeType != null) 'mimeType': mimeType,
      };
}
