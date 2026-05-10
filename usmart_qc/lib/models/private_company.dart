import 'package:flutter/material.dart';

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
  });

  final String id;
  final String name;
  final String? description;
  final String? color;
  final String? iconKey;
  final int sortOrder;
  final int memberCount;
  final List<PrivateCompanyStaff> members;

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
    );
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
    this.createdAt,
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
  final DateTime? createdAt;

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
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

/// Severity of a checklist item — used during inspection to weight findings.
enum PrivateCompanyChecklistItemSeverity { minor, major }

PrivateCompanyChecklistItemSeverity _severityFromString(String? raw) {
  return (raw ?? '').toLowerCase() == 'major'
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
      severity: _severityFromString(json['severity'] as String?),
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
    );
  }
}

class PrivateCompanyMembership {
  PrivateCompanyMembership({
    this.isOwner = false,
    this.isStaff = false,
    this.status,
    this.departmentId,
    this.role,
  });

  final bool isOwner;
  final bool isStaff;
  final PrivateCompanyStatus? status;
  final String? departmentId;
  /// Authoritative server-side role (uppercase) for the requester inside the
  /// workspace context. Used by permission helpers when the staff list is not
  /// available client-side.
  final String? role;

  factory PrivateCompanyMembership.fromJson(Map<String, dynamic> json) {
    return PrivateCompanyMembership(
      isOwner: json['isOwner'] == true,
      isStaff: json['isStaff'] == true,
      status: json['status'] != null
          ? privateCompanyStatusFromString(json['status'])
          : null,
      departmentId: json['departmentId'] as String?,
      role: (json['role'] as String?)?.toUpperCase(),
    );
  }

  bool get hasNoMembership => !isOwner && !isStaff;
}
