class User {
  final String id;
  final String username;
  final String? name;
  final String? phone;
  final String? company;
  final String? companyCertificationUrl;
  final String status;
  final bool hasUpdatedCredentials;
  final String serviceSlug;
  final String role;
  final String? province;
  final bool provinceFilterActive;
  final String? companyId;
  final bool mustChangePassword;

  User({
    required this.id,
    required this.username,
    this.name,
    this.phone,
    this.company,
    this.companyCertificationUrl,
    this.status = 'ACTIVE',
    this.hasUpdatedCredentials = false,
    this.serviceSlug = 'quality-control-supervision',
    this.role = 'COMPANY',
    this.province,
    this.provinceFilterActive = true,
    this.companyId,
    this.mustChangePassword = false,
  });

  bool get isEngineer =>
      role == 'ENGINEER' ||
      role == 'QUALITY_ENGINEER' ||
      role == 'SUPERVISION_ENGINEER';
  bool get isQualityEngineer => role == 'QUALITY_ENGINEER';
  bool get isSupervisionEngineer => role == 'SUPERVISION_ENGINEER';
  bool get isCoordinator => role == 'COORDINATOR';
  bool get isCompany => role == 'COMPANY' || role == 'COMPANY_OWNER';
  bool get isAdmin => role == 'ADMIN';
  bool get isTechnician => role == 'TECHNICIAN';
  bool get isWorker => role == 'WORKER';
  bool get isCompanyOwner => role == 'COMPANY_OWNER';

  static String _normalizeRole(dynamic raw) {
    if (raw is! String || raw.trim().isEmpty) return 'COMPANY';
    return raw.trim().toUpperCase();
  }

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      username: json['username'] as String,
      name: json['name'] as String?,
      phone: json['phone'] as String?,
      company: json['company'] as String?,
      companyCertificationUrl: json['companyCertificationUrl'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      hasUpdatedCredentials: json['hasUpdatedCredentials'] == true,
      serviceSlug: json['serviceSlug'] as String? ?? 'quality-control-supervision',
      role: _normalizeRole(json['role']),
      province: json['province'] as String?,
      provinceFilterActive: json['provinceFilterActive'] as bool? ?? true,
      companyId: json['companyId'] as String?,
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }
}
