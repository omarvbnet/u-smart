import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../config/api_config.dart';
import '../models/private_company.dart';
import '../models/private_company_cancellation.dart';
import '../models/maintenance_completion_reason.dart';
import '../models/private_company_expense.dart';
import '../services/api_service.dart';

/// Manages the private company workspace lifecycle for the authenticated user.
class PrivateCompanyProvider extends ChangeNotifier {
  PrivateCompanyProvider(this._api);

  final ApiService _api;

  PrivateCompanyMembership _membership = PrivateCompanyMembership();
  PrivateCompanyWorkspace? _workspace;
  PrivateCompanyKpiSnapshot? _kpiSnapshot;
  bool _kpiLoading = false;
  ExpenseAnalyticsSnapshot? _expenseAnalytics;
  bool _expenseAnalyticsLoading = false;
  String? _expenseAnalyticsError;
  CancellationAnalyticsSnapshot? _cancellationAnalytics;
  bool _cancellationAnalyticsLoading = false;
  List<MaintenanceCompletionReasonRow> _maintenanceReasons = [];
  bool _maintenanceReasonsLoading = false;
  MaintenanceReasonAnalyticsSnapshot? _maintenanceReasonAnalytics;
  bool _maintenanceReasonAnalyticsLoading = false;
  bool _loading = false;
  String? _error;
  String? _lastSuccess;
  bool _submitting = false;

  PrivateCompanyMembership get membership => _membership;
  PrivateCompanyWorkspace? get workspace => _workspace;
  PrivateCompanyKpiSnapshot? get kpiSnapshot => _kpiSnapshot;
  bool get kpiLoading => _kpiLoading;
  ExpenseAnalyticsSnapshot? get expenseAnalytics => _expenseAnalytics;
  bool get expenseAnalyticsLoading => _expenseAnalyticsLoading;
  String? get expenseAnalyticsError => _expenseAnalyticsError;
  CancellationAnalyticsSnapshot? get cancellationAnalytics => _cancellationAnalytics;
  bool get cancellationAnalyticsLoading => _cancellationAnalyticsLoading;
  List<MaintenanceCompletionReasonRow> get maintenanceReasons => _maintenanceReasons;
  bool get maintenanceReasonsLoading => _maintenanceReasonsLoading;
  MaintenanceReasonAnalyticsSnapshot? get maintenanceReasonAnalytics =>
      _maintenanceReasonAnalytics;
  bool get maintenanceReasonAnalyticsLoading => _maintenanceReasonAnalyticsLoading;
  bool get loading => _loading;
  bool get submitting => _submitting;
  String? get error => _error;
  String? get lastSuccess => _lastSuccess;

  bool get hasWorkspace => _workspace != null;

  /// Approved private-workspace company display name (owner or staff).
  String? get workspaceCompanyName {
    final n = _workspace?.name.trim();
    if (n == null || n.isEmpty) return null;
    return n;
  }

  /// Owner or active staff in an approved workspace.
  bool get canOpenPrivateWorkspace =>
      hasWorkspace && isApproved && (isOwner || isStaff);

  static const _fieldStaffRoles = {
    'ENGINEER',
    'TECHNICIAN',
    'WORKER',
    'QUALITY_ENGINEER',
    'SUPERVISION_ENGINEER',
  };

  /// Execution roles created inside a workspace (not owner / manager / coordinator / keeper).
  bool get isPrivateWorkspaceFieldStaff {
    if (!isApproved || !isStaff || isOwner) return false;
    final role = _resolvedRole;
    if (role == null || role.isEmpty) return false;
    return _fieldStaffRoles.contains(role);
  }

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

  /// Owner, manager, or coordinator — may update checklists and notify the department.
  bool get canManageChecklists {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
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

  /// Owner or manager — see every workspace ticket across all departments (API-enforced).
  bool get canViewAllWorkspaceTickets {
    if (isOwner) return true;
    if (!isStaff) return false;
    return _resolvedRole == 'MANAGER';
  }

  /// Owner, manager, or coordinator — add workspace sites and attach QField directly.
  bool get canManageSites {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
  }

  /// Owner, manager, or coordinator — see live staff on QField maps (with names).
  bool get canViewTeamLiveOnMap {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
  }

  /// Field staff may propose site / QField updates (requires lead confirmation).
  bool get canProposeSiteChanges => isPrivateWorkspaceFieldStaff;

  /// Roles that can add / edit / suspend / reset-password staff members.
  /// Owner + MANAGER + COORDINATOR. Hard-delete remains owner-only.
  bool get canManageStaff {
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole;
    return role == 'MANAGER' || role == 'COORDINATOR';
  }

  /// Owner, manager, or coordinator — manage workspace cancellation reason presets.
  bool get canManageCancellationReasons => canManageStaff;

  /// Who may download the ticket-expenses XLSX (API-enforced).
  bool get canExportExpenseLines {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole ?? '';
    if (role == 'MANAGER' || role == 'COORDINATOR') {
      return myDepartmentId != null && myDepartmentId!.isNotEmpty;
    }
    const selfRoles = {
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'QUALITY_ENGINEER',
      'SUPERVISION_ENGINEER',
    };
    if (selfRoles.contains(role) && (workspace?.ticketExpensesEnabled == true)) {
      return true;
    }
    return false;
  }

  /// Only the workspace owner can create / edit / delete departments.
  bool get canManageDepartments => isOwner;

  /// Owner (all departments) or manager/coordinator with an assigned department.
  bool get canManageMaintenanceReasons {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = _resolvedRole ?? '';
    if (role != 'MANAGER' && role != 'COORDINATOR') return false;
    return myDepartmentId != null && myDepartmentId!.isNotEmpty;
  }

  bool get canViewMaintenanceReasonAnalytics => canManageMaintenanceReasons;

  /// Pending maintenance in [ENGINEER_ASSIGNS] departments: who may pick a technician (API-enforced).
  String engineerTicketScopeForDepartment(String? departmentId) {
    if (!hasWorkspace || departmentId == null || departmentId.isEmpty) {
      return 'BOTH';
    }
    for (final d in _workspace!.departments) {
      if (d.id == departmentId) return d.engineerTicketScope;
    }
    return 'BOTH';
  }

  String resolvedEngineerTicketScope({String? staffOverride, String? departmentId}) {
    if (staffOverride != null && staffOverride.trim().isNotEmpty) {
      return staffOverride.trim().toUpperCase();
    }
    return engineerTicketScopeForDepartment(departmentId);
  }

  /// Whether the current engineer may self-assign or triage this ticket type.
  bool engineerMayClaimTicket({
    required bool isMaintenance,
    String? targetDepartmentId,
    String? staffScopeOverride,
  }) {
    final scope = resolvedEngineerTicketScope(
      staffOverride: staffScopeOverride,
      departmentId: myDepartmentId ?? targetDepartmentId,
    );
    if (isMaintenance) {
      if (scope == 'QC_ONLY') return false;
      return departmentUsesEngineerMaintenanceDispatch(targetDepartmentId);
    }
    if (scope == 'MAINTENANCE_ONLY') return false;
    return true;
  }

  bool departmentUsesEngineerMaintenanceDispatch(String? departmentId) {
    if (!hasWorkspace || departmentId == null || departmentId.isEmpty) return false;
    for (final d in _workspace!.departments) {
      if (d.id == departmentId) {
        return d.maintenanceDispatchMode == 'ENGINEER_ASSIGNS';
      }
    }
    return false;
  }

  /// Same-department dispatchers, or the workspace owner, may assign a technician for engineer-dispatch maintenance.
  bool canDispatchMaintenanceForDepartment(String? targetDepartmentId) {
    if (!hasWorkspace || !isApproved || targetDepartmentId == null || targetDepartmentId.isEmpty) {
      return false;
    }
    if (isOwner) return true;
    if (!isStaff) return false;
    final role = (_resolvedRole ?? '').toUpperCase();
    const dispatchRoles = {
      'ENGINEER',
      'QUALITY_ENGINEER',
      'SUPERVISION_ENGINEER',
      'MANAGER',
      'COORDINATOR',
    };
    if (!dispatchRoles.contains(role)) return false;
    return myDepartmentId == targetDepartmentId;
  }

  /// Only the workspace owner can broadcast workspace announcements.
  bool get canBroadcastNotifications => isOwner;

  /// Owner or coordinator: optional target department on workspace-scoped tickets (omit = all departments).
  bool get canChooseWorkspaceTicketTargetDepartment {
    if (isOwner) return true;
    if (!isStaff) return false;
    return _resolvedRole == 'COORDINATOR';
  }

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

  /// Assign units from warehouse stock (+ browse assignment search). Owners,
  /// keepers, managers, and coordinators (API restricts managers to tool SKUs).
  bool get canAssignWarehouseToolsToStaff {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    if (!isStaff) return false;
    final r = _resolvedRole;
    return r == 'WAREHOUSE_KEEPER' || r == 'MANAGER' || r == 'COORDINATOR';
  }

  /// Peer handoff of tool stock already assigned to this user (after handover confirm).
  bool get canPeerTransferWarehouseTool {
    if (!hasWorkspace || !isApproved || !isStaff) return false;
    final r = _resolvedRole;
    return r == 'ENGINEER' ||
        r == 'TECHNICIAN' ||
        r == 'WORKER' ||
        r == 'QUALITY_ENGINEER' ||
        r == 'SUPERVISION_ENGINEER';
  }

  /// Excel export of warehouse tools/materials (owner, keeper, dept manager/coordinator).
  bool get canExportWarehouseToolsReport {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    if (!isStaff) return false;
    final r = _resolvedRole;
    if (r == 'WAREHOUSE_KEEPER') return true;
    if (r != 'MANAGER' && r != 'COORDINATOR') return false;
    return myDepartmentId != null && myDepartmentId!.isNotEmpty;
  }

  /// Workspace owner or department manager/coordinator — view and resolve conflict cases.
  bool get canManageWorkspaceConflicts {
    if (!hasWorkspace || !isApproved) return false;
    if (isOwner) return true;
    return isDepartmentManager && myDepartmentId != null && myDepartmentId!.isNotEmpty;
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
  PrivateCompanyStaff? get myStaffEntry => _myStaffEntry;
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

  /// When GPS is available, marks assigned maintenance/QC tickets ON_SITE within department radius.
  Future<int> checkWorkspaceSiteArrival() async {
    if (!hasWorkspace || !isApproved) return 0;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return 0;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      final res = await _api.post(ApiConfig.privateCompanySiteArrivalCheck, body: {
        'latitude': pos.latitude,
        'longitude': pos.longitude,
      });
      if (res['success'] == true) {
        return (res['updatedCount'] as num?)?.toInt() ??
            ((res['updated'] as List?)?.length ?? 0);
      }
    } catch (_) {
      /* location optional */
    }
    return 0;
  }

  Future<void> fetchKpis({int days = 365, String? province}) async {
    if (!canViewKpis) return;
    _kpiLoading = true;
    notifyListeners();
    try {
      final d = days.clamp(7, 730);
      final query = <String, String>{'days': '$d'};
      final p = province?.trim();
      if (p != null && p.isNotEmpty) query['province'] = p;
      final res = await _api.getSafe(
        ApiConfig.privateCompanyKpis,
        query: query,
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

  Future<void> fetchExpenseAnalytics({
    int days = 90,
    DateTime? from,
    DateTime? to,
    String? province,
    String? departmentId,
    String? staffId,
  }) async {
    if (!hasWorkspace || !isApproved) return;
    _expenseAnalyticsLoading = true;
    _expenseAnalyticsError = null;
    notifyListeners();
    try {
      String? deptQ = departmentId?.trim();
      String? staffQ = staffId?.trim();
      if (isOwner) {
        // Owner may filter by department and staff.
      } else if (isDepartmentManager) {
        staffQ = null;
        deptQ = null;
      } else {
        deptQ = null;
        staffQ = null;
      }
      final query = <String, String>{};
      if (from != null && to != null) {
        String ymd(DateTime d) =>
            '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        query['from'] = ymd(from);
        query['to'] = ymd(to);
      } else {
        query['days'] = '${days.clamp(1, 730)}';
      }
      final p = province?.trim();
      if (p != null && p.isNotEmpty) query['province'] = p;
      final d = deptQ;
      if (d != null && d.isNotEmpty) query['departmentId'] = d;
      final s = staffQ;
      if (s != null && s.isNotEmpty) query['staffId'] = s;
      final res = await _api.getSafe(ApiConfig.privateCompanyExpensesAnalytics, query: query);
      if (res != null && res['success'] == true) {
        try {
          _expenseAnalytics = ExpenseAnalyticsSnapshot.fromJson(res);
          _expenseAnalyticsError = null;
        } catch (_) {
          _expenseAnalytics = null;
          _expenseAnalyticsError = 'Could not read expense analytics.';
        }
      } else {
        _expenseAnalytics = null;
        _expenseAnalyticsError =
            res?['message']?.toString() ?? 'Expense analytics unavailable.';
      }
    } catch (_) {
      _expenseAnalyticsError = 'Network error loading expense analytics.';
    } finally {
      _expenseAnalyticsLoading = false;
      notifyListeners();
    }
  }

  /// XLSX of all expense lines in [from]–[to] (inclusive calendar days, UTC on server).
  /// Owners see workspace-wide data; managers/coordinators are department-scoped by the API.
  /// Optional filters match the expense analytics panel (province / department).
  Future<List<int>?> downloadTicketExpensesExport({
    required DateTime from,
    required DateTime to,
    String? province,
    String? departmentId,
  }) async {
    if (!canExportExpenseLines || !hasWorkspace || !isApproved) return null;
    String ymd(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final query = <String, String>{
      'from': ymd(from),
      'to': ymd(to),
    };
    final p = province?.trim();
    if (p != null && p.isNotEmpty) query['province'] = p;
    var d = departmentId?.trim();
    if (!isOwner) {
      final role = (_resolvedRole ?? '').toUpperCase();
      if (role != 'MANAGER' && role != 'COORDINATOR') {
        d = null;
      }
    }
    if (d != null && d.isNotEmpty) query['departmentId'] = d;
    return _api.getBytes(ApiConfig.privateCompanyExpensesExport, query: query);
  }

  Future<void> fetchCancellationAnalytics({
    int days = 90,
    DateTime? from,
    DateTime? to,
    String? province,
    String? departmentId,
  }) async {
    if (!hasWorkspace || !isApproved) return;
    if (!canManageStaff) return;
    _cancellationAnalyticsLoading = true;
    notifyListeners();
    try {
      final query = <String, String>{};
      if (from != null && to != null) {
        String ymd(DateTime d) =>
            '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        query['from'] = ymd(from);
        query['to'] = ymd(to);
      } else {
        query['days'] = '${days.clamp(1, 730)}';
      }
      final p = province?.trim();
      if (p != null && p.isNotEmpty) query['province'] = p;
      final d = departmentId?.trim();
      if (d != null && d.isNotEmpty) query['departmentId'] = d;
      final res = await _api.getSafe(
        ApiConfig.privateCompanyCancellationsAnalytics,
        query: query,
      );
      if (res != null && res['success'] == true) {
        _cancellationAnalytics = CancellationAnalyticsSnapshot.fromJson(res);
      }
    } catch (_) {
      /* keep previous */
    } finally {
      _cancellationAnalyticsLoading = false;
      notifyListeners();
    }
  }

  Future<void> fetchMaintenanceReasons({String? departmentId, bool includeInactive = true}) async {
    if (!canManageMaintenanceReasons) return;
    _maintenanceReasonsLoading = true;
    notifyListeners();
    try {
      final query = <String, String>{};
      if (includeInactive) query['includeInactive'] = '1';
      var dept = departmentId?.trim();
      if (!isOwner) dept = myDepartmentId;
      if (dept != null && dept.isNotEmpty) query['departmentId'] = dept;
      final res = await _api.getSafe(ApiConfig.privateCompanyMaintenanceReasons, query: query);
      if (res != null && res['success'] == true) {
        final raw = res['reasons'] as List<dynamic>? ?? [];
        _maintenanceReasons = raw
            .whereType<Map<String, dynamic>>()
            .map(MaintenanceCompletionReasonRow.fromJson)
            .toList();
      }
    } catch (_) {
      /* keep previous */
    } finally {
      _maintenanceReasonsLoading = false;
      notifyListeners();
    }
  }

  Future<bool> addMaintenanceReason({
    required String departmentId,
    required String label,
  }) async {
    if (!canManageMaintenanceReasons) return false;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(
        ApiConfig.privateCompanyMaintenanceReasons,
        body: {'departmentId': departmentId, 'label': label.trim()},
      );
      if (res['success'] == true) {
        await fetchMaintenanceReasons(departmentId: departmentId);
        _setSuccess('Maintenance reason added.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to add reason.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> removeMaintenanceReason(String id, {String? departmentId}) async {
    if (!canManageMaintenanceReasons) return false;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(ApiConfig.privateCompanyMaintenanceReasonDetail(id));
      if (res['success'] == true) {
        await fetchMaintenanceReasons(departmentId: departmentId);
        _setSuccess('Maintenance reason removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to remove reason.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<void> fetchMaintenanceReasonAnalytics({
    int days = 90,
    DateTime? from,
    DateTime? to,
    String? departmentId,
  }) async {
    if (!canViewMaintenanceReasonAnalytics) return;
    _maintenanceReasonAnalyticsLoading = true;
    notifyListeners();
    try {
      final query = <String, String>{};
      if (from != null && to != null) {
        String ymd(DateTime d) =>
            '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        query['from'] = ymd(from);
        query['to'] = ymd(to);
      } else {
        query['days'] = '${days.clamp(1, 730)}';
      }
      var dept = departmentId?.trim();
      if (!isOwner) dept = myDepartmentId;
      if (dept != null && dept.isNotEmpty) query['departmentId'] = dept;
      final res = await _api.getSafe(
        ApiConfig.privateCompanyMaintenanceReasonsAnalytics,
        query: query,
      );
      if (res != null && res['success'] == true) {
        _maintenanceReasonAnalytics = MaintenanceReasonAnalyticsSnapshot.fromJson(res);
      }
    } catch (_) {
      /* keep previous */
    } finally {
      _maintenanceReasonAnalyticsLoading = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> fetchCancellationSettings() async {
    try {
      final res = await _api.get(ApiConfig.privateCompanyCancellationSettings);
      if (res['success'] == true) {
        return Map<String, dynamic>.from(res as Map);
      }
    } catch (_) {}
    return null;
  }

  Future<bool> patchCancellationSettings({List<String>? reasons}) async {
    if (!canManageCancellationReasons) return false;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(
        ApiConfig.privateCompanyCancellationSettings,
        body: {if (reasons != null) 'reasons': reasons},
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Cancellation reasons saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> fetchExpenseSettingsDetail() async {
    try {
      final res = await _api.get(ApiConfig.privateCompanyExpenseSettings);
      if (res['success'] == true) {
        return Map<String, dynamic>.from(res as Map);
      }
    } catch (_) {}
    return null;
  }

  Future<bool> patchExpenseSettings({
    List<String>? reasons,
    bool? enabled,
    bool requestActivation = false,
    bool approveActivation = false,
    bool rejectActivation = false,
    bool disable = false,
    Map<String, dynamic>? techniquePatch,
  }) async {
    if (!canManageStaff) return false;
    _submitting = true;
    notifyListeners();
    try {
      final body = <String, dynamic>{
        if (reasons != null) 'reasons': reasons,
        if (enabled == true) 'enabled': true,
        if (requestActivation) 'requestActivation': true,
        if (approveActivation) 'approveActivation': true,
        if (rejectActivation) 'rejectActivation': true,
        if (disable) 'disable': true,
        if (techniquePatch != null) 'techniquePatch': techniquePatch,
      };
      final res = await _api.patch(ApiConfig.privateCompanyExpenseSettings, body: body);
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Expense settings saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save expense settings.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> submitTicketExpense({
    required String ticketId,
    required double amount,
    required String reason,
    String? note,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyExpenses, body: {
        'ticketId': ticketId,
        'amount': amount,
        'reason': reason,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      });
      if (res['success'] == true) {
        _setSuccess('Expense recorded.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to record expense.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteTicketExpense(String expenseId) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(ApiConfig.privateCompanyExpenseDetail(expenseId));
      if (res['success'] == true) {
        _setSuccess('Expense removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to remove expense.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  /// Owner, manager, or coordinator: labels for material USE / DAMAGE / LOST audit dropdowns.
  Future<bool> updateMaterialUseReasons(List<String> reasons) async {
    if (!canManageStaff) return false;
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(
        ApiConfig.privateCompanyWarehouseMaterialUseReasons,
        body: {'reasons': reasons},
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Material reasons saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save reasons.');
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
    String maintenanceDispatchMode = 'DIRECT_TECHNICIAN',
    String engineerTicketScope = 'BOTH',
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final mode = maintenanceDispatchMode.trim().toUpperCase() == 'ENGINEER_ASSIGNS'
          ? 'ENGINEER_ASSIGNS'
          : 'DIRECT_TECHNICIAN';
      final res = await _api.post(ApiConfig.privateCompanyDepartments, body: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
        if (color != null) 'color': color,
        if (iconKey != null) 'iconKey': iconKey,
        'engineerAvailabilityPoolEnabled': engineerAvailabilityPoolEnabled,
        'technicianAvailabilityPoolEnabled': technicianAvailabilityPoolEnabled,
        'maintenanceDispatchMode': mode,
        'engineerTicketScope': _normalizeEngineerTicketScope(engineerTicketScope),
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
    bool? siteArrivalAutoOnSiteEnabled,
    bool? engineerAvailabilityPoolEnabled,
    bool? technicianAvailabilityPoolEnabled,
    String? maintenanceDispatchMode,
    String? engineerTicketScope,
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
        if (siteArrivalAutoOnSiteEnabled != null)
          'siteArrivalAutoOnSiteEnabled': siteArrivalAutoOnSiteEnabled,
        if (engineerAvailabilityPoolEnabled != null)
          'engineerAvailabilityPoolEnabled': engineerAvailabilityPoolEnabled,
        if (technicianAvailabilityPoolEnabled != null)
          'technicianAvailabilityPoolEnabled': technicianAvailabilityPoolEnabled,
        if (maintenanceDispatchMode != null)
          'maintenanceDispatchMode':
              maintenanceDispatchMode.trim().toUpperCase() == 'ENGINEER_ASSIGNS'
                  ? 'ENGINEER_ASSIGNS'
                  : 'DIRECT_TECHNICIAN',
        if (engineerTicketScope != null)
          'engineerTicketScope': _normalizeEngineerTicketScope(engineerTicketScope),
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
    String? privateCompanyEngineerTicketScope,
    bool clearEngineerTicketScopeOverride = false,
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
        if (clearEngineerTicketScopeOverride)
          'privateCompanyEngineerTicketScope': null,
        if (!clearEngineerTicketScopeOverride &&
            privateCompanyEngineerTicketScope != null)
          'privateCompanyEngineerTicketScope':
              _normalizeEngineerTicketScope(privateCompanyEngineerTicketScope),
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

  Future<bool> updateChecklist({
    required String id,
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
      final res = await _api.patch(
        ApiConfig.privateCompanyChecklistDetail(id),
        body: {
          'name': name,
          if (description != null && description.trim().isNotEmpty)
            'description': description.trim(),
          if (category != null && category.isNotEmpty) 'category': category,
          'techniqueTypes': techniqueTypes,
          'items': items.map((e) => e.toJson()).toList(),
          'departmentId': departmentId ?? '',
        },
      );
      if (res['success'] == true) {
        await refresh();
        _setSuccess('Checklist "$name" updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update checklist.');
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

  static String _normalizeEngineerTicketScope(String raw) {
    final u = raw.trim().toUpperCase();
    if (u == 'QC_ONLY') return 'QC_ONLY';
    if (u == 'MAINTENANCE_ONLY') return 'MAINTENANCE_ONLY';
    return 'BOTH';
  }
}
