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
  final DateTime? updatedAt;

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
    this.updatedAt,
  });

  bool get hasCoordinates => latitude != null && longitude != null;

  factory Site.fromJson(Map<String, dynamic> json) {
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
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
    );
  }
}
