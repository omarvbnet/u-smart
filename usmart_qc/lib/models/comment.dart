class TicketComment {
  final String id;
  final String authorId;
  final String authorName;
  final String body;
  final DateTime createdAt;
  /// 'engineer' | 'requester'
  final String authorRole;

  TicketComment({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.body,
    required this.createdAt,
    this.authorRole = 'requester',
  });

  factory TicketComment.fromJson(Map<String, dynamic> json) {
    return TicketComment(
      id: json['id'] as String,
      authorId: json['authorId'] as String? ?? '',
      authorName: json['authorName'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorRole: json['authorRole'] as String? ?? 'requester',
    );
  }
}
