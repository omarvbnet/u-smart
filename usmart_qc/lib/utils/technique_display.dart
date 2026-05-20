import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import '../providers/provisor_techniques_provider.dart';

/// Whether a ticket technique slug counts as maintenance (incl. department routing).
bool techniqueSlugIsMaintenance(String technique) => Ticket.slugIsMaintenance(technique);

String _maintenanceLabelKey(String technique) {
  final lower = technique.toLowerCase();
  if (lower == 'fiber_route') return 'maint_fiber_route';
  if (lower == 'fiber_site') return 'maint_fiber_site';
  if (lower == 'electrical') return 'maint_electrical';
  if (lower == 'telecom') return 'maint_telecom';
  if (lower == 'ftth') return 'maint_ftth';
  return 'maint_technique_maintenance';
}

String _inspectionLabelKey(String technique) {
  final upper = technique.toUpperCase().replaceAll(' ', '_');
  if (upper.contains('INSPECTION')) return 'tech_inspection';
  if (upper.contains('SUPERVISION')) return 'tech_supervision';
  if (upper.contains('BUILDING')) return 'tech_building';
  if (upper.contains('HSE')) return 'tech_hse';
  if (upper.contains('INVESTIGATION')) return 'tech_investigation';
  if (upper.contains('TRACKING')) return 'tech_tracking';
  if (upper.startsWith('PC_DEPT_QC_')) return 'tech_inspection';
  return 'tech_inspection';
}

/// Localized technique label for ticket cards and detail screens.
String techniqueDisplayLabel({
  required String technique,
  required AppLocalizations l10n,
  ProvisorTechniquesProvider? techniques,
  bool? isMaintenance,
}) {
  final slug = technique.trim();
  final maint = isMaintenance ?? techniqueSlugIsMaintenance(slug);
  final lc = l10n.locale.languageCode;

  if (techniques != null) {
    final list = maint ? techniques.maintenance : techniques.inspection;
    for (final item in list) {
      if (item.slug.toLowerCase() == slug.toLowerCase()) {
        return item.labelForLocale(lc);
      }
    }
  }

  return l10n.t(maint ? _maintenanceLabelKey(slug) : _inspectionLabelKey(slug));
}
