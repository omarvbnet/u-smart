class InspectionCounts {
  final int total;
  final int accepted;
  final int acceptedWithComments;
  final int notAccepted;
  final int ncr;
  final int inProgress;

  InspectionCounts({
    this.total = 0,
    this.accepted = 0,
    this.acceptedWithComments = 0,
    this.notAccepted = 0,
    this.ncr = 0,
    this.inProgress = 0,
  });

  factory InspectionCounts.fromJson(Map<String, dynamic> json) {
    return InspectionCounts(
      total: json['total'] as int? ?? 0,
      accepted: json['accepted'] as int? ?? 0,
      acceptedWithComments: json['accepted_with_comments'] as int? ?? 0,
      notAccepted: json['not_accepted'] as int? ?? 0,
      ncr: json['ncr'] as int? ?? 0,
      inProgress: json['in_progress'] as int? ?? 0,
    );
  }
}

class TicketStats {
  final int withinSla;
  final int outOfSla;
  final int total;
  final InspectionCounts? inspectionStats;
  final InspectionCounts? inspectionTrend;

  TicketStats({
    this.withinSla = 0,
    this.outOfSla = 0,
    this.total = 0,
    this.inspectionStats,
    this.inspectionTrend,
  });

  double get slaCompliancePercent =>
      total > 0 ? (withinSla / total) * 100 : 0;

  factory TicketStats.fromJson(Map<String, dynamic> json) {
    return TicketStats(
      withinSla: json['withinSla'] as int? ?? 0,
      outOfSla: json['outOfSla'] as int? ?? 0,
      total: json['total'] as int? ?? 0,
      inspectionStats: json['inspectionStats'] != null
          ? InspectionCounts.fromJson(
              json['inspectionStats'] as Map<String, dynamic>)
          : null,
      inspectionTrend: json['inspectionTrend'] != null
          ? InspectionCounts.fromJson(
              json['inspectionTrend'] as Map<String, dynamic>)
          : null,
    );
  }
}
