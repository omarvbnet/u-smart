import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/private_company_warehouse.dart';
import '../services/api_service.dart';

/// Manages all state for the Private Company workspace warehouse:
/// material catalog, serial-numbered items, assignments, ticket-usage
/// records, and the rolling dashboard.
class PrivateCompanyWarehouseProvider extends ChangeNotifier {
  PrivateCompanyWarehouseProvider(this._api);

  final ApiService _api;

  // ── Snapshot state ─────────────────────────────────────────────────────
  WarehouseDashboard? _dashboard;
  List<WarehouseMaterial> _materials = const [];
  List<WarehouseItem> _items = const [];
  List<WarehouseMovement> _activity = const [];
  List<MaterialRequest> _materialRequests = const [];
  List<Map<String, dynamic>> _staffMaterialBudgetLines = const [];
  Map<String, dynamic>? _keeperTracking;

  WarehouseDashboard? get dashboard => _dashboard;
  List<WarehouseMaterial> get materials => _materials;
  List<WarehouseItem> get items => _items;
  List<WarehouseMovement> get activity => _activity;
  List<MaterialRequest> get materialRequests => _materialRequests;
  List<Map<String, dynamic>> get staffMaterialBudgetLines => _staffMaterialBudgetLines;
  Map<String, dynamic>? get keeperTracking => _keeperTracking;

  // ── UI flags ───────────────────────────────────────────────────────────
  bool _loading = false;
  bool _submitting = false;
  bool _requestsLoading = false;
  String? _error;
  String? _lastSuccess;

  bool get loading => _loading;
  bool get submitting => _submitting;
  bool get requestsLoading => _requestsLoading;
  String? get error => _error;
  String? get lastSuccess => _lastSuccess;

  void clearMessages() {
    _error = null;
    _lastSuccess = null;
    notifyListeners();
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

  // ── Filters applied when refreshing the items list ────────────────────
  String? _filterProvince;
  String? _filterStatus; // api code, e.g. 'IN_WAREHOUSE'
  String? _filterMaterialId;
  String? _filterAssignedToId;
  String? _filterTicketId;
  String _filterQuery = '';
  bool _mineOnly = false;

  String? get filterProvince => _filterProvince;
  String? get filterStatus => _filterStatus;
  String? get filterMaterialId => _filterMaterialId;
  String? get filterAssignedToId => _filterAssignedToId;
  String? get filterTicketId => _filterTicketId;
  String get filterQuery => _filterQuery;
  bool get mineOnly => _mineOnly;

  bool get hasAnyFilter =>
      _filterProvince != null ||
      _filterStatus != null ||
      _filterMaterialId != null ||
      _filterAssignedToId != null ||
      _filterTicketId != null ||
      _filterQuery.isNotEmpty ||
      _mineOnly;

  void setFilters({
    Object? province = _sentinel,
    Object? status = _sentinel,
    Object? materialId = _sentinel,
    Object? assignedToId = _sentinel,
    Object? ticketId = _sentinel,
    String? query,
    bool? mineOnly,
  }) {
    if (province != _sentinel) _filterProvince = province as String?;
    if (status != _sentinel) _filterStatus = status as String?;
    if (materialId != _sentinel) _filterMaterialId = materialId as String?;
    if (assignedToId != _sentinel) _filterAssignedToId = assignedToId as String?;
    if (ticketId != _sentinel) _filterTicketId = ticketId as String?;
    if (query != null) _filterQuery = query;
    if (mineOnly != null) _mineOnly = mineOnly;
    notifyListeners();
  }

  void resetFilters() {
    _filterProvince = null;
    _filterStatus = null;
    _filterMaterialId = null;
    _filterAssignedToId = null;
    _filterTicketId = null;
    _filterQuery = '';
    _mineOnly = false;
    notifyListeners();
  }

  static const Object _sentinel = Object();

  // ── Refreshers ─────────────────────────────────────────────────────────

  Future<void> refreshAll() async {
    _loading = true;
    notifyListeners();
    await Future.wait([
      _loadDashboard(),
      _loadMaterials(),
      _loadItems(),
      _loadActivity(),
      _loadKeeperTracking(),
    ]);
    _loading = false;
    notifyListeners();
  }

  Future<void> _loadDashboard() async {
    try {
      final res = await _api.getSafe(ApiConfig.privateCompanyWarehouseDashboard);
      if (res != null && res['success'] == true) {
        _dashboard = WarehouseDashboard.fromJson(res);
      }
    } catch (_) {
      /* swallow — UI surfaces _error if needed */
    }
  }

  Future<void> _loadMaterials() async {
    try {
      final res = await _api.getSafe(ApiConfig.privateCompanyWarehouseMaterials);
      if (res != null && res['success'] == true) {
        _materials = ((res['materials'] as List?) ?? const [])
            .map((m) => WarehouseMaterial.fromJson(m as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _loadItems() async {
    try {
      final query = <String, String>{};
      if (_filterProvince != null) query['province'] = _filterProvince!;
      if (_filterStatus != null) query['status'] = _filterStatus!;
      if (_filterMaterialId != null) query['materialId'] = _filterMaterialId!;
      if (_filterAssignedToId != null) query['assignedToId'] = _filterAssignedToId!;
      if (_filterTicketId != null) query['ticketId'] = _filterTicketId!;
      if (_filterQuery.trim().isNotEmpty) query['q'] = _filterQuery.trim();
      if (_mineOnly) query['mine'] = '1';
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseItems,
        query: query.isEmpty ? null : query,
      );
      if (res != null && res['success'] == true) {
        _items = ((res['items'] as List?) ?? const [])
            .map((m) => WarehouseItem.fromJson(m as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _loadActivity() async {
    try {
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseActivity,
        query: const {'limit': '120'},
      );
      if (res != null && res['success'] == true) {
        _activity = ((res['movements'] as List?) ?? const [])
            .map((m) => WarehouseMovement.fromJson(m as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _loadKeeperTracking() async {
    try {
      final res = await _api.getSafe(ApiConfig.privateCompanyWarehouseKeeperTracking);
      if (res != null && res['success'] == true) {
        _keeperTracking = Map<String, dynamic>.from(res);
      } else {
        _keeperTracking = null;
      }
    } catch (_) {
      _keeperTracking = null;
    }
  }

  Future<void> refreshDashboard() async {
    await _loadDashboard();
    notifyListeners();
  }

  /// Province breakdown for owners / managers / coordinators / keepers (full inventory scope).
  Future<Map<String, dynamic>?> fetchProvinceInventory(String province) async {
    try {
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseProvinceInventory,
        query: {'province': province},
      );
      if (res != null && res['success'] == true) {
        return Map<String, dynamic>.from(res);
      }
    } catch (_) {}
    return null;
  }

  Future<void> refreshMaterials() async {
    await _loadMaterials();
    notifyListeners();
  }

  Future<void> refreshItems() async {
    await _loadItems();
    notifyListeners();
  }

  Future<void> refreshActivity() async {
    await _loadActivity();
    notifyListeners();
  }

  /// Reloads keeper-tracking payload (full-inventory roles only; no-op data for others).
  Future<void> loadKeeperTracking() async {
    await _loadKeeperTracking();
    notifyListeners();
  }

  // ── Catalog actions ───────────────────────────────────────────────────

  Future<bool> createMaterial({
    required String name,
    String? description,
    String? category,
    String? unit,
    String tracking = 'SERIAL',
    String? color,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyWarehouseMaterials, body: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
        if (category != null && category.trim().isNotEmpty) 'category': category.trim(),
        if (unit != null && unit.trim().isNotEmpty) 'unit': unit.trim(),
        'tracking': tracking,
        if (color != null && color.trim().isNotEmpty) 'color': color.trim(),
      });
      if (res['success'] == true) {
        await _loadMaterials();
        _setSuccess('Material added.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to add material.');
      return false;
    } catch (_) {
      _setError('Network error while adding material.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> updateMaterial(
    String id, {
    String? name,
    String? description,
    String? category,
    String? unit,
    String? tracking,
    String? color,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(ApiConfig.privateCompanyWarehouseMaterials, body: {
        'id': id,
        if (name != null) 'name': name,
        if (description != null) 'description': description,
        if (category != null) 'category': category,
        if (unit != null) 'unit': unit,
        if (tracking != null) 'tracking': tracking,
        if (color != null) 'color': color,
      });
      if (res['success'] == true) {
        await _loadMaterials();
        _setSuccess('Material updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update material.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  /// Bulk stock from an Excel / CSV file (owner or warehouse keeper only).
  Future<Map<String, dynamic>> importMaterialsFromExcel({
    String? filePath,
    List<int>? fileBytes,
    String filename = 'import.xlsx',
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final Map<String, dynamic> res;
      if (filePath != null && filePath.isNotEmpty) {
        res = await _api.postMultipartFile(
          ApiConfig.privateCompanyWarehouseMaterialsImport,
          filePath: filePath,
        );
      } else if (fileBytes != null && fileBytes.isNotEmpty) {
        res = await _api.postMultipartBytes(
          ApiConfig.privateCompanyWarehouseMaterialsImport,
          bytes: fileBytes,
          filename: filename,
        );
      } else {
        _setError('No file selected.');
        return {'success': false};
      }
      if (res['success'] == true) {
        await Future.wait([_loadMaterials(), _loadItems(), _loadDashboard(), _loadActivity()]);
        final n = (res['createdItems'] as num?)?.toInt() ?? 0;
        final errs = (res['errors'] as List?)?.length ?? 0;
        _setSuccess(
          errs > 0
              ? 'Imported $n row(s). Some rows had issues — see server message.'
              : (res['message']?.toString() ?? 'Import finished.'),
        );
        return res;
      }
      _setError(res['message']?.toString() ?? 'Import failed.');
      return res;
    } catch (e) {
      _setError(e.toString());
      return {'success': false, 'message': e.toString()};
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteMaterial(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyWarehouseMaterials,
        query: {'id': id},
      );
      if (res['success'] == true) {
        await _loadMaterials();
        _setSuccess('Material deleted.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to delete material.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  // ── Item actions ──────────────────────────────────────────────────────

  /// Stock new items. For SERIAL materials [serialNumbers] is required; for
  /// BULK materials the server generates a lot code. Returns the number of
  /// items actually created (duplicates are skipped server-side).
  Future<int?> stockItems({
    required String materialId,
    required String province,
    List<String> serialNumbers = const [],
    int? quantity,
    String? notes,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyWarehouseItems, body: {
        'materialId': materialId,
        'province': province,
        if (serialNumbers.isNotEmpty) 'serialNumbers': serialNumbers,
        if (quantity != null) 'quantity': quantity,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      });
      if (res['success'] == true || (res['created'] as num?)?.toInt() != null) {
        final created = (res['created'] as num?)?.toInt() ?? 0;
        final dups = (res['duplicates'] as List?)?.length ?? 0;
        await Future.wait([_loadItems(), _loadDashboard(), _loadMaterials()]);
        _setSuccess(dups > 0
            ? 'Added $created item(s). Skipped $dups duplicate(s).'
            : 'Added $created item(s).');
        return created;
      }
      _setError(res['message']?.toString() ?? 'Failed to stock items.');
      return null;
    } catch (_) {
      _setError('Network error while stocking items.');
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> updateItem(
    String id, {
    String? serialNumber,
    String? province,
    String? notes,
    String? status,
    int? quantity,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(ApiConfig.privateCompanyWarehouseItems, body: {
        'id': id,
        if (serialNumber != null) 'serialNumber': serialNumber,
        if (province != null) 'province': province,
        if (notes != null) 'notes': notes,
        if (status != null) 'status': status,
        if (quantity != null) 'quantity': quantity,
      });
      if (res['success'] == true) {
        await Future.wait([_loadItems(), _loadActivity()]);
        _setSuccess('Item updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to update item.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteItem(String id) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyWarehouseItems,
        query: {'id': id},
      );
      if (res['success'] == true) {
        await Future.wait([_loadItems(), _loadDashboard(), _loadActivity()]);
        _setSuccess(res['retired'] == true ? 'Item retired.' : 'Item removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to remove item.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> _itemAction(
    String id,
    String action, {
    Map<String, dynamic> body = const {},
    String? successMessage,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(
        ApiConfig.privateCompanyWarehouseItemDetail(id),
        body: {'action': action, ...body},
      );
      if (res['success'] == true) {
        await Future.wait([_loadItems(), _loadDashboard(), _loadActivity()]);
        if (successMessage != null) _setSuccess(successMessage);
        return true;
      }
      _setError(res['message']?.toString() ?? 'Action failed.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> assignItem(String id, String toStaffId, {String? note, int? quantity}) =>
      _itemAction(id, 'assign',
          body: {
            'toStaffId': toStaffId,
            if (note != null) 'note': note,
            if (quantity != null) 'quantity': quantity,
          },
          successMessage: 'Item assigned.');

  Future<bool> transferItem(String id, String toStaffId, {String? note, int? quantity}) =>
      _itemAction(id, 'transfer',
          body: {
            'toStaffId': toStaffId,
            if (note != null) 'note': note,
            if (quantity != null) 'quantity': quantity,
          },
          successMessage: 'Item transferred.');

  Future<bool> returnItem(
    String id, {
    String? note,
    String returnCondition = 'new_good',
  }) =>
      _itemAction(
        id,
        'return',
        body: {
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          'returnCondition': returnCondition,
        },
        successMessage: 'Item returned to warehouse.',
      );

  Future<bool> confirmAssigneeHandover(String id, {String? note}) =>
      _itemAction(
        id,
        'confirm-handover',
        body: {if (note != null && note.trim().isNotEmpty) 'note': note.trim()},
        successMessage: 'Receipt confirmed.',
      );

  Future<bool> useOnTicket(String id, String ticketId,
          {String? note, String? useReason, int? quantity}) =>
      _itemAction(id, 'use',
          body: {
            'ticketId': ticketId,
            if (note != null) 'note': note,
            if (useReason != null && useReason.trim().isNotEmpty) 'useReason': useReason.trim(),
            if (quantity != null) 'quantity': quantity,
          },
          successMessage: 'Recorded on ticket.');

  Future<List<HeldMaterialPool>> fetchMyHeldMaterials() async {
    try {
      final res = await _api.getSafe(ApiConfig.privateCompanyWarehouseMyHeldMaterials);
      if (res != null && res['success'] == true) {
        return ((res['materials'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HeldMaterialPool.fromJson)
            .toList();
      }
    } catch (_) {
      /* non-fatal */
    }
    return const [];
  }

  Future<bool> consumeMaterialOnTicket({
    required String materialId,
    required String ticketId,
    required int quantity,
    String? note,
    String? useReason,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(
        ApiConfig.privateCompanyWarehouseConsumeOnTicket,
        body: {
          'materialId': materialId,
          'ticketId': ticketId,
          'quantity': quantity,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          if (useReason != null && useReason.trim().isNotEmpty) 'useReason': useReason.trim(),
        },
      );
      if (res['success'] == true) {
        final msg = res['message']?.toString();
        await Future.wait([_loadItems(), _loadDashboard(), _loadActivity()]);
        _setSuccess(msg ?? 'Material use recorded.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Could not record use.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> markDamaged(String id, {String? note, String? ticketId, String? useReason}) =>
      _itemAction(id, 'damage',
          body: {
            if (note != null) 'note': note,
            if (useReason != null && useReason.trim().isNotEmpty) 'useReason': useReason.trim(),
            if (ticketId != null && ticketId.trim().isNotEmpty) 'ticketId': ticketId.trim(),
          },
          successMessage: 'Marked damaged.');

  Future<bool> markLost(String id, {String? note, String? ticketId, String? useReason}) =>
      _itemAction(id, 'lose',
          body: {
            if (note != null) 'note': note,
            if (useReason != null && useReason.trim().isNotEmpty) 'useReason': useReason.trim(),
            if (ticketId != null && ticketId.trim().isNotEmpty) 'ticketId': ticketId.trim(),
          },
          successMessage: 'Marked lost.');

  /// Units currently in the warehouse for this catalog material (uses the
  /// in-memory items list, so it matches the active Inventory filters).
  int countInWarehouseForMaterial(String materialId) {
    return items
        .where(
          (i) =>
              i.materialId == materialId &&
              i.status == MaterialItemStatus.inWarehouse,
        )
        .fold<int>(0, (sum, i) => sum + i.quantity);
  }

  Future<List<WarehouseStaffSearchResult>> searchStaff(String q) async {
    final t = q.trim();
    if (t.length < 2) return const [];
    try {
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseStaffSearch,
        query: {'q': t},
      );
      if (res != null && res['success'] == true) {
        return ((res['staff'] as List?) ?? const [])
            .map((e) => WarehouseStaffSearchResult.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return const [];
    } catch (_) {
      return const [];
    }
  }

  Future<void> refreshMaterialRequests(String scope) async {
    _requestsLoading = true;
    notifyListeners();
    try {
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseRequests,
        query: {'scope': scope},
      );
      if (res != null && res['success'] == true) {
        _materialRequests = ((res['requests'] as List?) ?? const [])
            .map((e) => MaterialRequest.fromJson(e as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {
      /* non-fatal */
    } finally {
      _requestsLoading = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> fetchTicketMaterialSummary(String ticketId) async {
    try {
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseTicketMaterialSummary,
        query: {'ticketId': ticketId},
      );
      if (res != null && res['success'] == true) {
        return Map<String, dynamic>.from(res);
      }
    } catch (_) {
      /* non-fatal */
    }
    return null;
  }

  Future<void> loadStaffMaterialBudgets({String? staffId}) async {
    try {
      final query = <String, String>{};
      if (staffId != null && staffId.isNotEmpty) query['staffId'] = staffId;
      final res = await _api.getSafe(
        ApiConfig.privateCompanyWarehouseStaffMaterialBudgets,
        query: query.isEmpty ? null : query,
      );
      if (res != null && res['success'] == true) {
        _staffMaterialBudgetLines = ((res['budgets'] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        notifyListeners();
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  Future<bool> saveStaffMaterialBudget({
    required String staffId,
    required String materialId,
    required int budgetQuantity,
    String? notes,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.post(ApiConfig.privateCompanyWarehouseStaffMaterialBudgets, body: {
        'staffId': staffId,
        'materialId': materialId,
        'budgetQuantity': budgetQuantity,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      });
      if (res['success'] == true) {
        await loadStaffMaterialBudgets(staffId: staffId);
        _setSuccess('Budget saved.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Failed to save budget.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> deleteStaffMaterialBudget(String budgetId, {required String staffId}) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.delete(
        ApiConfig.privateCompanyWarehouseStaffMaterialBudgets,
        query: {'id': budgetId},
      );
      if (res['success'] == true) {
        await loadStaffMaterialBudgets(staffId: staffId);
        _setSuccess('Budget removed.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Delete failed.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> rejectAssigneeHandover(String id, {required String rejectionReason}) =>
      _itemAction(
        id,
        'reject-handover',
        body: {'rejectionReason': rejectionReason.trim()},
        successMessage: 'Assignment rejected. Warehouse has been notified.',
      );

  Future<bool> requestReturnFromAssignee(String id, {String? note}) =>
      _itemAction(
        id,
        'request-return',
        body: {if (note != null && note.trim().isNotEmpty) 'note': note.trim()},
        successMessage: 'Return request sent to assignee.',
      );

  Future<bool> approveReturnRequest(
    String id, {
    String? note,
    String returnCondition = 'new_good',
  }) =>
      _itemAction(
        id,
        'approve-return',
        body: {
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          'returnCondition': returnCondition,
        },
        successMessage: 'Return approved — item back in warehouse.',
      );

  Future<bool> rejectReturnRequest(String id, {required String rejectionReason}) =>
      _itemAction(
        id,
        'reject-return',
        body: {'rejectionReason': rejectionReason.trim()},
        successMessage: 'Return request rejected.',
      );

  Future<bool> createMaterialRequest({
    required String kind,
    String? materialId,
    String? customTitle,
    String? customDescription,
    int quantity = 1,
    String? province,
    String? notes,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final body = <String, dynamic>{
        'kind': kind,
        'quantity': quantity,
        if (province != null && province.trim().isNotEmpty) 'province': province.trim(),
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        if (materialId != null) 'materialId': materialId,
        if (customTitle != null) 'customTitle': customTitle,
        if (customDescription != null) 'customDescription': customDescription,
      };
      final res = await _api.post(ApiConfig.privateCompanyWarehouseRequests, body: body);
      if (res['success'] == true) {
        _setSuccess(res['message']?.toString() ?? 'Request submitted.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Could not submit request.');
      return false;
    } catch (_) {
      _setError('Network error while submitting request.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> patchMaterialRequest(
    String id, {
    required String action,
    String? responseNote,
    String? fulfilledItemId,
    String? receivedNote,
    String? message,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      final res = await _api.patch(
        ApiConfig.privateCompanyWarehouseRequestDetail(id),
        body: {
          'action': action,
          if (responseNote != null && responseNote.trim().isNotEmpty)
            'responseNote': responseNote.trim(),
          if (fulfilledItemId != null && fulfilledItemId.trim().isNotEmpty)
            'fulfilledItemId': fulfilledItemId.trim(),
          if (receivedNote != null && receivedNote.trim().isNotEmpty)
            'receivedNote': receivedNote.trim(),
          if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
        },
      );
      if (res['success'] == true) {
        _setSuccess(res['message']?.toString() ?? 'Request updated.');
        return true;
      }
      _setError(res['message']?.toString() ?? 'Update failed.');
      return false;
    } catch (_) {
      _setError('Network error.');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  void reset() {
    _dashboard = null;
    _materials = const [];
    _items = const [];
    _activity = const [];
    _materialRequests = const [];
    _staffMaterialBudgetLines = const [];
    _keeperTracking = null;
    resetFilters();
    _error = null;
    _lastSuccess = null;
    notifyListeners();
  }
}
