import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import '../models/ticket.dart';
import '../services/api_service.dart';

class ProvisorTechniqueItem {
  ProvisorTechniqueItem({
    required this.slug,
    required this.labelAr,
    this.labelEn,
  });

  factory ProvisorTechniqueItem.fromJson(Map<String, dynamic> json) {
    return ProvisorTechniqueItem(
      slug: json['slug'] as String,
      labelAr: json['labelAr'] as String? ?? '',
      labelEn: json['labelEn'] as String?,
    );
  }

  final String slug;
  final String labelAr;
  final String? labelEn;

  /// Display label for dropdowns (Arabic/Kurdish use server Arabic label).
  String labelForLocale(String languageCode) {
    final lc = languageCode.toLowerCase();
    if (lc.startsWith('ar') || lc.startsWith('ku')) return labelAr;
    final en = labelEn;
    if (en != null && en.isNotEmpty) return en;
    return labelAr;
  }
}

/// QC inspection + maintenance technique lists from `GET /api/provisor-techniques`.
class ProvisorTechniquesProvider extends ChangeNotifier {
  ProvisorTechniquesProvider(this._api);

  final ApiService _api;

  List<ProvisorTechniqueItem> _inspection = [];
  List<ProvisorTechniqueItem> _maintenance = [];
  bool _loading = false;
  bool _loaded = false;

  List<ProvisorTechniqueItem> get inspection => _inspection;
  List<ProvisorTechniqueItem> get maintenance => _maintenance;

  Future<void> fetch() async => _load();

  Future<void> ensureLoaded() async {
    if (_loaded && !_loading) return;
    await _load();
  }

  Future<void> _load() async {
    _loading = true;
    notifyListeners();
    try {
      final data = await _api.get(ApiConfig.provisorTechniques);
      if (data['success'] == true) {
        _inspection = (data['inspection'] as List? ?? [])
            .map((e) => ProvisorTechniqueItem.fromJson(
                  e as Map<String, dynamic>,
                ))
            .toList();
        _maintenance = (data['maintenance'] as List? ?? [])
            .map((e) => ProvisorTechniqueItem.fromJson(
                  e as Map<String, dynamic>,
                ))
            .toList();
        Ticket.maintenanceSlugs = _maintenance.isEmpty
            ? List<String>.from(Ticket.maintenanceTechniques)
            : _maintenance.map((e) => e.slug).toList();
        _loaded = true;
      }
    } catch (_) {
      /* keep defaults */
    }
    _loading = false;
    notifyListeners();
  }
}
