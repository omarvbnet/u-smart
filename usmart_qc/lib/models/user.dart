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
  });

  bool get isEngineer => role == 'ENGINEER';
  bool get isCompany => role == 'COMPANY';
  bool get isAdmin => role == 'ADMIN';

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
      role: json['role'] as String? ?? 'COMPANY',
      province: json['province'] as String?,
      provinceFilterActive: json['provinceFilterActive'] as bool? ?? true,
    );
  }
}
