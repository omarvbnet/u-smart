class Site {
  final String id;
  final String siteId;
  final String location;
  final String province;
  final double? latitude;
  final double? longitude;
  final int ticketCount;
  final int qualityControlCount;
  final int enterpriseCount;
  /// QC tickets counted as inspection (non-maintenance techniques).
  final int inspectionQcCount;
  /// QC tickets counted as maintenance.
  final int maintenanceQcCount;
  /// Sum of (completedAt − createdAt) hours for completed inspection QC tickets.
  final double inspectionHoursTotal;
  /// Sum of (completedAt − createdAt) hours for completed maintenance QC tickets.
  final double maintenanceHoursTotal;
  final DateTime? updatedAt;
  final bool sharedWithMe;
  final bool canEdit;
  final String? shareId;
  final String? ownerUsername;
  final String? ownerRequesterId;
  /// When receiving a shared site: whether the sharer granted ticket visibility (API).
  final bool shareIncludesTickets;

  Site({
    required this.id,
    required this.siteId,
    required this.location,
    required this.province,
    this.latitude,
    this.longitude,
    this.ticketCount = 0,
    this.qualityControlCount = 0,
    this.enterpriseCount = 0,
    this.inspectionQcCount = 0,
    this.maintenanceQcCount = 0,
    this.inspectionHoursTotal = 0,
    this.maintenanceHoursTotal = 0,
    this.updatedAt,
    this.sharedWithMe = false,
    this.canEdit = true,
    this.shareId,
    this.ownerUsername,
    this.ownerRequesterId,
    this.shareIncludesTickets = true,
  });

  bool get hasCoordinates => latitude != null && longitude != null;

  factory Site.fromJson(Map<String, dynamic> json) {
    final canEditRaw = json['canEdit'];
    final sharedRaw = json['sharedWithMe'];
    final shareTkRaw = json['shareIncludesTickets'];
    final canEdit = canEditRaw is bool ? canEditRaw : true;
    final sharedWithMe = sharedRaw is bool ? sharedRaw : false;
    final shareIncludesTickets = shareTkRaw is bool ? shareTkRaw : true;

    return Site(
      id: json['id'] as String,
      siteId: json['siteId'] as String,
      location: json['location'] as String,
      province: json['province'] as String,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      ticketCount: json['ticketCount'] as int? ?? 0,
      qualityControlCount: json['qualityControlCount'] as int? ?? 0,
      enterpriseCount: json['enterpriseCount'] as int? ?? 0,
      inspectionQcCount: json['inspectionQcCount'] as int? ?? 0,
      maintenanceQcCount: json['maintenanceQcCount'] as int? ?? 0,
      inspectionHoursTotal:
          (json['inspectionHoursTotal'] as num?)?.toDouble() ?? 0,
      maintenanceHoursTotal:
          (json['maintenanceHoursTotal'] as num?)?.toDouble() ?? 0,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      sharedWithMe: sharedWithMe,
      canEdit: canEdit,
      shareId: json['shareId'] as String?,
      ownerUsername: json['ownerUsername'] as String?,
      ownerRequesterId: json['ownerRequesterId'] as String?,
      shareIncludesTickets: shareIncludesTickets,
    );
  }
}
