import 'qfield_project.dart';
import 'site_design_document.dart';

class WorkspaceSite {
  WorkspaceSite({
    required this.id,
    required this.siteCode,
    required this.location,
    required this.province,
    this.latitude,
    this.longitude,
    this.hasQfield = false,
    this.hasMapCoordinates = false,
    this.qfieldProjects = const [],
    this.designDocuments = const [],
    this.confirmationStatus = 'CONFIRMED',
    this.isConfirmed = true,
    this.pendingChange,
    this.createdByName,
    this.confirmedByName,
    this.confirmedAt,
    this.inspectionQcCount = 0,
    this.maintenanceQcCount = 0,
    this.supervisionTicketCount = 0,
    this.ticketCount = 0,
    this.canManage = false,
    this.createdByRequesterId,
  });

  final String id;
  final String siteCode;
  final String location;
  final String province;
  final double? latitude;
  final double? longitude;
  final bool hasQfield;
  final bool hasMapCoordinates;
  final List<QFieldProject> qfieldProjects;
  final List<SiteDesignDocument> designDocuments;
  final String confirmationStatus;
  final bool isConfirmed;
  final Map<String, dynamic>? pendingChange;
  final String? createdByName;
  final String? confirmedByName;
  final String? confirmedAt;
  final int inspectionQcCount;
  final int maintenanceQcCount;
  final int supervisionTicketCount;
  final int ticketCount;
  final bool canManage;
  final String? createdByRequesterId;

  bool get isPending => confirmationStatus == 'PENDING';
  bool get hasCoordinates => latitude != null && longitude != null;

  factory WorkspaceSite.fromJson(Map<String, dynamic> json) {
    final qRaw = json['qfieldProjects'];
    final dRaw = json['designDocuments'];
    return WorkspaceSite(
      id: json['id'] as String,
      siteCode: json['siteCode'] as String? ?? json['siteId'] as String? ?? '',
      location: json['location'] as String? ?? '',
      province: json['province'] as String? ?? '',
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      hasQfield: json['hasQfield'] == true,
      hasMapCoordinates: json['hasMapCoordinates'] == true,
      qfieldProjects: qRaw is List
          ? qRaw.map((e) => QFieldProject.fromJson(e as Map<String, dynamic>)).toList()
          : const [],
      designDocuments: dRaw is List
          ? dRaw
              .map((e) =>
                  SiteDesignDocument.fromJson(e as Map<String, dynamic>))
              .where((d) => d.url.trim().isNotEmpty)
              .toList()
          : const [],
      confirmationStatus: json['confirmationStatus'] as String? ?? 'CONFIRMED',
      isConfirmed: json['isConfirmed'] == true || json['confirmationStatus'] == 'CONFIRMED',
      pendingChange: json['pendingChange'] is Map
          ? Map<String, dynamic>.from(json['pendingChange'] as Map)
          : null,
      createdByName: json['createdByName'] as String?,
      confirmedByName: json['confirmedByName'] as String?,
      confirmedAt: json['confirmedAt'] as String?,
      inspectionQcCount: json['inspectionQcCount'] as int? ?? 0,
      maintenanceQcCount: json['maintenanceQcCount'] as int? ?? 0,
      supervisionTicketCount: json['supervisionTicketCount'] as int? ?? 0,
      ticketCount: json['ticketCount'] as int? ?? 0,
      canManage: json['canManage'] == true,
      createdByRequesterId: json['createdByRequesterId'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'siteCode': siteCode,
        'location': location,
        'province': province,
        'latitude': latitude,
        'longitude': longitude,
        'hasQfield': hasQfield,
        'hasMapCoordinates': hasMapCoordinates,
        'qfieldProjects': qfieldProjects
            .map((p) => {
                  'id': p.id,
                  'title': p.title,
                  'currentUrl': p.currentUrl,
                  'fileName': p.fileName,
                  'createdAt': p.createdAt,
                  'updatedAt': p.updatedAt,
                })
            .toList(),
        'designDocuments': designDocuments.map((d) => d.toPayload()).toList(),
        'confirmationStatus': confirmationStatus,
        'isConfirmed': isConfirmed,
        'createdByName': createdByName,
        'createdByRequesterId': createdByRequesterId,
        'inspectionQcCount': inspectionQcCount,
        'maintenanceQcCount': maintenanceQcCount,
        'ticketCount': ticketCount,
        'canManage': canManage,
      };
}

class WorkspaceSiteTicket {
  WorkspaceSiteTicket({
    required this.id,
    required this.status,
    this.technique,
    this.province,
    this.title = '',
    required this.createdAt,
    this.completedAt,
    this.isMaintenance = false,
  });

  final String id;
  final String status;
  final String? technique;
  final String? province;
  final String title;
  final String createdAt;
  final String? completedAt;
  final bool isMaintenance;

  factory WorkspaceSiteTicket.fromJson(Map<String, dynamic> json) {
    return WorkspaceSiteTicket(
      id: json['id'] as String,
      status: json['status'] as String? ?? '',
      technique: json['technique'] as String?,
      province: json['province'] as String?,
      title: json['title'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      completedAt: json['completedAt'] as String?,
      isMaintenance: json['isMaintenance'] == true,
    );
  }
}
