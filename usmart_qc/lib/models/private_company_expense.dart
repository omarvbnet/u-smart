class WorkspaceExpenseSettings {
  WorkspaceExpenseSettings({
    this.enabled = false,
    this.reasons = const [],
    this.activationPending = false,
  });

  final bool enabled;
  final List<String> reasons;
  final bool activationPending;

  factory WorkspaceExpenseSettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return WorkspaceExpenseSettings();
    final raw = json['reasons'];
    return WorkspaceExpenseSettings(
      enabled: json['enabled'] == true,
      activationPending: json['activationPending'] == true,
      reasons: raw is List
          ? raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
          : const [],
    );
  }
}

class TicketExpenseLine {
  TicketExpenseLine({
    required this.id,
    required this.ticketId,
    required this.staffId,
    required this.amount,
    required this.currency,
    required this.reason,
    this.note,
    this.staffName,
    this.createdAt,
    this.ticketSiteName,
    this.ticketTechnique,
    this.ticketStatus,
    this.ticketProvince,
  });

  final String id;
  final String ticketId;
  final String staffId;
  final double amount;
  final String currency;
  final String reason;
  final String? note;
  final String? staffName;
  final DateTime? createdAt;
  final String? ticketSiteName;
  final String? ticketTechnique;
  final String? ticketStatus;
  final String? ticketProvince;

  factory TicketExpenseLine.fromJson(Map<String, dynamic> json) {
    final ticket = json['ticket'];
    return TicketExpenseLine(
      id: json['id'] as String,
      ticketId: json['ticketId'] as String? ?? '',
      staffId: json['staffId'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      currency: json['currency'] as String? ?? 'IQD',
      reason: json['reason'] as String? ?? '',
      note: json['note'] as String?,
      staffName: json['staffName'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      ticketSiteName: ticket is Map ? ticket['siteName'] as String? : null,
      ticketTechnique: ticket is Map ? ticket['technique'] as String? : null,
      ticketStatus: ticket is Map ? ticket['status'] as String? : null,
      ticketProvince: ticket is Map ? ticket['province'] as String? : null,
    );
  }
}

class ExpenseAnalyticsSnapshot {
  ExpenseAnalyticsSnapshot({
    required this.scope,
    required this.days,
    this.provinceFilter,
    this.departmentId,
    this.summaryTotalAmount = 0,
    this.summaryExpenseCount = 0,
    this.summaryTicketCount = 0,
    this.byProvince = const [],
    this.byDepartment = const [],
    this.byStaff = const [],
    this.tickets = const [],
    WorkspaceExpenseSettings? settings,
  }) : settings = settings ?? WorkspaceExpenseSettings();

  final String scope;
  final int days;
  final String? provinceFilter;
  final String? departmentId;
  final double summaryTotalAmount;
  final int summaryExpenseCount;
  final int summaryTicketCount;
  final List<ExpenseProvinceRollup> byProvince;
  final List<ExpenseDepartmentRollup> byDepartment;
  final List<ExpenseStaffRollup> byStaff;
  final List<ExpenseTicketRollup> tickets;
  final WorkspaceExpenseSettings settings;

  factory ExpenseAnalyticsSnapshot.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'];
    return ExpenseAnalyticsSnapshot(
      scope: json['scope'] as String? ?? 'self',
      days: (json['days'] as num?)?.toInt() ?? 90,
      provinceFilter: json['provinceFilter'] as String?,
      departmentId: json['departmentId'] as String?,
      summaryTotalAmount:
          summary is Map ? (summary['totalAmount'] as num?)?.toDouble() ?? 0 : 0,
      summaryExpenseCount:
          summary is Map ? (summary['expenseCount'] as num?)?.toInt() ?? 0 : 0,
      summaryTicketCount:
          summary is Map ? (summary['ticketCount'] as num?)?.toInt() ?? 0 : 0,
      settings: WorkspaceExpenseSettings.fromJson(
        json['settings'] is Map ? json['settings'] as Map<String, dynamic> : null,
      ),
      byProvince: (json['byProvince'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(ExpenseProvinceRollup.fromJson)
              .toList() ??
          const [],
      byDepartment: (json['byDepartment'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(ExpenseDepartmentRollup.fromJson)
              .toList() ??
          const [],
      byStaff: (json['byStaff'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(ExpenseStaffRollup.fromJson)
              .toList() ??
          const [],
      tickets: (json['tickets'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(ExpenseTicketRollup.fromJson)
              .toList() ??
          const [],
    );
  }
}

class ExpenseProvinceRollup {
  ExpenseProvinceRollup({
    required this.province,
    required this.totalAmount,
    required this.expenseCount,
    required this.ticketCount,
  });
  final String province;
  final double totalAmount;
  final int expenseCount;
  final int ticketCount;

  factory ExpenseProvinceRollup.fromJson(Map<String, dynamic> json) => ExpenseProvinceRollup(
        province: json['province'] as String? ?? '',
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0,
        expenseCount: (json['expenseCount'] as num?)?.toInt() ?? 0,
        ticketCount: (json['ticketCount'] as num?)?.toInt() ?? 0,
      );
}

class ExpenseDepartmentRollup {
  ExpenseDepartmentRollup({
    this.departmentId,
    required this.departmentName,
    required this.totalAmount,
    required this.expenseCount,
    required this.ticketCount,
  });
  final String? departmentId;
  final String departmentName;
  final double totalAmount;
  final int expenseCount;
  final int ticketCount;

  factory ExpenseDepartmentRollup.fromJson(Map<String, dynamic> json) =>
      ExpenseDepartmentRollup(
        departmentId: json['departmentId'] as String?,
        departmentName: json['departmentName'] as String? ?? '',
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0,
        expenseCount: (json['expenseCount'] as num?)?.toInt() ?? 0,
        ticketCount: (json['ticketCount'] as num?)?.toInt() ?? 0,
      );
}

class ExpenseStaffRollup {
  ExpenseStaffRollup({
    required this.staffId,
    required this.name,
    required this.role,
    this.province,
    this.departmentName,
    required this.totalAmount,
    required this.expenseCount,
    required this.ticketCount,
  });
  final String staffId;
  final String name;
  final String role;
  final String? province;
  final String? departmentName;
  final double totalAmount;
  final int expenseCount;
  final int ticketCount;

  factory ExpenseStaffRollup.fromJson(Map<String, dynamic> json) => ExpenseStaffRollup(
        staffId: json['staffId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        role: json['role'] as String? ?? '',
        province: json['province'] as String?,
        departmentName: json['departmentName'] as String?,
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0,
        expenseCount: (json['expenseCount'] as num?)?.toInt() ?? 0,
        ticketCount: (json['ticketCount'] as num?)?.toInt() ?? 0,
      );
}

class ExpenseTicketRollup {
  ExpenseTicketRollup({
    required this.ticketId,
    this.siteName,
    this.technique,
    required this.status,
    this.province,
    required this.totalAmount,
    required this.expenseCount,
  });
  final String ticketId;
  final String? siteName;
  final String? technique;
  final String status;
  final String? province;
  final double totalAmount;
  final int expenseCount;

  factory ExpenseTicketRollup.fromJson(Map<String, dynamic> json) => ExpenseTicketRollup(
        ticketId: json['ticketId'] as String? ?? '',
        siteName: json['siteName'] as String?,
        technique: json['technique'] as String?,
        status: json['status'] as String? ?? '',
        province: json['province'] as String?,
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0,
        expenseCount: (json['expenseCount'] as num?)?.toInt() ?? 0,
      );
}
