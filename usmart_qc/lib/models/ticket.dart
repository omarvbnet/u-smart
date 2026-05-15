import 'private_company_expense.dart';
import 'qfield_project.dart';

class ChecklistHistoryEntry {
  final String at;
  final List<Map<String, dynamic>> inspectionChecklist;
  final String? inspectionResult;
  final String? inspectionComments;

  ChecklistHistoryEntry({
    required this.at,
    this.inspectionChecklist = const [],
    this.inspectionResult,
    this.inspectionComments,
  });

  factory ChecklistHistoryEntry.fromJson(Map<String, dynamic> json) {
    final list = json['inspectionChecklist'];
    return ChecklistHistoryEntry(
      at: json['at'] as String? ?? '',
      inspectionChecklist: list is List
          ? list.map((e) => e as Map<String, dynamic>).toList()
          : [],
      inspectionResult: json['inspectionResult'] as String?,
      inspectionComments: json['inspectionComments'] as String?,
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
  /// QField / QGIS mobile project packages (company JSON `qfieldProjects`).
  final List<QFieldProject> qfieldProjects;
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
  /// Account id of the dashboard user who owns this ticket (TicketRequester id).
  final String? requesterId;
  /// Requester (POC) who submitted the ticket
  final String? requesterName;
  final String? requesterRole;
  final String? requesterPhone;
  /// Conflict record: reported, status, resolution, etc.
  final bool conflictReported;
  final String? conflictStatus;
  final String? conflictResolution;
  final String? conflictReportComment;
  final String? conflictReportedAt;
  final String? conflictResolvedAt;
  /// Maintenance: reason for maintenance (stored in company.maintenanceReason)
  final String? maintenanceReason;
  /// Maintenance: before photos (from VisitorRequest.beforeImageUrls)
  final List<String> beforeImageUrls;
  /// Maintenance: after photos (from VisitorRequest.finishingImageUrls)
  final List<String> finishingImageUrls;
  /// Coordinator workflow state: OPEN | IN_PROGRESS | NEEDS_EDIT | RESUBMITTED | DONE
  final String? workflowState;
  /// Reason set by engineer/technician when resubmitting for coordinator edit
  final String? resubmitReason;
  final String? resubmittedAt;
  final String? resubmitTarget;
  final double? resubmissionHours;
  /// category of the coordinator task (MAINTENANCE | QUALITY | SUPERVISION)
  final String? taskCategory;
  /// DB / company JSON: inspection checklist template id for this ticket.
  final String? checklistTemplateId;
  /// API-resolved template `{ id, name, items: [{id,label,weight}, ...] }` for display.
  final Map<String, dynamic>? checklistTemplate;
  /// `PRIVATE_COMPANY_STAFF` when ticket is owned by a workspace field team.
  final String? assignmentScope;
  /// Workspace id when [assignmentScope] is private-company scoped.
  final String? privateCompanyId;
  /// Optional department target for workspace pool visibility (null = all departments).
  final String? privateCompanyTargetDepartmentId;
  /// Additional workspace staff requester ids on the same ticket (`maintenanceCrewIds` in company JSON; used for maintenance and QC).
  final List<String> maintenanceCrewIds;
  /// ISO timestamp: field team sent completion for requester confirmation (maintenance).
  final String? maintenanceAwaitingRequesterSince;
  /// Last rejection reason from the requester (maintenance confirmation flow).
  final String? maintenanceRequesterRejectReason;
  /// Site coordinates from server (Sites table), when available.
  final double? siteLatitude;
  final double? siteLongitude;

  /// True when API allows join/leave for workspace maintenance or inspection crew (field staff).
  final bool allowWorkspaceCrewJoin;
  final List<TicketExpenseLine> ticketExpenses;
  final bool workspaceTicketExpensesEnabled;
  /// Effective preset reasons for this ticket (workspace default + per-type override from API).
  final List<String> workspaceTicketExpenseReasons;
  final String? cancellationRequestStatus;
  final String? cancellationRequestedAt;
  final String? cancellationReason;
  final String? cancellationRejectedAt;
  final String? cancellationRejectionReason;
  final bool canRequestCancellation;
  final List<String> workspaceCancellationReasons;
  final List<String> platformCancellationReasons;
  final List<String> platformResubmitReasons;
  final bool canEditForResubmit;

  List<String> get effectiveCancellationReasons =>
      platformCancellationReasons.isNotEmpty
          ? platformCancellationReasons
          : workspaceCancellationReasons;

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
    this.qfieldProjects = const [],
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
    this.requesterId,
    this.requesterName,
    this.requesterRole,
    this.requesterPhone,
    this.conflictReported = false,
    this.conflictStatus,
    this.conflictResolution,
    this.conflictReportComment,
    this.conflictReportedAt,
    this.conflictResolvedAt,
    this.maintenanceReason,
    this.beforeImageUrls = const [],
    this.finishingImageUrls = const [],
    this.workflowState,
    this.resubmitReason,
    this.resubmittedAt,
    this.resubmitTarget,
    this.resubmissionHours,
    this.taskCategory,
    this.checklistTemplateId,
    this.checklistTemplate,
    this.assignmentScope,
    this.privateCompanyId,
    this.privateCompanyTargetDepartmentId,
    this.maintenanceCrewIds = const [],
    this.maintenanceAwaitingRequesterSince,
    this.maintenanceRequesterRejectReason,
    this.siteLatitude,
    this.siteLongitude,
    this.allowWorkspaceCrewJoin = false,
    this.ticketExpenses = const [],
    this.workspaceTicketExpensesEnabled = false,
    this.workspaceTicketExpenseReasons = const [],
    this.cancellationRequestStatus,
    this.cancellationRequestedAt,
    this.cancellationReason,
    this.cancellationRejectedAt,
    this.cancellationRejectionReason,
    this.canRequestCancellation = false,
    this.workspaceCancellationReasons = const [],
    this.platformCancellationReasons = const [],
    this.platformResubmitReasons = const [],
    this.canEditForResubmit = false,
  });

  bool get isPending => status == 'PENDING';
  bool get isCancelled => status == 'CANCELLED';
  bool get hasPendingCancellationRequest => cancellationRequestStatus == 'PENDING';

  bool get awaitsRequesterResubmit =>
      workflowState == 'RESUBMITTED' && resubmitTarget == 'REQUESTER';

  bool get isWorkspaceScoped =>
      assignmentScope == 'PRIVATE_COMPANY_STAFF' && privateCompanyId != null;
  bool get isOnSite => status == 'ON_SITE';
  bool get isInProgress => status == 'IN_PROGRESS';
  bool get isCompleted => status == 'COMPLETED';
  bool get isNcr => (inspectionResult ?? '').toLowerCase() == 'ncr';

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

  bool get maintenanceAwaitingRequesterConfirmation =>
      maintenanceAwaitingRequesterSince != null &&
      maintenanceAwaitingRequesterSince!.trim().isNotEmpty;

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
      qfieldProjects: () {
        final raw = json['qfieldProjects'];
        if (raw is! List) return <QFieldProject>[];
        return raw
            .map((e) => QFieldProject.fromJson(e as Map<String, dynamic>))
            .toList();
      }(),
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
      requesterId: json['requesterId'] as String?,
      requesterName: json['requesterName'] as String?,
      requesterRole: json['requesterRole'] as String?,
      requesterPhone: json['requesterPhone'] as String?,
      conflictReported: json['conflictReported'] == true,
      conflictStatus: json['conflictStatus'] as String?,
      conflictResolution: json['conflictResolution'] as String?,
      conflictReportComment: json['conflictReportComment'] as String?,
      conflictReportedAt: json['conflictReportedAt'] as String?,
      conflictResolvedAt: json['conflictResolvedAt'] as String?,
      maintenanceReason: json['maintenanceReason'] as String?,
      beforeImageUrls: (json['beforeImageUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      finishingImageUrls: (json['finishingImageUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      workflowState: json['workflowState'] as String?,
      resubmitReason: json['resubmitReason'] as String?,
      resubmittedAt: json['resubmittedAt'] as String?,
      resubmitTarget: json['resubmitTarget'] as String?,
      resubmissionHours: (json['resubmissionHours'] as num?)?.toDouble(),
      taskCategory: json['taskCategory'] as String?,
      checklistTemplateId: json['checklistTemplateId'] as String?,
      checklistTemplate: json['checklistTemplate'] is Map
          ? Map<String, dynamic>.from(json['checklistTemplate'] as Map)
          : null,
      assignmentScope: json['assignmentScope'] as String?,
      privateCompanyId: json['privateCompanyId'] as String?,
      privateCompanyTargetDepartmentId:
          json['privateCompanyTargetDepartmentId'] as String?,
      maintenanceCrewIds: (json['maintenanceCrewIds'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .where((s) => s.isNotEmpty)
              .toList() ??
          const [],
      maintenanceAwaitingRequesterSince: json['maintenanceAwaitingRequesterSince'] as String?,
      maintenanceRequesterRejectReason: json['maintenanceRequesterRejectReason'] as String?,
      siteLatitude: (json['siteLatitude'] as num?)?.toDouble(),
      siteLongitude: (json['siteLongitude'] as num?)?.toDouble(),
      allowWorkspaceCrewJoin: json['allowWorkspaceCrewJoin'] == true,
      workspaceTicketExpensesEnabled: () {
        final s = json['workspaceExpenseSettings'];
        if (s is Map) return s['enabled'] == true;
        return false;
      }(),
      workspaceTicketExpenseReasons: () {
        final s = json['workspaceExpenseSettings'];
        if (s is Map) {
          final r = s['reasons'];
          if (r is List) {
            return List<String>.from(
              r.map((e) => e.toString().trim()).where((x) => x.isNotEmpty),
            );
          }
        }
        return const <String>[];
      }(),
      ticketExpenses: (json['ticketExpenses'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(TicketExpenseLine.fromJson)
              .toList() ??
          const [],
      cancellationRequestStatus: json['cancellationRequestStatus'] as String?,
      cancellationRequestedAt: json['cancellationRequestedAt'] as String?,
      cancellationReason: json['cancellationReason'] as String?,
      cancellationRejectedAt: json['cancellationRejectedAt'] as String?,
      cancellationRejectionReason: json['cancellationRejectionReason'] as String?,
      canRequestCancellation: json['canRequestCancellation'] == true,
      workspaceCancellationReasons: () {
        final raw = json['workspaceCancellationReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      platformCancellationReasons: () {
        final raw = json['platformCancellationReasons'] ?? json['workspaceCancellationReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      platformResubmitReasons: () {
        final raw = json['platformResubmitReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      canEditForResubmit: json['canEditForResubmit'] == true,
    );
  }

  static const List<String> maintenanceTechniques = [
    'fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth',
  ];

  /// Updated when admin/requester loads `/api/provisor-techniques` (maintenance slugs).
  static List<String> maintenanceSlugs = List<String>.from(maintenanceTechniques);

  bool get isMaintenance =>
      maintenanceSlugs.any((s) => s.toLowerCase() == technique.toLowerCase());
}
