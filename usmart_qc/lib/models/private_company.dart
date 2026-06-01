import 'package:flutter/material.dart';

/// Ticket plan tiers a workspace can buy.
enum WorkspaceTicketPlan { pack100, pack1000, yearlyUnlimited }

extension WorkspaceTicketPlanX on WorkspaceTicketPlan {
  /// Server enum value.
  String get apiValue {
    switch (this) {
      case WorkspaceTicketPlan.pack100:
        return 'PACK_100';
      case WorkspaceTicketPlan.pack1000:
        return 'PACK_1000';
      case WorkspaceTicketPlan.yearlyUnlimited:
        return 'YEARLY_UNLIMITED';
    }
  }
}

WorkspaceTicketPlan? workspaceTicketPlanFromString(dynamic raw) {
  switch ((raw ?? '').toString().toUpperCase()) {
    case 'PACK_100':
      return WorkspaceTicketPlan.pack100;
    case 'PACK_1000':
      return WorkspaceTicketPlan.pack1000;
    case 'YEARLY_UNLIMITED':
      return WorkspaceTicketPlan.yearlyUnlimited;
    default:
      return null;
  }
}

/// Ticket quota snapshot for a workspace (free tier + purchased credits / unlimited).
class WorkspaceBilling {
  WorkspaceBilling({
    required this.freeLimit,
    required this.used,
    required this.creditsTotal,
    required this.unlimited,
    this.unlimitedUntil,
    this.allowance,
    this.remaining,
  });

  final int freeLimit;
  final int used;
  final int creditsTotal;
  final bool unlimited;
  final DateTime? unlimitedUntil;

  /// Free + purchased credits. Null when unlimited.
  final int? allowance;

  /// Tickets left before creation is blocked. Null when unlimited.
  final int? remaining;

  bool get quotaReached => !unlimited && (remaining ?? 0) <= 0;

  factory WorkspaceBilling.fromJson(Map<String, dynamic> json) {
    return WorkspaceBilling(
      freeLimit: (json['freeLimit'] as num?)?.toInt() ?? 30,
      used: (json['used'] as num?)?.toInt() ?? 0,
      creditsTotal: (json['creditsTotal'] as num?)?.toInt() ?? 0,
      unlimited: json['unlimited'] == true,
      unlimitedUntil: json['unlimitedUntil'] != null
          ? DateTime.tryParse(json['unlimitedUntil'].toString())
          : null,
      allowance: (json['allowance'] as num?)?.toInt(),
      remaining: (json['remaining'] as num?)?.toInt(),
    );
  }
}

/// Latest ticket plan request submitted by the workspace (for status display).
class WorkspacePlanRequest {
  WorkspacePlanRequest({
    required this.id,
    required this.planType,
    required this.status,
    required this.contactPhone,
    this.createdAt,
  });

  final String id;
  final WorkspaceTicketPlan? planType;
  final String status;
  final String contactPhone;
  final DateTime? createdAt;

  bool get isPending => status.toUpperCase() == 'PENDING';

  factory WorkspacePlanRequest.fromJson(Map<String, dynamic> json) {
    return WorkspacePlanRequest(
      id: json['id'] as String? ?? '',
      planType: workspaceTicketPlanFromString(json['planType']),
      status: (json['status'] as String? ?? 'PENDING').toUpperCase(),
      contactPhone: json['contactPhone'] as String? ?? '',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

/// Status of the private company workspace request.
enum PrivateCompanyStatus { pending, approved, rejected, suspended, unknown }

PrivateCompanyStatus privateCompanyStatusFromString(dynamic raw) {
  switch ((raw ?? '').toString().toUpperCase()) {
    case 'PENDING':
      return PrivateCompanyStatus.pending;
    case 'APPROVED':
      return PrivateCompanyStatus.approved;
    case 'REJECTED':
      return PrivateCompanyStatus.rejected;
    case 'SUSPENDED':
      return PrivateCompanyStatus.suspended;
    default:
      return PrivateCompanyStatus.unknown;
  }
}

extension PrivateCompanyStatusX on PrivateCompanyStatus {
  String get label {
    switch (this) {
      case PrivateCompanyStatus.pending:
        return 'Pending review';
      case PrivateCompanyStatus.approved:
        return 'Approved';
      case PrivateCompanyStatus.rejected:
        return 'Rejected';
      case PrivateCompanyStatus.suspended:
        return 'Suspended';
      case PrivateCompanyStatus.unknown:
        return 'Unknown';
    }
  }

  Color get color {
    switch (this) {
      case PrivateCompanyStatus.pending:
        return const Color(0xFFFBBF24);
      case PrivateCompanyStatus.approved:
        return const Color(0xFF4ADE80);
      case PrivateCompanyStatus.rejected:
        return const Color(0xFFFF4757);
      case PrivateCompanyStatus.suspended:
        return const Color(0xFF94A3B8);
      case PrivateCompanyStatus.unknown:
        return const Color(0xFF6B7280);
    }
  }

  IconData get icon {
    switch (this) {
      case PrivateCompanyStatus.pending:
        return Icons.hourglass_top_rounded;
      case PrivateCompanyStatus.approved:
        return Icons.verified_rounded;
      case PrivateCompanyStatus.rejected:
        return Icons.block_rounded;
      case PrivateCompanyStatus.suspended:
        return Icons.pause_circle_rounded;
      case PrivateCompanyStatus.unknown:
        return Icons.help_outline_rounded;
    }
  }
}

/// One department inside a private company.
class PrivateCompanyDepartment {
  PrivateCompanyDepartment({
    required this.id,
    required this.name,
    this.description,
    this.color,
    this.iconKey,
    this.sortOrder = 0,
    this.memberCount = 0,
    this.members = const [],
    this.maintenanceProximityJoinEnabled = false,
    this.maintenanceProximityRadiusM = 500,
    this.siteArrivalAutoOnSiteEnabled,
    this.engineerAvailabilityPoolEnabled = true,
    this.technicianAvailabilityPoolEnabled = true,
    this.maintenanceDispatchMode = 'DIRECT_TECHNICIAN',
    this.engineerTicketScope = 'BOTH',
    this.crewCanLogExpenses = false,
    this.crewCanCloseTickets = false,
  });

  final String id;
  final String name;
  final String? description;
  final String? color;
  final String? iconKey;
  final int sortOrder;
  final int memberCount;
  final List<PrivateCompanyStaff> members;
  final bool maintenanceProximityJoinEnabled;
  final int maintenanceProximityRadiusM;
  /// null = inherit workspace default (auto ON_SITE when near site).
  final bool? siteArrivalAutoOnSiteEnabled;
  final bool engineerAvailabilityPoolEnabled;
  final bool technicianAvailabilityPoolEnabled;
  /// `DIRECT_TECHNICIAN` (default) or `ENGINEER_ASSIGNS` (engineer/coordinator assigns techs first).
  final String maintenanceDispatchMode;
  /// `QC_ONLY` | `MAINTENANCE_ONLY` | `BOTH` — default for engineers in this department.
  final String engineerTicketScope;
  /// When false, crew (non-lead) members on the same maintenance ticket cannot log expenses.
  final bool crewCanLogExpenses;
  /// When false, crew (non-lead) members on the same maintenance ticket cannot close it.
  final bool crewCanCloseTickets;

  Color get colorValue {
    final raw = color;
    if (raw == null || !raw.startsWith('#') || raw.length != 7) {
      return const Color(0xFF6C63FF);
    }
    try {
      return Color(int.parse('FF${raw.substring(1)}', radix: 16));
    } catch (_) {
      return const Color(0xFF6C63FF);
    }
  }

  factory PrivateCompanyDepartment.fromJson(Map<String, dynamic> json) {
    final membersRaw = json['members'];
    final members = membersRaw is List
        ? membersRaw
            .whereType<Map<String, dynamic>>()
            .map(PrivateCompanyStaff.fromJson)
            .toList()
        : <PrivateCompanyStaff>[];
    final countMap = json['_count'];
    final memberCount = countMap is Map && countMap['members'] is int
        ? countMap['members'] as int
        : members.length;
    return PrivateCompanyDepartment(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      color: json['color'] as String?,
      iconKey: json['iconKey'] as String?,
      sortOrder: (json['sortOrder'] as int?) ?? 0,
      memberCount: memberCount,
      members: members,
      maintenanceProximityJoinEnabled: json['maintenanceProximityJoinEnabled'] == true,
      maintenanceProximityRadiusM: (json['maintenanceProximityRadiusM'] as num?)?.toInt() ?? 500,
      siteArrivalAutoOnSiteEnabled: json['siteArrivalAutoOnSiteEnabled'] is bool
          ? json['siteArrivalAutoOnSiteEnabled'] as bool
          : null,
      engineerAvailabilityPoolEnabled: json['engineerAvailabilityPoolEnabled'] != false,
      technicianAvailabilityPoolEnabled: json['technicianAvailabilityPoolEnabled'] != false,
      maintenanceDispatchMode: _normalizeMaintenanceDispatchMode(
          json['maintenanceDispatchMode'] as String?),
      engineerTicketScope: _normalizeEngineerTicketScope(
          json['engineerTicketScope'] as String?),
      crewCanLogExpenses: json['crewCanLogExpenses'] == true,
      crewCanCloseTickets: json['crewCanCloseTickets'] == true,
    );
  }

  static String _normalizeEngineerTicketScope(String? raw) {
    final u = (raw ?? '').trim().toUpperCase();
    if (u == 'QC_ONLY') return 'QC_ONLY';
    if (u == 'MAINTENANCE_ONLY') return 'MAINTENANCE_ONLY';
    return 'BOTH';
  }

  static String _normalizeMaintenanceDispatchMode(String? raw) {
    final u = (raw ?? '').trim().toUpperCase();
    if (u == 'ENGINEER_ASSIGNS') return 'ENGINEER_ASSIGNS';
    return 'DIRECT_TECHNICIAN';
  }
}

/// A staff member inside a private company workspace.
class PrivateCompanyStaff {
  PrivateCompanyStaff({
    required this.id,
    required this.username,
    this.name,
    this.email,
    this.phone,
    required this.role,
    this.specialization,
    this.status = 'ACTIVE',
    this.departmentId,
    this.province,
    this.provinceFilterActive = true,
    this.createdAt,
    this.privateCompanyAllowedTaskSlugs = const [],
    this.maintenanceProximityJoinOverride,
    this.maintenanceProximityRadiusOverrideM,
    this.engineerTicketScopeOverride,
  });

  final String id;
  final String username;
  final String? name;
  final String? email;
  final String? phone;
  final String role;
  final String? specialization;
  final String status;
  final String? departmentId;
  final String? province;
  final bool provinceFilterActive;
  final DateTime? createdAt;
  final List<String> privateCompanyAllowedTaskSlugs;
  final bool? maintenanceProximityJoinOverride;
  final int? maintenanceProximityRadiusOverrideM;
  /// Per-engineer override: QC_ONLY | MAINTENANCE_ONLY | BOTH | null = use department default.
  final String? engineerTicketScopeOverride;

  factory PrivateCompanyStaff.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyStaff(
      id: json['id'] as String,
      username: json['username'] as String? ?? '',
      name: json['name'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      role: (json['role'] as String? ?? 'WORKER').toUpperCase(),
      specialization: json['specialization'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      departmentId: json['privateCompanyDepartmentId'] as String?,
      province: (json['province'] as String?)?.trim().isEmpty == true
          ? null
          : json['province'] as String?,
      provinceFilterActive: json['provinceFilterActive'] is bool
          ? json['provinceFilterActive'] as bool
          : true,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      privateCompanyAllowedTaskSlugs: () {
        final raw = json['privateCompanyAllowedTaskSlugs'];
        if (raw is! List) return <String>[];
        return raw
            .map((e) => e.toString().trim().toLowerCase())
            .where((s) => s.isNotEmpty)
            .toList();
      }(),
      maintenanceProximityJoinOverride: json['maintenanceProximityJoinOverride'] is bool
          ? json['maintenanceProximityJoinOverride'] as bool
          : null,
      maintenanceProximityRadiusOverrideM:
          (json['maintenanceProximityRadiusOverrideM'] as num?)?.toInt(),
      engineerTicketScopeOverride: () {
        final raw = json['privateCompanyEngineerTicketScope'];
        if (raw == null || raw.toString().trim().isEmpty) return null;
        return PrivateCompanyDepartment._normalizeEngineerTicketScope(raw.toString());
      }(),
    );
  }
}

/// Severity of a checklist item — used during inspection to weight findings.
enum PrivateCompanyChecklistItemSeverity { minor, major }

PrivateCompanyChecklistItemSeverity _severityFromString(String? raw, {String? weightFallback}) {
  final v = (raw ?? weightFallback ?? '').trim().toLowerCase();
  return v == 'major'
      ? PrivateCompanyChecklistItemSeverity.major
      : PrivateCompanyChecklistItemSeverity.minor;
}

String _severityToString(PrivateCompanyChecklistItemSeverity s) =>
    s == PrivateCompanyChecklistItemSeverity.major ? 'major' : 'minor';

/// One workspace checklist item.
class PrivateCompanyChecklistItem {
  PrivateCompanyChecklistItem({
    required this.id,
    required this.label,
    this.weight,
    this.required = false,
    this.severity = PrivateCompanyChecklistItemSeverity.minor,
  });

  final String id;
  final String label;
  final String? weight;
  final bool required;
  final PrivateCompanyChecklistItemSeverity severity;

  bool get isMajor => severity == PrivateCompanyChecklistItemSeverity.major;

  factory PrivateCompanyChecklistItem.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyChecklistItem(
      id: json['id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      weight: json['weight'] as String?,
      required: json['required'] == true,
      severity: _severityFromString(
        json['severity'] as String?,
        weightFallback: json['weight'] as String?,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        if (weight != null) 'weight': weight,
        if (required) 'required': true,
        'severity': _severityToString(severity),
      };
}

class PrivateCompanyChecklist {
  PrivateCompanyChecklist({
    required this.id,
    required this.name,
    this.description,
    this.category,
    this.techniqueTypes = const [],
    this.items = const [],
    this.createdById,
    this.createdByName,
    this.departmentId,
    this.createdAt,
  });

  final String id;
  final String name;
  final String? description;
  final String? category;
  final List<String> techniqueTypes;
  final List<PrivateCompanyChecklistItem> items;
  final String? createdById;
  final String? createdByName;
  final String? departmentId;
  final DateTime? createdAt;

  factory PrivateCompanyChecklist.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final items = rawItems is List
        ? rawItems
            .whereType<Map<String, dynamic>>()
            .map(PrivateCompanyChecklistItem.fromJson)
            .toList()
        : <PrivateCompanyChecklistItem>[];
    final createdBy = json['createdBy'];
    return PrivateCompanyChecklist(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      category: json['category'] as String?,
      techniqueTypes: ((json['techniqueTypes'] as List<dynamic>?) ?? [])
          .whereType<String>()
          .toList(),
      items: items,
      createdById: json['createdById'] as String?,
      createdByName: createdBy is Map<String, dynamic>
          ? (createdBy['name'] as String? ?? createdBy['username'] as String?)
          : null,
      departmentId: json['departmentId'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

/// Workspace metadata + departments + staff + checklists. Used by both
/// the owner and staff views (the staff view excludes most owner-only fields).
class PrivateCompanyWorkspace {
  PrivateCompanyWorkspace({
    required this.id,
    required this.name,
    this.description,
    this.logoUrl,
    required this.status,
    this.rejectionReason,
    this.approvedAt,
    required this.createdAt,
    required this.updatedAt,
    this.departments = const [],
    this.staff = const [],
    this.checklists = const [],
    this.materialUseReasons = const [],
    this.ticketExpensesEnabled = false,
    this.ticketExpenseReasons = const [],
    this.ticketCancellationReasons = const [],
    this.ticketExpensesActivationPending = false,
  });

  final String id;
  final String name;
  final String? description;
  final String? logoUrl;
  final PrivateCompanyStatus status;
  final String? rejectionReason;
  final DateTime? approvedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<PrivateCompanyDepartment> departments;
  final List<PrivateCompanyStaff> staff;
  final List<PrivateCompanyChecklist> checklists;
  /// Workspace-defined reasons for material USE / DAMAGE / LOST (audit dropdown).
  final List<String> materialUseReasons;
  final bool ticketExpensesEnabled;
  final List<String> ticketExpenseReasons;
  final List<String> ticketCancellationReasons;
  final bool ticketExpensesActivationPending;

  bool get isApproved => status == PrivateCompanyStatus.approved;
  bool get isPending => status == PrivateCompanyStatus.pending;
  bool get isRejected => status == PrivateCompanyStatus.rejected;
  bool get isSuspended => status == PrivateCompanyStatus.suspended;

  factory PrivateCompanyWorkspace.fromJson(Map<String, dynamic> json) {
    final departmentsRaw = json['departments'];
    final staffRaw = json['staff'];
    final checklistsRaw = json['checklists'];
    return PrivateCompanyWorkspace(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      logoUrl: json['logoUrl'] as String?,
      status: privateCompanyStatusFromString(json['status']),
      rejectionReason: json['rejectionReason'] as String?,
      approvedAt: json['approvedAt'] != null
          ? DateTime.tryParse(json['approvedAt'].toString())
          : null,
      createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()) ??
          DateTime.now(),
      updatedAt: DateTime.tryParse((json['updatedAt'] ?? '').toString()) ??
          DateTime.now(),
      departments: departmentsRaw is List
          ? departmentsRaw
              .whereType<Map<String, dynamic>>()
              .map(PrivateCompanyDepartment.fromJson)
              .toList()
          : const [],
      staff: staffRaw is List
          ? staffRaw
              .whereType<Map<String, dynamic>>()
              .map(PrivateCompanyStaff.fromJson)
              .toList()
          : const [],
      checklists: checklistsRaw is List
          ? checklistsRaw
              .whereType<Map<String, dynamic>>()
              .map(PrivateCompanyChecklist.fromJson)
              .toList()
          : const [],
      materialUseReasons: () {
        final raw = json['materialUseReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      ticketExpensesEnabled: json['ticketExpensesEnabled'] == true,
      ticketExpenseReasons: () {
        final raw = json['ticketExpenseReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      ticketCancellationReasons: () {
        final raw = json['ticketCancellationReasons'];
        if (raw is! List) return const <String>[];
        return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }(),
      ticketExpensesActivationPending: json['ticketExpensesActivationPending'] == true,
    );
  }
}

class PrivateCompanyMembership {
  PrivateCompanyMembership({
    this.isOwner = false,
    this.isStaff = false,
    this.status,
    this.departmentId,
    this.departmentName,
    this.role,
    this.specialization,
  });

  final bool isOwner;
  final bool isStaff;
  final PrivateCompanyStatus? status;
  final String? departmentId;
  final String? departmentName;
  /// Authoritative server-side role (uppercase) for the requester inside the
  /// workspace context. Used by permission helpers when the staff list is not
  /// available client-side.
  final String? role;
  final String? specialization;

  factory PrivateCompanyMembership.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyMembership(
      isOwner: json['isOwner'] == true,
      isStaff: json['isStaff'] == true,
      status: json['status'] != null
          ? privateCompanyStatusFromString(json['status'])
          : null,
      departmentId: json['departmentId'] as String?,
      departmentName: json['departmentName'] as String?,
      role: (json['role'] as String?)?.toUpperCase(),
      specialization: json['specialization'] as String?,
    );
  }

  bool get hasNoMembership => !isOwner && !isStaff;
}

/// Aggregated KPIs for one department (owner workspace view).
class PrivateCompanyDepartmentKpi {
  PrivateCompanyDepartmentKpi({
    required this.departmentId,
    required this.departmentName,
    required this.ticketsAssigned,
    required this.completedTickets,
    required this.avgTicketAssignmentsPerDay,
    required this.totalTaskHours,
    this.avgTaskHours,
    required this.totalArrivalHours,
    this.avgArrivalHours,
    this.totalResubmissionHours = 0,
    this.avgResubmissionHours,
  });

  final String? departmentId;
  final String departmentName;
  final int ticketsAssigned;
  final int completedTickets;
  final double avgTicketAssignmentsPerDay;
  final double totalTaskHours;
  final double? avgTaskHours;
  final double totalArrivalHours;
  final double? avgArrivalHours;
  final double totalResubmissionHours;
  final double? avgResubmissionHours;

  factory PrivateCompanyDepartmentKpi.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyDepartmentKpi(
      departmentId: json['departmentId'] as String?,
      departmentName: json['departmentName'] as String? ?? '—',
      ticketsAssigned: (json['ticketsAssigned'] as num?)?.toInt() ?? 0,
      completedTickets: (json['completedTickets'] as num?)?.toInt() ?? 0,
      avgTicketAssignmentsPerDay:
          (json['avgTicketAssignmentsPerDay'] as num?)?.toDouble() ?? 0,
      totalTaskHours: (json['totalTaskHours'] as num?)?.toDouble() ?? 0,
      avgTaskHours: (json['avgTaskHours'] as num?)?.toDouble(),
      totalArrivalHours: (json['totalArrivalHours'] as num?)?.toDouble() ?? 0,
      avgArrivalHours: (json['avgArrivalHours'] as num?)?.toDouble(),
      totalResubmissionHours:
          (json['totalResubmissionHours'] as num?)?.toDouble() ?? 0,
      avgResubmissionHours: (json['avgResubmissionHours'] as num?)?.toDouble(),
    );
  }
}

/// Aggregated KPIs for one Iraq governorate (staff home province).
class PrivateCompanyProvinceKpi {
  PrivateCompanyProvinceKpi({
    required this.province,
    required this.staffCount,
    required this.ticketsAssigned,
    required this.completedTickets,
    required this.avgTicketAssignmentsPerDay,
    required this.totalTaskHours,
    this.avgTaskHours,
    required this.totalArrivalHours,
    this.avgArrivalHours,
    this.totalResubmissionHours = 0,
    this.avgResubmissionHours,
  });

  final String province;
  final int staffCount;
  final int ticketsAssigned;
  final int completedTickets;
  final double avgTicketAssignmentsPerDay;
  final double totalTaskHours;
  final double? avgTaskHours;
  final double totalArrivalHours;
  final double? avgArrivalHours;
  final double totalResubmissionHours;
  final double? avgResubmissionHours;

  factory PrivateCompanyProvinceKpi.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyProvinceKpi(
      province: json['province'] as String? ?? '—',
      staffCount: (json['staffCount'] as num?)?.toInt() ?? 0,
      ticketsAssigned: (json['ticketsAssigned'] as num?)?.toInt() ?? 0,
      completedTickets: (json['completedTickets'] as num?)?.toInt() ?? 0,
      avgTicketAssignmentsPerDay:
          (json['avgTicketAssignmentsPerDay'] as num?)?.toDouble() ?? 0,
      totalTaskHours: (json['totalTaskHours'] as num?)?.toDouble() ?? 0,
      avgTaskHours: (json['avgTaskHours'] as num?)?.toDouble(),
      totalArrivalHours: (json['totalArrivalHours'] as num?)?.toDouble() ?? 0,
      avgArrivalHours: (json['avgArrivalHours'] as num?)?.toDouble(),
      totalResubmissionHours:
          (json['totalResubmissionHours'] as num?)?.toDouble() ?? 0,
      avgResubmissionHours: (json['avgResubmissionHours'] as num?)?.toDouble(),
    );
  }
}

/// KPI row for one staff member (assigned private-company tickets).
class PrivateCompanyStaffKpi {
  PrivateCompanyStaffKpi({
    required this.staffId,
    required this.name,
    required this.username,
    required this.role,
    this.province,
    this.departmentId,
    this.departmentName,
    required this.ticketsAssigned,
    required this.completedTickets,
    required this.avgTicketAssignmentsPerDay,
    required this.totalTaskHours,
    this.avgTaskHours,
    required this.totalArrivalHours,
    this.avgArrivalHours,
    this.crewJoins = 0,
    this.totalResubmissionHours = 0,
    this.avgResubmissionHours,
  });

  final String staffId;
  final String name;
  final String username;
  final String role;
  final String? province;
  final String? departmentId;
  final String? departmentName;
  final int ticketsAssigned;
  final int completedTickets;
  final double avgTicketAssignmentsPerDay;
  final double totalTaskHours;
  final double? avgTaskHours;
  final double totalArrivalHours;
  final double? avgArrivalHours;
  final int crewJoins;
  final double totalResubmissionHours;
  final double? avgResubmissionHours;

  factory PrivateCompanyStaffKpi.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyStaffKpi(
      staffId: json['staffId'] as String,
      name: json['name'] as String? ?? '',
      username: json['username'] as String? ?? '',
      role: (json['role'] as String? ?? '').toUpperCase(),
      province: json['province'] as String?,
      departmentId: json['departmentId'] as String?,
      departmentName: json['departmentName'] as String?,
      ticketsAssigned: (json['ticketsAssigned'] as num?)?.toInt() ?? 0,
      completedTickets: (json['completedTickets'] as num?)?.toInt() ?? 0,
      avgTicketAssignmentsPerDay:
          (json['avgTicketAssignmentsPerDay'] as num?)?.toDouble() ?? 0,
      totalTaskHours: (json['totalTaskHours'] as num?)?.toDouble() ?? 0,
      avgTaskHours: (json['avgTaskHours'] as num?)?.toDouble(),
      totalArrivalHours: (json['totalArrivalHours'] as num?)?.toDouble() ?? 0,
      avgArrivalHours: (json['avgArrivalHours'] as num?)?.toDouble(),
      crewJoins: (json['crewJoins'] as num?)?.toInt() ?? 0,
      totalResubmissionHours:
          (json['totalResubmissionHours'] as num?)?.toDouble() ?? 0,
      avgResubmissionHours: (json['avgResubmissionHours'] as num?)?.toDouble(),
    );
  }
}

class PrivateCompanyKpiSnapshot {
  PrivateCompanyKpiSnapshot({
    required this.scope,
    required this.days,
    required this.ticketSampleSize,
    this.provinceFilter,
    this.byDepartment = const [],
    this.byProvince = const [],
    this.byStaff = const [],
  });

  final String scope;
  final int days;
  final int ticketSampleSize;
  final String? provinceFilter;
  final List<PrivateCompanyDepartmentKpi> byDepartment;
  final List<PrivateCompanyProvinceKpi> byProvince;
  final List<PrivateCompanyStaffKpi> byStaff;

  factory PrivateCompanyKpiSnapshot.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyKpiSnapshot(
      scope: json['scope'] as String? ?? 'self',
      days: (json['days'] as num?)?.toInt() ?? 365,
      ticketSampleSize: (json['ticketSampleSize'] as num?)?.toInt() ?? 0,
      provinceFilter: json['provinceFilter'] as String?,
      byDepartment: ((json['byDepartment'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PrivateCompanyDepartmentKpi.fromJson)
          .toList(),
      byProvince: ((json['byProvince'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PrivateCompanyProvinceKpi.fromJson)
          .toList(),
      byStaff: ((json['byStaff'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PrivateCompanyStaffKpi.fromJson)
          .toList(),
    );
  }
}
