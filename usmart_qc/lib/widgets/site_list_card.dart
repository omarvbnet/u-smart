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
    this.onCreateMaintenanceTicket,
    this.onOpenMap,
    this.onEdit,
    this.onDelete,
    this.onShare,
    this.onViewShared,
    this.onRemoveShare,
    this.formatHours,
  });

  final Site site;
  final AppLocalizations l10n;
  final VoidCallback onTap;
  final VoidCallback onCreateTicket;
  final VoidCallback? onCreateMaintenanceTicket;
  final VoidCallback? onOpenMap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onShare;
  final VoidCallback? onViewShared;
  final VoidCallback? onRemoveShare;
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

  List<Widget> _actionButtons() {
    final actions = <Widget>[
      _ActionChip(
        icon: Icons.note_add_outlined,
        label: l10n.t('site_create_ticket_here'),
        color: const Color(0xFF00D4AA),
        onPressed: onCreateTicket,
      ),
    ];
    if (onCreateMaintenanceTicket != null) {
      actions.add(
        _ActionChip(
          icon: Icons.handyman_outlined,
          label: l10n.t('site_create_maintenance_here'),
          color: const Color(0xFFFF9F43),
          onPressed: onCreateMaintenanceTicket!,
        ),
      );
    }
    if (site.canOpenQFieldMap && onOpenMap != null) {
      actions.add(
        _ActionChip(
          icon: Icons.map_rounded,
          label: l10n.t('pc_site_view_qfield_map'),
          color: const Color(0xFF6C63FF),
          onPressed: onOpenMap!,
        ),
      );
    }
    if (onEdit != null) {
      actions.add(
        _ActionChip(
          icon: Icons.edit_rounded,
          label: l10n.t('site_edit'),
          color: const Color(0xFF6C63FF),
          onPressed: onEdit!,
        ),
      );
    }
    if (onDelete != null) {
      actions.add(
        _ActionChip(
          icon: Icons.delete_outline_rounded,
          label: l10n.t('site_delete'),
          color: const Color(0xFFFF4757),
          onPressed: onDelete!,
        ),
      );
    }
    if (onShare != null) {
      actions.add(
        _ActionChip(
          icon: Icons.person_add_alt_1_rounded,
          label: l10n.t('site_share_title'),
          color: const Color(0xFF00D4AA),
          onPressed: onShare!,
        ),
      );
    }
    if (onViewShared != null) {
      actions.add(
        _ActionChip(
          icon: Icons.visibility_rounded,
          label: l10n.t('site_view_shared'),
          color: const Color(0xFF6C63FF),
          onPressed: onViewShared!,
        ),
      );
    }
    if (onRemoveShare != null) {
      actions.add(
        _ActionChip(
          icon: Icons.link_off_rounded,
          label: l10n.t('site_remove_share'),
          color: const Color(0xFFFFA502),
          onPressed: onRemoveShare!,
        ),
      );
    }
    return actions;
  }

  @override
  Widget build(BuildContext context) {
    final addedBy = _addedByLabel;
    final fmtH = formatHours ?? _fmtHours;
    final actions = _actionButtons();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF141428),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withAlpha(18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
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
                        site.canOpenQFieldMap
                            ? Icons.map_rounded
                            : Icons.location_on_rounded,
                        color: site.canOpenQFieldMap
                            ? const Color(0xFF00D4AA)
                            : const Color(0xFF8B83FF),
                        size: 19,
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
                                  ),
                                ),
                              ),
                              if (site.hasDesignDocuments)
                                _Tag(
                                  label: l10n.t('site_design_docs_count',
                                      {'count': '${site.designDocuments.length}'}),
                                  color: const Color(0xFFFF6B6B),
                                ),
                              if (site.isWorkspace)
                                _Tag(
                                  label: l10n.t('pc_ws_tab_sites'),
                                  color: const Color(0xFF6C63FF),
                                ),
                              if (site.isWorkspacePending) ...[
                                const SizedBox(width: 4),
                                _Tag(
                                  label: l10n.t('pc_site_pending'),
                                  color: const Color(0xFFFF9F43),
                                ),
                              ],
                              if (site.canOpenQFieldMap) ...[
                                const SizedBox(width: 4),
                                _Tag(label: 'QField', color: const Color(0xFF00D4AA)),
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
                            ),
                          ),
                          if (site.hasCoordinates) ...[
                            const SizedBox(height: 2),
                            Text(
                              '${site.latitude!.toStringAsFixed(5)}, ${site.longitude!.toStringAsFixed(5)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: const Color(0xFF6C63FF).withAlpha(200),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          if (addedBy != null) ...[
                            const SizedBox(height: 3),
                            Text(
                              l10n.t('site_added_by', {'name': addedBy}),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withAlpha(110),
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          Text(
                            '${l10n.t('site_row_inspection', {
                              'n': '${site.inspectionQcCount}',
                              'h': fmtH(site.inspectionHoursTotal),
                            })} · ${l10n.t('site_row_maintenance', {
                              'n': '${site.maintenanceQcCount}',
                              'h': fmtH(site.maintenanceHoursTotal),
                            })}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withAlpha(72),
                              fontSize: 10,
                              height: 1.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: Colors.white.withAlpha(14)),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                child: Row(
                  children: [
                    for (var i = 0; i < actions.length; i++) ...[
                      if (i > 0) const SizedBox(width: 6),
                      actions[i],
                    ],
                  ],
                ),
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

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
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
        style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withAlpha(28),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
