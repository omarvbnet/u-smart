import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';

/// Compact site row for dashboard Sites tabs.
class SiteListCard extends StatelessWidget {
  const SiteListCard({
    super.key,
    required this.site,
    required this.l10n,
    required this.onTap,
    required this.onCreateTicket,
    this.onOpenMap,
    this.onEdit,
    this.onDelete,
    this.onShare,
    this.onViewShared,
    this.onRemoveShare,
    this.formatDate,
    this.formatHours,
  });

  final Site site;
  final AppLocalizations l10n;
  final VoidCallback onTap;
  final VoidCallback onCreateTicket;
  final VoidCallback? onOpenMap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onShare;
  final VoidCallback? onViewShared;
  final VoidCallback? onRemoveShare;
  final String Function(DateTime)? formatDate;
  final String Function(double)? formatHours;

  String? get _addedByLabel {
    if (site.createdByName != null && site.createdByName!.trim().isNotEmpty) {
      return site.createdByName!.trim();
    }
    if (site.sharedWithMe &&
        site.ownerUsername != null &&
        site.ownerUsername!.trim().isNotEmpty) {
      return site.ownerUsername!.trim();
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final addedBy = _addedByLabel;
    final fmtH = formatHours ?? _fmtHours;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
          decoration: BoxDecoration(
            color: const Color(0xFF141428),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withAlpha(18)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: site.isWorkspace
                        ? [
                            const Color(0xFF6C63FF).withAlpha(70),
                            const Color(0xFF00D4AA).withAlpha(40),
                          ]
                        : [
                            const Color(0xFF6C63FF).withAlpha(45),
                            const Color(0xFF1A1A35),
                          ],
                  ),
                ),
                child: Icon(
                  site.canOpenQFieldMap ? Icons.map_rounded : Icons.location_on_rounded,
                  color: site.canOpenQFieldMap
                      ? const Color(0xFF00D4AA)
                      : const Color(0xFF8B83FF),
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            site.siteId,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ),
                        if (site.isWorkspace) ...[
                          const SizedBox(width: 6),
                          _Chip(
                            label: l10n.t('pc_ws_tab_sites'),
                            color: const Color(0xFF6C63FF),
                          ),
                        ],
                        if (site.isWorkspacePending) ...[
                          const SizedBox(width: 4),
                          _Chip(
                            label: l10n.t('pc_site_pending'),
                            color: const Color(0xFFFF9F43),
                          ),
                        ],
                        if (site.canOpenQFieldMap) ...[
                          const SizedBox(width: 4),
                          _Chip(
                            label: 'QField',
                            color: const Color(0xFF00D4AA),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${site.location} · ${site.province}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withAlpha(130),
                        fontSize: 11,
                        height: 1.25,
                      ),
                    ),
                    if (addedBy != null) ...[
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Icon(
                            Icons.person_outline_rounded,
                            size: 12,
                            color: Colors.white.withAlpha(100),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              l10n.t('site_added_by', {'name': addedBy}),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withAlpha(110),
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      runSpacing: 2,
                      children: [
                        _Meta(
                          icon: Icons.fact_check_outlined,
                          text: l10n.t('site_row_inspection', {
                            'n': '${site.inspectionQcCount}',
                            'h': fmtH(site.inspectionHoursTotal),
                          }),
                        ),
                        _Meta(
                          icon: Icons.build_outlined,
                          text: l10n.t('site_row_maintenance', {
                            'n': '${site.maintenanceQcCount}',
                            'h': fmtH(site.maintenanceHoursTotal),
                          }),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _IconBtn(
                    icon: Icons.note_add_outlined,
                    color: const Color(0xFF00D4AA),
                    tooltip: l10n.t('site_create_ticket_here'),
                    onPressed: onCreateTicket,
                  ),
                  if (site.canOpenQFieldMap && onOpenMap != null)
                    _IconBtn(
                      icon: Icons.map_rounded,
                      color: const Color(0xFF6C63FF),
                      tooltip: l10n.t('pc_site_view_qfield_map'),
                      onPressed: onOpenMap!,
                    ),
                  if (onEdit != null)
                    _IconBtn(
                      icon: Icons.edit_rounded,
                      color: const Color(0xFF6C63FF),
                      tooltip: l10n.t('site_edit'),
                      onPressed: onEdit!,
                    ),
                  if (onDelete != null)
                    _IconBtn(
                      icon: Icons.delete_outline_rounded,
                      color: const Color(0xFFFF4757),
                      tooltip: l10n.t('site_delete'),
                      onPressed: onDelete!,
                    ),
                  if (onShare != null)
                    _IconBtn(
                      icon: Icons.person_add_alt_1_rounded,
                      color: const Color(0xFF00D4AA),
                      tooltip: l10n.t('site_share_title'),
                      onPressed: onShare!,
                    ),
                  if (onViewShared != null)
                    _IconBtn(
                      icon: Icons.visibility_rounded,
                      color: const Color(0xFF6C63FF),
                      tooltip: l10n.t('site_view_shared'),
                      onPressed: onViewShared!,
                    ),
                  if (onRemoveShare != null)
                    _IconBtn(
                      icon: Icons.link_off_rounded,
                      color: const Color(0xFFFFA502),
                      tooltip: l10n.t('site_remove_share'),
                      onPressed: onRemoveShare!,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _fmtHours(double h) {
    if (h <= 0) return '0';
    return h < 1 ? h.toStringAsFixed(2) : h.toStringAsFixed(1);
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(35),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withAlpha(100)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: Colors.white.withAlpha(80)),
        const SizedBox(width: 3),
        Text(
          text,
          style: TextStyle(color: Colors.white.withAlpha(75), fontSize: 10),
        ),
      ],
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({
    required this.icon,
    required this.color,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: 34,
      child: IconButton(
        onPressed: onPressed,
        icon: Icon(icon, color: color, size: 18),
        tooltip: tooltip,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(),
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}
