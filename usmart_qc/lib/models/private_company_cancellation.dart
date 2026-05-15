class CancellationReasonCount {
  CancellationReasonCount({
    required this.reason,
    required this.ticketCount,
    this.ticketIds = const [],
  });

  final String reason;
  final int ticketCount;
  final List<String> ticketIds;

  factory CancellationReasonCount.fromJson(Map<String, dynamic> json) {
    return CancellationReasonCount(
      reason: json['reason'] as String? ?? '—',
      ticketCount: (json['ticketCount'] as num?)?.toInt() ?? 0,
      ticketIds: ((json['ticketIds'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class CancellationProvinceRollup {
  CancellationProvinceRollup({
    required this.province,
    required this.totalCancelled,
    this.byReason = const [],
  });

  final String province;
  final int totalCancelled;
  final List<CancellationReasonCount> byReason;

  factory CancellationProvinceRollup.fromJson(Map<String, dynamic> json) {
    return CancellationProvinceRollup(
      province: json['province'] as String? ?? '—',
      totalCancelled: (json['totalCancelled'] as num?)?.toInt() ?? 0,
      byReason: ((json['byReason'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationReasonCount.fromJson)
          .toList(),
    );
  }
}

class CancellationDepartmentRollup {
  CancellationDepartmentRollup({
    this.departmentId,
    required this.departmentName,
    required this.totalCancelled,
    this.byReason = const [],
  });

  final String? departmentId;
  final String departmentName;
  final int totalCancelled;
  final List<CancellationReasonCount> byReason;

  factory CancellationDepartmentRollup.fromJson(Map<String, dynamic> json) {
    return CancellationDepartmentRollup(
      departmentId: json['departmentId'] as String?,
      departmentName: json['departmentName'] as String? ?? '—',
      totalCancelled: (json['totalCancelled'] as num?)?.toInt() ?? 0,
      byReason: ((json['byReason'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationReasonCount.fromJson)
          .toList(),
    );
  }
}

class CancellationCaseRow {
  CancellationCaseRow({
    required this.ticketId,
    required this.reason,
    this.siteName,
    this.technique,
    this.province,
    this.departmentName,
    this.cancelledAt,
  });

  final String ticketId;
  final String reason;
  final String? siteName;
  final String? technique;
  final String? province;
  final String? departmentName;
  final String? cancelledAt;

  factory CancellationCaseRow.fromJson(Map<String, dynamic> json) {
    return CancellationCaseRow(
      ticketId: json['ticketId'] as String? ?? '',
      reason: json['reason'] as String? ?? '—',
      siteName: json['siteName'] as String?,
      technique: json['technique'] as String?,
      province: json['province'] as String?,
      departmentName: json['departmentName'] as String?,
      cancelledAt: json['cancelledAt'] as String?,
    );
  }
}

class CancellationAnalyticsSnapshot {
  CancellationAnalyticsSnapshot({
    this.scope = 'workspace',
    this.days = 90,
    this.totalCancelled = 0,
    this.configuredReasons = const [],
    this.byReason = const [],
    this.byProvince = const [],
    this.byDepartment = const [],
    this.cases = const [],
  });

  final String scope;
  final int days;
  final int totalCancelled;
  final List<String> configuredReasons;
  final List<CancellationReasonCount> byReason;
  final List<CancellationProvinceRollup> byProvince;
  final List<CancellationDepartmentRollup> byDepartment;
  final List<CancellationCaseRow> cases;

  factory CancellationAnalyticsSnapshot.fromJson(Map<String, dynamic> json) {
    final settings = json['settings'];
    final reasons = settings is Map ? settings['reasons'] : null;
    return CancellationAnalyticsSnapshot(
      scope: json['scope'] as String? ?? 'workspace',
      days: (json['days'] as num?)?.toInt() ?? 90,
      totalCancelled: (json['totalCancelled'] as num?)?.toInt() ?? 0,
      configuredReasons: reasons is List
          ? reasons.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
          : const [],
      byReason: ((json['byReason'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationReasonCount.fromJson)
          .toList(),
      byProvince: ((json['byProvince'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationProvinceRollup.fromJson)
          .toList(),
      byDepartment: ((json['byDepartment'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationDepartmentRollup.fromJson)
          .toList(),
      cases: ((json['cases'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CancellationCaseRow.fromJson)
          .toList(),
    );
  }
}
