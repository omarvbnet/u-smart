/// Response shape from `GET /api/company/dashboard` (coordinator JWT only).
class StaffPerformanceRow {
  StaffPerformanceRow({
    required this.userId,
    required this.role,
    required this.status,
    required this.assigned,
    required this.completed,
    required this.needsEdit,
    required this.resubmitted,
  });

  final String userId;
  final String role;
  final String status;
  final int assigned;
  final int completed;
  final int needsEdit;
  final int resubmitted;

  factory StaffPerformanceRow.fromJson(Map<String, dynamic> json) {
    return StaffPerformanceRow(
      userId: json['userId'] as String? ?? '',
      role: json['role'] as String? ?? '',
      status: json['status'] as String? ?? '',
      assigned: (json['assigned'] as num?)?.round() ?? 0,
      completed: (json['completed'] as num?)?.round() ?? 0,
      needsEdit: (json['needsEdit'] as num?)?.round() ?? 0,
      resubmitted: (json['resubmitted'] as num?)?.round() ?? 0,
    );
  }

  String get shortUserLabel =>
      userId.length > 8 ? '…${userId.substring(userId.length - 6)}' : userId;
}

class CompanyDashboardSummary {
  CompanyDashboardSummary({
    required this.totalStaff,
    required this.totalTickets,
    required this.staffPerformance,
  });

  final int totalStaff;
  final int totalTickets;
  final List<StaffPerformanceRow> staffPerformance;

  factory CompanyDashboardSummary.fromJson(Map<String, dynamic> json) {
    final perfRaw = json['staffPerformance'];
    final perf = perfRaw is List
        ? perfRaw
            .map((e) => StaffPerformanceRow.fromJson(e as Map<String, dynamic>))
            .toList()
        : <StaffPerformanceRow>[];

    return CompanyDashboardSummary(
      totalStaff: (json['totalStaff'] as num?)?.round() ?? 0,
      totalTickets: (json['totalTickets'] as num?)?.round() ?? 0,
      staffPerformance: perf,
    );
  }
}
