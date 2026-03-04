/// Represents a conflict case for a ticket with inspection result
/// not_accepted, ncr, or accepted_with_comments.
class ConflictCase {
  final String id;
  final String ticketId;
  final String? siteName;
  final String? siteCoordinator;
  final String? assignedEngineerId;
  final String? assignedEngineerName;
  final String inspectionResult;
  final String? inspectionComments;
  final String? ncrReason;
  final List<Map<String, dynamic>>? inspectionChecklist;
  final String status; // pending, resolved, re_inspection
  final String? resolvedBy;
  final String? resolvedAt;
  final String? resolution; // accepted, not_accepted, ncr, accepted_with_comments, re_inspection, keep_same
  final String? resolutionComment;
  final String? conflictReportComment;
  final String? reportedBy;
  final String? reportedAt;

  ConflictCase({
    required this.id,
    required this.ticketId,
    this.siteName,
    this.siteCoordinator,
    this.assignedEngineerId,
    this.assignedEngineerName,
    required this.inspectionResult,
    this.inspectionComments,
    this.ncrReason,
    this.inspectionChecklist,
    this.status = 'pending',
    this.resolvedBy,
    this.resolvedAt,
    this.resolution,
    this.resolutionComment,
    this.conflictReportComment,
    this.reportedBy,
    this.reportedAt,
  });

  bool get isPending => status == 'pending';
  bool get isResolved => status == 'resolved';
  bool get isReInspection => status == 're_inspection';

  factory ConflictCase.fromJson(Map<String, dynamic> json) {
    return ConflictCase(
      id: json['id'] as String,
      ticketId: json['ticketId'] as String,
      siteName: json['siteName'] as String?,
      siteCoordinator: json['siteCoordinator'] as String?,
      assignedEngineerId: json['assignedEngineerId'] as String?,
      assignedEngineerName: json['assignedEngineerName'] as String?,
      inspectionResult: json['inspectionResult'] as String? ?? 'not_accepted',
      inspectionComments: json['inspectionComments'] as String?,
      ncrReason: json['ncrReason'] as String?,
      inspectionChecklist: json['inspectionChecklist'] is List
          ? (json['inspectionChecklist'] as List)
              .map((e) => e as Map<String, dynamic>)
              .toList()
          : null,
      status: json['status'] as String? ?? 'pending',
      resolvedBy: json['resolvedBy'] as String?,
      resolvedAt: json['resolvedAt'] as String?,
      resolution: json['resolution'] as String?,
      resolutionComment: json['resolutionComment'] as String?,
      conflictReportComment: json['conflictReportComment'] as String?,
      reportedBy: json['reportedBy'] as String?,
      reportedAt: json['reportedAt'] as String?,
    );
  }
}
