import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/provisor_techniques_provider.dart';

const _serviceBlurb = <String, Map<String, String>>{
  'inspection': {
    'en': 'On-site quality inspection with checklists, evidence photos, and a clear pass/fail report.',
    'ar': 'فحص جودة في الموقع مع قوائم تحقق وصور أدلة وتقرير واضح بالنتيجة.',
  },
  'supervision': {
    'en': 'Field supervision so work follows approved drawings, safety rules, and schedule.',
    'ar': 'إشراف ميداني لضمان تنفيذ العمل حسب المخططات المعتمدة والسلامة والجدول.',
  },
  'building': {
    'en': 'Building / civil QC covering structure finishing and compliance checks.',
    'ar': 'مراقبة جودة المباني والأعمال المدنية وتشطيبات والامتثال.',
  },
  'hse': {
    'en': 'Health, safety & environment audits with corrective actions tracking.',
    'ar': 'تدقيق صحة وسلامة وبيئة مع متابعة الإجراءات التصحيحية.',
  },
  'investigation': {
    'en': 'Incident or quality investigation with findings and recommended actions.',
    'ar': 'تحقيق في حادثة أو مشكلة جودة مع نتائج وتوصيات.',
  },
  'tracking': {
    'en': 'Progress tracking visits to verify milestones and remaining work.',
    'ar': 'زيارات تتبع تقدم العمل للتحقق من المراحل والمتبقي.',
  },
  'fiber_route': {
    'en': 'Fiber route maintenance — splice, OTDR, and path restoration support.',
    'ar': 'صيانة مسار فايبر — لحام وOTDR وإعادة المسار.',
  },
  'fiber_site': {
    'en': 'Fiber site / ODF / cabinet maintenance and acceptance checks.',
    'ar': 'صيانة مواقع فايبر وخزائن ODF وفحص الاستلام.',
  },
  'electrical': {
    'en': 'Electrical maintenance and inspection for panels, cabling, and power quality.',
    'ar': 'صيانة وفحص كهرباء للوحات والكابلات وجودة التغذية.',
  },
  'telecom': {
    'en': 'Telecom infrastructure maintenance and QC for active/passive equipment.',
    'ar': 'صيانة ومراقبة جودة معدات الاتصالات النشطة والسلبية.',
  },
  'ftth': {
    'en': 'FTTH last-mile installation QC and troubleshooting.',
    'ar': 'مراقبة جودة وتركيب وصيانة FTTH للعميل النهائي.',
  },
};

String serviceBlurbFor(String slug, String languageCode) {
  final entry = _serviceBlurb[slug];
  if (entry == null) {
    return languageCode.startsWith('ar') || languageCode.startsWith('ku')
        ? 'خدمة Proviser — اضغط للتفاصيل وتأكيد فتح تذكرة جديدة.'
        : 'A Proviser service — tap for details and confirm opening a new ticket.';
  }
  final ar = languageCode.startsWith('ar') || languageCode.startsWith('ku');
  return ar ? entry['ar']! : entry['en']!;
}

IconData iconForService(String slug, {required bool maintenance}) {
  switch (slug) {
    case 'supervision':
      return Icons.visibility_rounded;
    case 'building':
      return Icons.apartment_rounded;
    case 'hse':
      return Icons.health_and_safety_rounded;
    case 'investigation':
      return Icons.search_rounded;
    case 'tracking':
      return Icons.timeline_rounded;
    case 'fiber_route':
    case 'fiber_site':
    case 'ftth':
      return Icons.cable_rounded;
    case 'electrical':
      return Icons.bolt_rounded;
    case 'telecom':
      return Icons.cell_tower_rounded;
    default:
      return maintenance ? Icons.build_circle_rounded : Icons.fact_check_rounded;
  }
}

class UAgentServiceCards extends StatelessWidget {
  const UAgentServiceCards({
    super.key,
    required this.techniques,
    required this.greeting,
    required this.onSelect,
  });

  final ProvisorTechniquesProvider techniques;
  final String greeting;
  final void Function(ProvisorTechniqueItem item, {required bool maintenance}) onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final inspection = techniques.inspection;
    final maintenance = techniques.maintenance;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        const SizedBox(height: 8),
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: [Color(0xFF0B6E4F), Color(0xFF1B9AAA)]),
            ),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 30),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          greeting,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        Text(
          l10n.t('u_agent_services_hint'),
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white54, fontSize: 13, height: 1.35),
        ),
        const SizedBox(height: 22),
        if (inspection.isNotEmpty) ...[
          _sectionLabel(l10n.t('u_agent_services_qc')),
          const SizedBox(height: 10),
          ...inspection.map((item) => _ServiceCard(
                item: item,
                maintenance: false,
                languageCode: lang,
                onTap: () => onSelect(item, maintenance: false),
              )),
        ],
        if (maintenance.isNotEmpty) ...[
          const SizedBox(height: 8),
          _sectionLabel(l10n.t('u_agent_services_maint')),
          const SizedBox(height: 10),
          ...maintenance.map((item) => _ServiceCard(
                item: item,
                maintenance: true,
                languageCode: lang,
                onTap: () => onSelect(item, maintenance: true),
              )),
        ],
        if (inspection.isEmpty && maintenance.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: Text(
              l10n.t('u_agent_overlay_hint'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white54),
            ),
          ),
      ],
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFF7DDBBE),
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.item,
    required this.maintenance,
    required this.languageCode,
    required this.onTap,
  });

  final ProvisorTechniqueItem item;
  final bool maintenance;
  final String languageCode;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = item.labelForLocale(languageCode);
    final blurb = serviceBlurbFor(item.slug, languageCode);
    final colors = maintenance
        ? const [Color(0xFF1A3A4A), Color(0xFF0F2A35)]
        : const [Color(0xFF143D32), Color(0xFF0C2A22)];
    final accent = maintenance ? const Color(0xFF4FC3F7) : const Color(0xFF2EC4B6);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: colors,
              ),
              border: Border.all(color: accent.withAlpha(70)),
              boxShadow: [
                BoxShadow(
                  color: accent.withAlpha(28),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: accent.withAlpha(36),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(iconForService(item.slug, maintenance: maintenance), color: accent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          blurb,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.35),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.arrow_forward_ios_rounded, size: 14, color: accent.withAlpha(200)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showServiceConfirmSheet({
  required BuildContext context,
  required ProvisorTechniqueItem item,
  required bool maintenance,
  required VoidCallback onConfirm,
}) async {
  final l10n = AppLocalizations.of(context);
  final lang = Localizations.localeOf(context).languageCode;
  final label = item.labelForLocale(lang);
  final blurb = serviceBlurbFor(item.slug, lang);
  final accent = maintenance ? const Color(0xFF4FC3F7) : const Color(0xFF2EC4B6);

  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xFF1C1C1E),
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: accent.withAlpha(40),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(iconForService(item.slug, maintenance: maintenance), color: accent, size: 28),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(blurb, style: const TextStyle(color: Colors.white70, height: 1.45, fontSize: 14)),
            const SizedBox(height: 10),
            Text(
              l10n.t('u_agent_service_confirm_hint'),
              style: const TextStyle(color: Colors.white54, fontSize: 12, height: 1.35),
            ),
            const SizedBox(height: 18),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: const Color(0xFF062018),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () {
                Navigator.pop(ctx);
                onConfirm();
              },
              child: Text(
                l10n.t('u_agent_confirm_open_ticket'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(l10n.t('u_agent_cancel'), style: const TextStyle(color: Colors.white60)),
            ),
          ],
        ),
      );
    },
  );
}
