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
  final String? linkedCoordinatorCompanyId;
  final bool mustChangePassword;
  final String? photoUrl;
  /// Optional public/business contact email surfaced on the profile screen
  /// (separate from the unique auth/identity username/email). Only company
  /// and private-company workspace members may edit it.
  final String? contactEmail;
  /// Server-derived flag: whether the contact-email editor should be shown.
  /// True for COMPANY role and any private-company workspace member/owner.
  final bool canEditContactEmail;
  /// Workspace membership id (if any) — used as a fallback eligibility hint
  /// when older servers don't return [canEditContactEmail].
  final String? privateCompanyId;
  /// Auth/identity email (distinct from [contactEmail]). When set, PERSONAL
  /// accounts can request an upgrade to a company account.
  final String? email;
  /// Whether the account has a verified auth email on file.
  final bool hasEmail;

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
    this.linkedCoordinatorCompanyId,
    this.mustChangePassword = false,
    this.photoUrl,
    this.contactEmail,
    this.canEditContactEmail = false,
    this.privateCompanyId,
    this.email,
    this.hasEmail = false,
  });

  User copyWith({
    String? photoUrl,
    String? contactEmail,
    bool clearContactEmail = false,
    String? email,
  }) =>
      User(
        id: id,
        username: username,
        name: name,
        phone: phone,
        company: company,
        companyCertificationUrl: companyCertificationUrl,
        status: status,
        hasUpdatedCredentials: hasUpdatedCredentials,
        serviceSlug: serviceSlug,
        role: role,
        province: province,
        provinceFilterActive: provinceFilterActive,
        companyId: companyId,
        linkedCoordinatorCompanyId: linkedCoordinatorCompanyId,
        mustChangePassword: mustChangePassword,
        photoUrl: photoUrl ?? this.photoUrl,
        contactEmail: clearContactEmail ? null : (contactEmail ?? this.contactEmail),
        canEditContactEmail: canEditContactEmail,
        privateCompanyId: privateCompanyId,
        email: email ?? this.email,
        hasEmail: (email ?? this.email) != null ? true : hasEmail,
      );

  /// Workspace field role is ENGINEER; legacy coordinator aliases still accepted.
  bool get isEngineer =>
      role == 'ENGINEER' ||
      role == 'QUALITY_ENGINEER' ||
      role == 'SUPERVISION_ENGINEER';
  bool get isQualityEngineer => role == 'QUALITY_ENGINEER';
  bool get isSupervisionEngineer => role == 'SUPERVISION_ENGINEER';
  bool get isCoordinator => role == 'COORDINATOR';
  bool get isManager => role == 'MANAGER';
  bool get isTeamLeader => role == 'TEAM_LEADER';
  bool get isCompany => role == 'COMPANY' || role == 'COMPANY_OWNER';
  bool get isPersonal => role == 'PERSONAL';
  bool get isAdmin => role == 'ADMIN';
  bool get isTechnician => role == 'TECHNICIAN';
  bool get isWorker => role == 'WORKER';
  bool get isCompanyOwner => role == 'COMPANY_OWNER';

  /// Private workspace: join/leave extra ticket crew (server also enforces role).
  bool get canJoinWorkspaceTicketCrew =>
      isTechnician || isEngineer || isManager || isCoordinator;

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
      companyId: (json['companyId'] as String?)?.isNotEmpty == true
          ? json['companyId'] as String?
          : (json['linkedCoordinatorCompanyId'] as String?),
      linkedCoordinatorCompanyId: json['linkedCoordinatorCompanyId'] as String?,
      mustChangePassword: json['mustChangePassword'] == true,
      photoUrl: (json['photoUrl'] is String && (json['photoUrl'] as String).trim().isNotEmpty)
          ? json['photoUrl'] as String
          : null,
      contactEmail: (json['contactEmail'] is String && (json['contactEmail'] as String).trim().isNotEmpty)
          ? (json['contactEmail'] as String).trim()
          : null,
      // Server returns canEditContactEmail explicitly. For backward-compat
      // with older servers, fall back to deriving it from role / workspace.
      canEditContactEmail: json['canEditContactEmail'] == true ||
          (json['canEditContactEmail'] == null &&
              (_normalizeRole(json['role']) == 'COMPANY' ||
                  (json['privateCompanyId'] is String &&
                      (json['privateCompanyId'] as String).isNotEmpty))),
      privateCompanyId: (json['privateCompanyId'] is String &&
              (json['privateCompanyId'] as String).isNotEmpty)
          ? json['privateCompanyId'] as String
          : null,
      email: (json['email'] is String && (json['email'] as String).trim().isNotEmpty)
          ? (json['email'] as String).trim()
          : null,
      hasEmail: json['hasEmail'] == true ||
          (json['email'] is String && (json['email'] as String).trim().isNotEmpty),
    );
  }
}
