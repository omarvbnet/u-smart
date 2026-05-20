class MaintenanceCompletionReasonOption {
  const MaintenanceCompletionReasonOption({required this.id, required this.label});

  final String id;
  final String label;

  factory MaintenanceCompletionReasonOption.fromJson(Map<String, dynamic> json) {
    return MaintenanceCompletionReasonOption(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
    );
  }
}

class MaintenanceCompletionReasonRow {
  MaintenanceCompletionReasonRow({
    required this.id,
    required this.departmentId,
    required this.label,
    this.departmentName,
    this.active = true,
    this.sortOrder = 0,
    this.count = 0,
  });

  final String id;
  final String departmentId;
  final String label;
  final String? departmentName;
  final bool active;
  final int sortOrder;
  final int count;

  factory MaintenanceCompletionReasonRow.fromJson(Map<String, dynamic> json) {
    return MaintenanceCompletionReasonRow(
      id: json['id']?.toString() ?? '',
      departmentId: json['departmentId']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      departmentName: json['departmentName'] as String?,
      active: json['active'] != false,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}

class MaintenanceReasonAnalyticsSnapshot {
  MaintenanceReasonAnalyticsSnapshot({
    required this.scope,
    required this.totalWithReason,
    required this.ticketSampleSize,
    required this.byReason,
    required this.catalog,
    this.departmentId,
    this.from,
    this.to,
  });

  final String scope;
  final String? departmentId;
  final String? from;
  final String? to;
  final int totalWithReason;
  final int ticketSampleSize;
  final List<MaintenanceReasonCount> byReason;
  final List<MaintenanceCompletionReasonRow> catalog;

  factory MaintenanceReasonAnalyticsSnapshot.fromJson(Map<String, dynamic> json) {
    return MaintenanceReasonAnalyticsSnapshot(
      scope: json['scope']?.toString() ?? 'workspace',
      departmentId: json['departmentId'] as String?,
      from: json['from'] as String?,
      to: json['to'] as String?,
      totalWithReason: (json['totalWithReason'] as num?)?.toInt() ?? 0,
      ticketSampleSize: (json['ticketSampleSize'] as num?)?.toInt() ?? 0,
      byReason: (json['byReason'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(MaintenanceReasonCount.fromJson)
              .toList() ??
          const [],
      catalog: (json['catalog'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(MaintenanceCompletionReasonRow.fromJson)
              .toList() ??
          const [],
    );
  }
}

class MaintenanceReasonCount {
  const MaintenanceReasonCount({
    required this.reasonId,
    required this.label,
    required this.count,
  });

  final String reasonId;
  final String label;
  final int count;

  factory MaintenanceReasonCount.fromJson(Map<String, dynamic> json) {
    return MaintenanceReasonCount(
      reasonId: json['reasonId']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}
