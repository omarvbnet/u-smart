import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/private_company.dart';
import '../services/api_service.dart';

/// Manages the private company workspace lifecycle for the authenticated user.
class PrivateCompanyProvider extends ChangeNotifier {
  PrivateCompanyProvider(this._api);

  final ApiService _api;

  PrivateCompanyMembership _membership = PrivateCompanyMembership();
  PrivateCompanyWorkspace? _workspace;
  PrivateCompanyKpiSnapshot? _kpiSnapshot;
  bool _kpiLoading = false;
  bool _loading = false;
  String? _error;
  String? _lastSuccess;
  bool _submitting = false;

  PrivateCompanyMembership get membership => _membership;
  PrivateCompanyWorkspace? get workspace => _workspace;
  PrivateCompanyKpiSnapshot? get kpiSnapshot => _kpiSnapshot;
  bool get kpiLoading => _kpiLoading;
  bool get loading => _loading;
  bool get submitting => _submitting;
  String? get error => _error;
  String? get lastSuccess => _lastSuccess;

  bool get hasWorkspace => _workspace != null;
  /// All approved workspace members can open the Performance tab (scoped by role server-side).
  bool get canViewKpis => hasWorkspace && isApproved && (isOwner || isStaff);

  bool get isOwner => _membership.isOwner;
  bool get isStaff => _membership.isStaff;
  bool get isApproved => _workspace?.isApproved ?? false;
  bool get isPending => _workspace?.isPending ?? false;
  bool get isRejected => _workspace?.isRejected ?? false;
  bool get isSuspended => _workspace?.isSuspended ?? false;

  /// Resolved uppercase role for the current user inside the workspace.
  /// Prefers the authoritative `membership.role` from the API and falls back
  /// to the cached staff-list entry (which is only present once the workspace
  /// has been refreshed and the staff list includes the current user).
  String? get _resolvedRole {
    final fromMembership = _membership.role?.toUpperCase();
    if (fromMembership != null && fromMembership.isNotEmpty) return fromMembership;
    final fromStaff = _myStaffEntry?.role.toUpperCase();
    if (fromStaff != null && fromStaff.isNotEmpty) return fromStaff;
    return null;
  }

  /// Roles that can create checklists (engineers, managers, coordinators, owner).
  bool get canCreateChecklists {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    if (role == null) return false;
    return role == 'MANAGER' ||
        role == 'COORDINATOR' ||
        role == 'ENGINEER' ||
        role == 'QUALITY_ENGINEER' ||
        role == 'SUPERVISION_ENGINEER';
  }

  /// Roles that can add / edit / suspend / reset-password staff members.
  /// Owner + MANAGER + COORDINATOR. Hard-delete remains owner-only.
  bool get canManageStaff {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
  }

  /// Only the workspace owner can create / edit / delete departments.
  bool get canManageDepartments => isOwner;

  /// Only the workspace owner can broadcast workspace announcements.
  bool get canBroadcastNotifications => isOwner;

  /// Owner: full workspace export. Manager / coordinator: department-scoped export.
  bool get canExportWorkspaceData {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    if (role != 'MANAGER' && role != 'COORDINATOR') return false;
    return myDepartmentId != null && myDepartmentId!.isNotEmpty;
  }

  /// Owner or [WAREHOUSE_KEEPER] — can stock inventory, import Excel, assign items.
  bool get canManageWarehouse {
    if (isOwner) return true;
    if (!isStaff) return false;
    return _resolvedRole == 'WAREHOUSE_KEEPER';
  }

  /// Field / execution staff: warehouse APIs only return items assigned to this user.
  /// Owners, managers, coordinators, and warehouse keepers get full inventory.
  bool get seesOnlyAssignedWarehouseInventory {
    if (isOwner || !isStaff) return false;
    final role = _resolvedRole;
    if (role == null) return true;
    return role != 'MANAGER' &&
        role != 'COORDINATOR' &&
        role != 'WAREHOUSE_KEEPER';
  }

  /// Matches server [CAN_USE_MATERIALS_ON_TICKET_ROLES]: record use / self-report damaged or lost on assigned lines.
  bool get canRecordWarehouseMaterialOnTicket {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    if (role == null) return false;
    return role == 'MANAGER' ||
        role == 'COORDINATOR' ||
        role == 'ENGINEER' ||
        role == 'TECHNICIAN' ||
        role == 'WORKER';
  }

  /// True for managers/coordinators (non-owner) — they are scoped to their own
  /// department and may only grant the ENGINEER / TECHNICIAN / WORKER roles.
  bool get isDepartmentManager {
    if (isOwner) return false;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
  }

  /// Department id the current user belongs to (when staff).
  String? get myDepartmentId => _membership.departmentId;

  /// Short line for technician “Available” tab: department label + home province from staff profile.
  String? get workspaceFieldAssignmentHint {
    final ws = _workspace;
    if (ws == null || !isApproved || !isStaff) return null;
    final parts = <String>[];
    final mName = _membership.departmentName?.trim();
    if (mName != null && mName.isNotEmpty) {
      parts.add('Department: $mName');
    } else {
      final did = myDepartmentId ?? _myStaffEntry?.departmentId;
      if (did != null) {
        for (final d in ws.departments) {
          if (d.id == did) {
            final n = d.name.trim();
            if (n.isNotEmpty) parts.add('Department: $n');
            break;
          }
        }
      }
    }
    final p = _myStaffEntry?.province?.trim();
    if (p != null && p.isNotEmpty) parts.add('My province: $p');
    return parts.isEmpty ? null : parts.join(' · ');
  }

  /// Cached entry of the current user inside the workspace's staff list (only set
  /// when [setCurrentRequesterId] has been called and the user is staff).
  PrivateCompanyStaff? _myStaffEntry;
  String? _currentRequesterId;

  void setCurrentRequesterId(String? id) {
    _currentRequesterId = id;
    _refreshMyStaffEntry();
  }

  void _refreshMyStaffEntry() {
    final id = _currentRequesterId;
    if (id == null || _workspace == null) {
      _myStaffEntry = null;
      return;
    }
    PrivateCompanyStaff? hit;
    for (final s in _workspace!.staff) {
      if (s.id == id) {
        hit = s;
        break;
      }
    }
    _myStaffEntry = hit;
  }

  void _setError(String? message) {
    _error = message;
    if (message != null) _lastSuccess = null;
    notifyListeners();
  }

  void _setSuccess(String? message) {
    _lastSuccess = message;
    if (message != null) _error = null;
    notifyListeners();
  }

  void clearMessages() {
    if (_error == null && _lastSuccess == null) return;
    _error = null;
    _lastSuccess = null;
    notifyListeners();
  }

  Future<List<int>?> downloadWorkspaceExport({int days = 365}) async {
    if (!canExportWorkspaceData) return null;
    final d = days.clamp(7, 730);
    return _api.getBytes(
      ApiConfig.privateCompanyExport,
      query: {'days': '$d'},
    );
  }

  Future<void> fetchKpis({int days = 365}) async {
    if (!canViewKpis) return;
    _kpiLoading = true;
    notifyListeners();
    try {
      final d = days.clamp(7, 730);
      final res = await _api.getSafe(
        ApiConfig.privateCompanyKpis,
        query: {'days': '$d'},
      );
      if (res != null && res['success'] == true) {
        _kpiSnapshot = PrivateCompanyKpiSnapshot.fromJson(res);
      }
    } catch (_) {
      /* keep previous snapshot */
    } finally {
      _kpiLoading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    _loading = true;
    notifyListeners();
    try {
      final data = await _api.getSafe(ApiConfig.privateCompany);
      if (data == null || data['success'] != true) {
        _workspace = null;
        _membership = PrivateCompanyMembership();
        _kpiSnapshot = null;
        return;
      }
      final mship = data['membership'];
      _membership = mship is Map<String, dynamic>
          ? PrivateCompanyMembership.fromJson(mship)
          : PrivateCompanyMembership();
      final ws = data['workspace'];
      _workspace = ws is Map<String, dynamic>
          ? PrivateCompanyWorkspace.fromJson(ws)
          : null;
      _refreshMyStaffEntry();
    } catch (e) {
      _workspace = null;
      _membership = PrivateCompanyMembership();
      _kpiSnapshot = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  // ─── Owner: request workspace ────────────────────────────────────────────

  Future<bool> requestWorkspace({
    required String name,
    String? description,
  }) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompany, body: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      });
      if (res['success'] == true) {
        await refresh();
        _setSuccess(res['message']?.toString() ?? 'Workspace request submitted.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to submit request.');
      return false;
    } catch (_) {
      _setError('Network error while submitting request.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> updateWorkspace({String? name, String? description}) async {
    if (!isOwner) return false;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(ApiConfig.privateCompany, body: {
        if (name != null) 'name': name,
        if (description != null) 'description': description,
      });
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Workspace updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  // ─── Departments ─────────────────────────────────────────────────────────

  Future<bool> createDepartment({
    required String name,
    String? description,
    String? color,
    String? iconKey,
    bool engineerAvailabilityPoolEnabled = true,
    bool technicianAvailabilityPoolEnabled = true,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyDepartments, body: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
        if (color != null) 'color': color,
        if (iconKey != null) 'iconKey': iconKey,
        'engineerAvailabilityPoolEnabled': engineerAvailabilityPoolEnabled,
        'technicianAvailabilityPoolEnabled': technicianAvailabilityPoolEnabled,
      });
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Department "$name" created.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to create department.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> updateDepartment(
    String id, {
    String? name,
    String? description,
    String? color,
    String? iconKey,
    bool? maintenanceProximityJoinEnabled,
    int? maintenanceProximityRadiusM,
    bool? engineerAvailabilityPoolEnabled,
    bool? technicianAvailabilityPoolEnabled,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(ApiConfig.privateCompanyDepartments, body: {
        'id': id,
        if (name != null) 'name': name,
        if (description != null) 'description': description,
        if (color != null) 'color': color,
        if (iconKey != null) 'iconKey': iconKey,
        if (maintenanceProximityJoinEnabled != null)
          'maintenanceProximityJoinEnabled': maintenanceProximityJoinEnabled,
        if (maintenanceProximityRadiusM != null)
          'maintenanceProximityRadiusM': maintenanceProximityRadiusM,
        if (engineerAvailabilityPoolEnabled != null)
          'engineerAvailabilityPoolEnabled': engineerAvailabilityPoolEnabled,
        if (technicianAvailabilityPoolEnabled != null)
          'technicianAvailabilityPoolEnabled': technicianAvailabilityPoolEnabled,
      });
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Department updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteDepartment(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyDepartments,
        query: {'id': id},
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Department removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to delete.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  // ─── Staff ───────────────────────────────────────────────────────────────

  /// Returns the temporary password (or null on failure) so the UI can show it once.
  Future<String?> createStaff({
    required String firstName,
    String? lastName,
    String? email,
    String? phone,
    required String role,
    String? departmentId,
    String? specialization,
    required String province,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyStaff, body: {
        'firstName': firstName,
        if (lastName != null && lastName.trim().isNotEmpty)
          'lastName': lastName.trim(),
        if (email != null && email.trim().isNotEmpty) 'email': email.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        'role': role,
        if (departmentId != null && departmentId.isNotEmpty)
          'departmentId': departmentId,
        if (specialization != null && specialization.isNotEmpty)
          'specialization': specialization,
        'province': province,
      });
      if (res['success'] == true) {
        final cred = res['credentials'] as Map<String, dynamic>?;
        await refresh();
        final tempPassword = cred?['temporaryPassword'] as String?;
        final username = cred?['username'] as String?;
        _setSuccess(
          'Staff created. Username: $username · temp password: $tempPassword',
        );
        return tempPassword;
      }
      _setError(res['message']?.toString() ?? 'Failed to create staff.');
      return null;
    } catch (_) {
      _setError('Network error while creating staff.');
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> updateStaff(
    String id, {
    String? role,
    String? departmentId,
    String? specialization,
    String? status,
    String? name,
    String? province,
    bool? provinceFilterActive,
    List<String>? privateCompanyAllowedTaskSlugs,
    bool? maintenanceProximityJoinOverride,
    bool clearMaintenanceProximityJoinOverride = false,
    int? maintenanceProximityRadiusOverrideM,
    bool clearMaintenanceProximityRadiusOverride = false,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final body = <String, dynamic>{
        'id': id,
        if (role != null) 'role': role,
        if (departmentId != null) 'departmentId': departmentId,
        if (specialization != null) 'specialization': specialization,
        if (status != null) 'status': status,
        if (name != null) 'name': name,
        if (province != null && province.trim().isNotEmpty)
          'province': province.trim(),
        if (provinceFilterActive != null)
          'provinceFilterActive': provinceFilterActive,
        if (privateCompanyAllowedTaskSlugs != null)
          'privateCompanyAllowedTaskSlugs': privateCompanyAllowedTaskSlugs,
        if (clearMaintenanceProximityJoinOverride)
          'maintenanceProximityJoinOverride': null,
        if (!clearMaintenanceProximityJoinOverride &&
            maintenanceProximityJoinOverride != null)
          'maintenanceProximityJoinOverride': maintenanceProximityJoinOverride,
        if (clearMaintenanceProximityRadiusOverride)
          'maintenanceProximityRadiusOverrideM': null,
        if (!clearMaintenanceProximityRadiusOverride &&
            maintenanceProximityRadiusOverrideM != null)
          'maintenanceProximityRadiusOverrideM': maintenanceProximityRadiusOverrideM,
      };
      final res = await _api.patch(ApiConfig.privateCompanyStaff, body: body);
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Staff updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update staff.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  /// Owner regenerates a staff member's temporary password.
  /// Returns the new temp password (visible only this once) or null on failure.
  Future<String?> resetStaffPassword(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(ApiConfig.privateCompanyStaff, body: {
        'id': id,
        'resetPassword': true,
      });
      if (res['success'] == true) {
        final cred = res['credentials'] as Map<String, dynamic>?;
        final tempPassword = cred?['temporaryPassword'] as String?;
        final username = cred?['username'] as String?;
        await refresh();
        _setSuccess(
          'Password reset. Username: $username · temp password: $tempPassword',
        );
        return tempPassword;
      }
      _setError(res['message']?.toString() ?? 'Failed to reset password.');
      return null;
    } catch (_) {
      _setError('Network error while resetting password.');
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> removeStaff(String id, {bool hardDelete = false}) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyStaff,
        query: {
          'id': id,
          if (hardDelete) 'hard': '1',
        },
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess(hardDelete
            ? 'Staff account deleted.'
            : 'Staff removed from workspace.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to remove staff.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  // ─── Checklists ──────────────────────────────────────────────────────────

  Future<bool> createChecklist({
    required String name,
    String? description,
    String? category,
    List<String> techniqueTypes = const [],
    required List<PrivateCompanyChecklistItem> items,
    String? departmentId,
  }) async {
    if (items.isEmpty) {
      _setError('Add at least one checklist item.');
      return false;
    }
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyChecklists, body: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
        if (category != null && category.isNotEmpty) 'category': category,
        'techniqueTypes': techniqueTypes,
        'items': items.map((e) => e.toJson()).toList(),
        if (departmentId != null && departmentId.isNotEmpty)
          'departmentId': departmentId,
      });
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Checklist "$name" saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save checklist.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteChecklist(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyChecklists,
        query: {'id': id},
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Checklist removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to delete checklist.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  /// Only the workspace owner may manage workspace-scoped ticket techniques.
  bool get canManageWorkspaceTechniques => isOwner;

  // ─── Workspace techniques (owner) ───────────────────────────────────────

  Future<List<Map<String, dynamic>>> fetchWorkspaceTechniquesManagement() async {
    try {
      final res = await _api.get(ApiConfig.privateCompanyTechniques);
      if (res['success'] == true && res['techniques'] is List) {
        return List<Map<String, dynamic>>.from(res['techniques'] as List);
      }
    } catch (_) {}
    return [];
  }

  Future<bool> createWorkspaceTechnique({
    required String category,
    required String slug,
    required String labelAr,
    String? labelEn,
    int sortOrder = 0,
    String? departmentId,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyTechniques, body: {
        'category': category,
        'slug': slug,
        'labelAr': labelAr,
        if (labelEn != null && labelEn.trim().isNotEmpty) 'labelEn': labelEn.trim(),
        'sortOrder': sortOrder,
        if (departmentId != null && departmentId.isNotEmpty) 'departmentId': departmentId,
      });
      if (res['success'] == true) {
        _setSuccess('Technique saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save technique.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteWorkspaceTechnique(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(ApiConfig.privateCompanyTechniqueDetail(id));
      if (res['success'] == true) {
        _setSuccess('Technique removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to delete.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  // ─── Owner broadcast ─────────────────────────────────────────────────────

  /// Owner-only. Sends an in-app + push notification to staff matching the
  /// selected audience. `mode` is one of 'all', 'departments', 'specializations',
  /// or 'both'. Returns the number of staff the notification was delivered to,
  /// or null on failure.
  Future<int?> broadcastNotification({
    required String message,
    String? title,
    String mode = 'all',
    List<String> departmentIds = const [],
    List<String> specializations = const [],
    List<String> provinces = const [],
    bool includeOwner = false,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyNotifications, body: {
        'body': message,
        if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
        'mode': mode,
        if (departmentIds.isNotEmpty) 'departmentIds': departmentIds,
        if (specializations.isNotEmpty) 'specializations': specializations,
        if (provinces.isNotEmpty) 'provinces': provinces,
        'includeOwner': includeOwner,
      });
      if (res['success'] == true) {
        final delivered = (res['delivered'] as num?)?.toInt() ?? 0;
        _setSuccess(
          delivered == 0
              ? 'Notification queued.'
              : 'Notification sent to $delivered staff member${delivered == 1 ? '' : 's'}.',
        );
        return delivered;
      }
      _setError(res['message']?.toString() ?? 'Failed to send notification.');
      return null;
    } catch (_) {
      _setError('Network error while sending the notification.');
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  void reset() {
    _membership = PrivateCompanyMembership();
    _workspace = null;
    _myStaffEntry = null;
    _error = null;
    _lastSuccess = null;
    notifyListeners();
  }
}
