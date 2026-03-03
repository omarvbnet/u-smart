class ChecklistHistoryEntry {
  final String at;
  final List<Map<String, dynamic>> inspectionChecklist;
  final String? inspectionResult;

  ChecklistHistoryEntry({
    required this.at,
    this.inspectionChecklist = const [],
    this.inspectionResult,
  });

  factory ChecklistHistoryEntry.fromJson(Map<String, dynamic> json) {
    final list = json['inspectionChecklist'];
    return ChecklistHistoryEntry(
      at: json['at'] as String? ?? '',
      inspectionChecklist: list is List
          ? list.map((e) => e as Map<String, dynamic>).toList()
          : [],
      inspectionResult: json['inspectionResult'] as String?,
    );
  }
}

class StatusLogEntry {
  final String status;
  final DateTime createdAt;

  StatusLogEntry({required this.status, required this.createdAt});

  factory StatusLogEntry.fromJson(Map<String, dynamic> json) {
    return StatusLogEntry(
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class NcrResubmission {
  final String at;
  final String by;
  final String action;
  final String? comment;
  final List<String> imageUrls;

  NcrResubmission({
    required this.at,
    required this.by,
    required this.action,
    this.comment,
    this.imageUrls = const [],
  });

  factory NcrResubmission.fromJson(Map<String, dynamic> json) {
    return NcrResubmission(
      at: json['at'] as String? ?? '',
      by: json['by'] as String? ?? '',
      action: json['action'] as String? ?? 'resubmit',
      comment: json['comment'] as String?,
      imageUrls: (json['imageUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
    );
  }
}

class Ticket {
  final String id;
  final String? siteName;
  final String? siteCoordinator;
  final int? slaHours;
  final String technique;
  final String status;
  final DateTime createdAt;
  final String? completedAt;
  final String? designSpecifications;
  final List<String> attachmentUrls;
  final String? inspectionResult;
  final String? inspectionComments;
  final String? ncrReason;
  final List<String> ncrImageUrls;
  final List<NcrResubmission> ncrResubmissions;
  final List<StatusLogEntry> statusTimeline;
  final String? assignedEngineerId;
  final String? assignedEngineerName;
  final String? assignedAt;
  final List<Map<String, dynamic>>? inspectionChecklist;
  /// Previous inspection records (e.g. before NCR-approved re-inspection)
  final List<ChecklistHistoryEntry> checklistHistory;
  /// Requester (POC) who submitted the ticket
  final String? requesterName;
  final String? requesterRole;
  final String? requesterPhone;

  Ticket({
    required this.id,
    this.siteName,
    this.siteCoordinator,
    this.slaHours,
    required this.technique,
    required this.status,
    required this.createdAt,
    this.completedAt,
    this.designSpecifications,
    this.attachmentUrls = const [],
    this.inspectionResult,
    this.inspectionComments,
    this.ncrReason,
    this.ncrImageUrls = const [],
    this.ncrResubmissions = const [],
    this.statusTimeline = const [],
    this.assignedEngineerId,
    this.assignedEngineerName,
    this.assignedAt,
    this.inspectionChecklist,
    this.checklistHistory = const [],
    this.requesterName,
    this.requesterRole,
    this.requesterPhone,
  });

  bool get isPending => status == 'PENDING';
  bool get isOnSite => status == 'ON_SITE';
  bool get isInProgress => status == 'IN_PROGRESS';
  bool get isCompleted => status == 'COMPLETED';
  bool get isNcr => inspectionResult == 'ncr';

  /// True when requester has resubmitted and engineer has not yet responded
  bool get hasPendingEngineerNcrResponse {
    if (ncrResubmissions.isEmpty) return false;
    final last = ncrResubmissions.last;
    return last.by == 'requester' && last.action == 'resubmit';
  }

  /// True when inspection result is not_accepted, ncr, or accepted_with_comments
  bool get isConflictResult {
    final r = (inspectionResult ?? '').toLowerCase();
    return r == 'not_accepted' || r == 'ncr' || r == 'accepted_with_comments';
  }
  bool get isAssigned => assignedEngineerId != null;
  bool get canBeAssigned => isPending && !isAssigned;

  /// Inspection duration in hours (from first ON_SITE/IN_PROGRESS to completedAt). Null if not completed.
  double? get inspectionHours {
    if (completedAt == null || completedAt!.isEmpty) return null;
    final completed = DateTime.tryParse(completedAt!);
    if (completed == null) return null;
    DateTime? start;
    for (final log in statusTimeline) {
      final s = log.status.toUpperCase();
      if (s == 'ON_SITE' || s == 'IN_PROGRESS') {
        if (start == null || log.createdAt.isBefore(start)) {
          start = log.createdAt;
        }
      }
    }
    start ??= createdAt;
    return completed.difference(start).inMilliseconds / (1000 * 60 * 60);
  }

  factory Ticket.fromJson(Map<String, dynamic> json) {
    return Ticket(
      id: json['id'] as String,
      siteName: json['siteName'] as String?,
      siteCoordinator: json['siteCoordinator'] as String?,
      slaHours: json['slaHours'] as int?,
      technique: json['technique'] as String,
      status: json['status'] as String? ?? 'PENDING',
      createdAt: DateTime.parse(json['createdAt'] as String),
      completedAt: json['completedAt'] as String?,
      designSpecifications: json['designSpecifications'] as String?,
      attachmentUrls: (json['attachmentUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      inspectionResult: json['inspectionResult'] as String?,
      inspectionComments: json['inspectionComments'] as String?,
      ncrReason: json['ncrReason'] as String?,
      ncrImageUrls: (json['ncrImageUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      ncrResubmissions: (json['ncrResubmissions'] as List<dynamic>?)
              ?.map((e) =>
                  NcrResubmission.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      statusTimeline: (json['statusTimeline'] as List<dynamic>?)
              ?.map((e) =>
                  StatusLogEntry.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      assignedEngineerId: json['assignedEngineerId'] as String?,
      assignedEngineerName: json['assignedEngineerName'] as String?,
      assignedAt: json['assignedAt'] as String?,
      inspectionChecklist: json['inspectionChecklist'] is List
          ? (json['inspectionChecklist'] as List)
              .map((e) => e as Map<String, dynamic>)
              .toList()
          : null,
      checklistHistory: (json['checklistHistory'] as List<dynamic>?)
              ?.map((e) => ChecklistHistoryEntry.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      requesterName: json['requesterName'] as String?,
      requesterRole: json['requesterRole'] as String?,
      requesterPhone: json['requesterPhone'] as String?,
    );
  }
}
