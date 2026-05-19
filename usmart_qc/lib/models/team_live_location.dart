class TeamLiveLocation {
  const TeamLiveLocation({
    required this.requesterId,
    required this.latitude,
    required this.longitude,
    this.accuracy,
    this.updatedAt,
    this.name,
    this.username,
    this.role,
    this.departmentName,
  });

  final String requesterId;
  final double latitude;
  final double longitude;
  final double? accuracy;
  final String? updatedAt;
  final String? name;
  final String? username;
  final String? role;
  final String? departmentName;

  String get displayName {
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    final u = username?.trim();
    if (u != null && u.isNotEmpty) return u;
    return 'Staff';
  }

  factory TeamLiveLocation.fromJson(Map<String, dynamic> json) {
    return TeamLiveLocation(
      requesterId: json['requesterId'] as String? ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      accuracy: (json['accuracy'] as num?)?.toDouble(),
      updatedAt: json['updatedAt'] as String?,
      name: json['name'] as String?,
      username: json['username'] as String?,
      role: json['role'] as String?,
      departmentName: json['departmentName'] as String?,
    );
  }
}
