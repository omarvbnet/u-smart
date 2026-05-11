// Models backing the Private Company workspace warehouse feature
// (materials catalog, serial-numbered inventory, assignments, usage on
// tickets, and dashboard aggregates).

enum MaterialTracking { serial, bulk }

MaterialTracking _trackingFromString(String? raw) {
  switch ((raw ?? 'SERIAL').toUpperCase()) {
    case 'BULK':
      return MaterialTracking.bulk;
    case 'SERIAL':
    default:
      return MaterialTracking.serial;
  }
}

String materialTrackingApi(MaterialTracking t) =>
    t == MaterialTracking.bulk ? 'BULK' : 'SERIAL';

enum MaterialItemStatus { inWarehouse, assigned, used, damaged, lost, retired }

MaterialItemStatus materialItemStatusFromString(String? raw) {
  switch ((raw ?? 'IN_WAREHOUSE').toUpperCase()) {
    case 'ASSIGNED':
      return MaterialItemStatus.assigned;
    case 'USED':
      return MaterialItemStatus.used;
    case 'DAMAGED':
      return MaterialItemStatus.damaged;
    case 'LOST':
      return MaterialItemStatus.lost;
    case 'RETIRED':
      return MaterialItemStatus.retired;
    case 'IN_WAREHOUSE':
    default:
      return MaterialItemStatus.inWarehouse;
  }
}

String materialItemStatusApi(MaterialItemStatus s) {
  switch (s) {
    case MaterialItemStatus.inWarehouse:
      return 'IN_WAREHOUSE';
    case MaterialItemStatus.assigned:
      return 'ASSIGNED';
    case MaterialItemStatus.used:
      return 'USED';
    case MaterialItemStatus.damaged:
      return 'DAMAGED';
    case MaterialItemStatus.lost:
      return 'LOST';
    case MaterialItemStatus.retired:
      return 'RETIRED';
  }
}

String materialItemStatusLabel(MaterialItemStatus s) {
  switch (s) {
    case MaterialItemStatus.inWarehouse:
      return 'In warehouse';
    case MaterialItemStatus.assigned:
      return 'Assigned';
    case MaterialItemStatus.used:
      return 'Used';
    case MaterialItemStatus.damaged:
      return 'Damaged';
    case MaterialItemStatus.lost:
      return 'Lost';
    case MaterialItemStatus.retired:
      return 'Retired';
  }
}

/// A material catalog entry — describes a "type" of stock the workspace
/// holds (e.g. "Cat6 Cable", "RJ45 Connector"). Individual physical
/// units are represented by [WarehouseItem].
class WarehouseMaterial {
  WarehouseMaterial({
    required this.id,
    required this.name,
    this.description,
    this.category,
    this.unit,
    this.iconKey,
    this.color,
    this.tracking = MaterialTracking.serial,
    this.itemCount = 0,
    this.createdAt,
  });

  final String id;
  final String name;
  final String? description;
  final String? category;
  final String? unit;
  final String? iconKey;
  final String? color;
  final MaterialTracking tracking;
  final int itemCount;
  final DateTime? createdAt;

  factory WarehouseMaterial.fromJson(Map<String, dynamic> json) {
    return WarehouseMaterial(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      category: json['category'] as String?,
      unit: json['unit'] as String?,
      iconKey: json['iconKey'] as String?,
      color: json['color'] as String?,
      tracking: _trackingFromString(json['tracking'] as String?),
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

/// A single physical unit of stock identified by its serial number (or, for
/// bulk-tracked materials, a lot/SKU code with a quantity).
class WarehouseItem {
  WarehouseItem({
    required this.id,
    required this.serialNumber,
    required this.province,
    required this.status,
    required this.quantity,
    required this.materialId,
    this.materialName,
    this.materialColor,
    this.materialUnit,
    this.assignedToId,
    this.assignedToName,
    this.assignedToUsername,
    this.usedTicketId,
    this.usedTicketTechnique,
    this.usedTicketSiteName,
    this.usedAt,
    this.notes,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String serialNumber;
  final String province;
  final MaterialItemStatus status;
  final int quantity;
  final String materialId;
  final String? materialName;
  final String? materialColor;
  final String? materialUnit;
  final String? assignedToId;
  final String? assignedToName;
  final String? assignedToUsername;
  final String? usedTicketId;
  final String? usedTicketTechnique;
  final String? usedTicketSiteName;
  final DateTime? usedAt;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory WarehouseItem.fromJson(Map<String, dynamic> json) {
    final material = json['material'] as Map<String, dynamic>?;
    final assigned = json['assignedTo'] as Map<String, dynamic>?;
    final ticket = json['usedTicket'] as Map<String, dynamic>?;
    return WarehouseItem(
      id: json['id'] as String,
      serialNumber: json['serialNumber'] as String? ?? '',
      province: json['province'] as String? ?? '',
      status: materialItemStatusFromString(json['status'] as String?),
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      materialId: json['materialId'] as String? ?? material?['id'] as String? ?? '',
      materialName: material?['name'] as String?,
      materialColor: material?['color'] as String?,
      materialUnit: material?['unit'] as String?,
      assignedToId: json['assignedToId'] as String? ?? assigned?['id'] as String?,
      assignedToName: assigned?['name'] as String?,
      assignedToUsername: assigned?['username'] as String?,
      usedTicketId: json['usedTicketId'] as String? ?? ticket?['id'] as String?,
      usedTicketTechnique: ticket?['technique'] as String?,
      usedTicketSiteName: ticket?['siteName'] as String?,
      usedAt: json['usedAt'] != null
          ? DateTime.tryParse(json['usedAt'].toString())
          : null,
      notes: json['notes'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString())
          : null,
    );
  }
}

class WarehouseMovement {
  WarehouseMovement({
    required this.id,
    required this.type,
    required this.createdAt,
    this.itemId,
    this.itemSerial,
    this.materialName,
    this.materialColor,
    this.actorName,
    this.fromStaffName,
    this.toStaffName,
    this.ticketId,
    this.ticketTechnique,
    this.ticketSiteName,
    this.note,
    this.quantity = 1,
  });

  final String id;
  final String type;
  final DateTime createdAt;
  final String? itemId;
  final String? itemSerial;
  final String? materialName;
  final String? materialColor;
  final String? actorName;
  final String? fromStaffName;
  final String? toStaffName;
  final String? ticketId;
  final String? ticketTechnique;
  final String? ticketSiteName;
  final String? note;
  final int quantity;

  factory WarehouseMovement.fromJson(Map<String, dynamic> json) {
    final item = json['item'] as Map<String, dynamic>?;
    final material = item?['material'] as Map<String, dynamic>?;
    final actor = json['actor'] as Map<String, dynamic>?;
    final fromS = json['fromStaff'] as Map<String, dynamic>?;
    final toS = json['toStaff'] as Map<String, dynamic>?;
    final ticket = json['ticket'] as Map<String, dynamic>?;
    return WarehouseMovement(
      id: json['id'] as String,
      type: (json['type'] as String? ?? 'ADJUSTED').toUpperCase(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      itemId: item?['id'] as String?,
      itemSerial: item?['serialNumber'] as String?,
      materialName: material?['name'] as String?,
      materialColor: material?['color'] as String?,
      actorName: actor?['name'] as String? ?? actor?['username'] as String?,
      fromStaffName: fromS?['name'] as String? ?? fromS?['username'] as String?,
      toStaffName: toS?['name'] as String? ?? toS?['username'] as String?,
      ticketId: ticket?['id'] as String?,
      ticketTechnique: ticket?['technique'] as String?,
      ticketSiteName: ticket?['siteName'] as String?,
      note: json['note'] as String?,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    );
  }
}

class WarehouseDashboard {
  WarehouseDashboard({
    required this.total,
    required this.byStatus,
    required this.materialsCount,
    required this.byProvince,
    required this.byMaterial,
    required this.heldByStaff,
    required this.topUsageTickets,
    required this.recentMovements,
  });

  final int total;
  final Map<MaterialItemStatus, int> byStatus;
  final int materialsCount;
  final List<({String province, int count})> byProvince;
  final List<({String materialId, String name, String? color, int count})> byMaterial;
  final List<({String? staffId, String? name, String? username, String? role, String? province, int count})> heldByStaff;
  final List<({String? ticketId, String? technique, String? siteName, String? province, String? status, int used})> topUsageTickets;
  final List<WarehouseMovement> recentMovements;

  factory WarehouseDashboard.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    final byStatusRaw = summary['byStatus'] as Map<String, dynamic>? ?? const {};
    final byStatus = <MaterialItemStatus, int>{
      for (final e in byStatusRaw.entries)
        materialItemStatusFromString(e.key): (e.value as num?)?.toInt() ?? 0,
    };
    return WarehouseDashboard(
      total: (summary['total'] as num?)?.toInt() ?? 0,
      byStatus: byStatus,
      materialsCount: (summary['materialsCount'] as num?)?.toInt() ?? 0,
      byProvince: ((json['byProvince'] as List?) ?? const [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return (
              province: m['province'] as String? ?? '',
              count: (m['count'] as num?)?.toInt() ?? 0,
            );
          })
          .toList(),
      byMaterial: ((json['byMaterial'] as List?) ?? const [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return (
              materialId: m['materialId'] as String? ?? '',
              name: m['name'] as String? ?? 'Unknown',
              color: m['color'] as String?,
              count: (m['count'] as num?)?.toInt() ?? 0,
            );
          })
          .toList(),
      heldByStaff: ((json['heldByStaff'] as List?) ?? const [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return (
              staffId: m['staffId'] as String?,
              name: m['name'] as String?,
              username: m['username'] as String?,
              role: m['role'] as String?,
              province: m['province'] as String?,
              count: (m['count'] as num?)?.toInt() ?? 0,
            );
          })
          .toList(),
      topUsageTickets: ((json['topUsageTickets'] as List?) ?? const [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return (
              ticketId: m['ticketId'] as String?,
              technique: m['technique'] as String?,
              siteName: m['siteName'] as String?,
              province: m['province'] as String?,
              status: m['status'] as String?,
              used: (m['used'] as num?)?.toInt() ?? 0,
            );
          })
          .toList(),
      recentMovements: ((json['recentMovements'] as List?) ?? const [])
          .map((e) => WarehouseMovement.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
