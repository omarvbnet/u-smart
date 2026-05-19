import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/private_company_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/workspace_sites_provider.dart';
import '../utils/site_qfield_map.dart';
import '../screens/ticket_detail_screen.dart';
import 'workspace_site_form_sheet.dart';

String workspaceSiteFilterLabel(AppLocalizations l10n, String f) {
  switch (f) {
    case 'inspection':
      return l10n.t('pc_site_inspection');
    case 'maintenance':
      return l10n.t('pc_site_maintenance');
    default:
      return l10n.t('pc_site_filter_all');
  }
}

/// Workspace site detail + related tickets (all staff).
Future<void> showWorkspaceSiteDetailSheet(
  BuildContext context,
  String siteId, {
  String ticketFilter = 'all',
}) async {
  final l10n = AppLocalizations.of(context);
  final provider = context.read<WorkspaceSitesProvider>();
  var filter = ticketFilter;
  final initial = await provider.loadSiteDetail(siteId, filter: filter);
  if (!context.mounted || initial == null) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF12122A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.4,
        maxChildSize: 0.92,
        builder: (_, scroll) {
          return StatefulBuilder(
            builder: (context, setModalState) {
              var currentSite = initial.site;
              var tickets = initial.tickets;

              Future<void> reloadTickets(String f) async {
                final r = await provider.loadSiteDetail(siteId, filter: f);
                if (r != null) {
                  setModalState(() {
                    filter = f;
                    currentSite = r.site;
                    tickets = r.tickets;
                  });
                }
              }

              final s = currentSite;
              final pc = context.read<PrivateCompanyProvider>();
              return ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          s.siteCode,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (s.isPending)
                        _WsStatusChip(
                          label: l10n.t('pc_site_pending'),
                          color: const Color(0xFFFF9F43),
                        )
                      else if (s.isConfirmed)
                        _WsStatusChip(
                          label: l10n.t('pc_site_confirmed'),
                          color: const Color(0xFF00D4AA),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${s.location} · ${s.province}',
                    style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _WsCountChip(
                        label: l10n.t('pc_site_inspection'),
                        count: s.inspectionQcCount,
                        color: const Color(0xFF38BDF8),
                      ),
                      _WsCountChip(
                        label: l10n.t('pc_site_maintenance'),
                        count: s.maintenanceQcCount,
                        color: const Color(0xFFFF9F43),
                      ),
                    ],
                  ),
                    if (s.hasQfield && s.qfieldProjects.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          final site = Site.fromWorkspaceJson({
                            'id': s.id,
                            'siteCode': s.siteCode,
                            'location': s.location,
                            'province': s.province,
                            'hasQfield': s.hasQfield,
                            'qfieldProjects': s.qfieldProjects
                                .map((p) => {
                                      'id': p.id,
                                      'title': p.title,
                                      'currentUrl': p.currentUrl,
                                      'fileName': p.fileName,
                                      'createdAt': p.createdAt,
                                      'updatedAt': p.updatedAt,
                                    })
                                .toList(),
                            'createdByName': s.createdByName,
                          });
                          openSiteQFieldMap(
                            context,
                            site,
                            onSaved: () => provider.fetchSites(),
                          );
                        },
                      icon: const Icon(Icons.map_rounded, size: 18),
                      label: Text(l10n.t('pc_site_view_qfield_map')),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF6C63FF),
                        side: BorderSide(color: Colors.white.withAlpha(40)),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    l10n.t('pc_site_related_tickets'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final f in ['all', 'inspection', 'maintenance'])
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(workspaceSiteFilterLabel(l10n, f)),
                              selected: filter == f,
                              onSelected: (_) => reloadTickets(f),
                              selectedColor: const Color(0xFF6C63FF).withAlpha(90),
                              labelStyle: TextStyle(
                                color: filter == f ? Colors.white : Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (tickets.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        l10n.t('pc_site_no_tickets'),
                        style: TextStyle(color: Colors.white.withAlpha(140)),
                      ),
                    )
                  else
                    ...tickets.map(
                      (t) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          t.title.isNotEmpty ? t.title : t.technique ?? t.id,
                          style: const TextStyle(color: Colors.white, fontSize: 14),
                        ),
                        subtitle: Text(
                          '${t.status} · ${t.isMaintenance ? l10n.t('pc_site_maintenance') : l10n.t('pc_site_inspection')}',
                          style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
                        onTap: () {
                          Navigator.pop(ctx);
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TicketDetailScreen(ticketId: t.id),
                            ),
                          );
                        },
                      ),
                    ),
                  if (s.canManage) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              showWorkspaceSiteFormSheet(
                                context,
                                site: s,
                                directEdit: true,
                                proposeOnly: false,
                              );
                            },
                            icon: const Icon(Icons.edit_rounded),
                            label: Text(l10n.t('site_edit')),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (dCtx) => AlertDialog(
                                  backgroundColor: const Color(0xFF12122A),
                                  title: Text(
                                    l10n.t('site_delete_confirm_title'),
                                    style: const TextStyle(color: Colors.white),
                                  ),
                                  content: Text(
                                    l10n.t('site_delete_confirm',
                                        {'name': s.siteCode}),
                                    style: TextStyle(color: Colors.white.withAlpha(180)),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(dCtx, false),
                                      child: Text(l10n.t('cancel')),
                                    ),
                                    TextButton(
                                      onPressed: () => Navigator.pop(dCtx, true),
                                      child: Text(
                                        l10n.t('site_delete'),
                                        style: const TextStyle(color: Color(0xFFFF4757)),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                              if (confirm != true) return;
                              final ok = await provider.deleteSite(s.id);
                              if (context.mounted) {
                                Navigator.pop(ctx);
                                if (ok) {
                                  final pc = context.read<PrivateCompanyProvider>();
                                  if (pc.canOpenPrivateWorkspace) {
                                    await context
                                        .read<SitesProvider>()
                                        .fetchSites(includeWorkspace: true);
                                  }
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(l10n.t('site_deleted')),
                                        backgroundColor: const Color(0xFF00D4AA),
                                      ),
                                    );
                                  }
                                }
                              }
                            },
                            icon: const Icon(Icons.delete_outline_rounded),
                            label: Text(l10n.t('site_delete')),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFFF4757),
                              side: const BorderSide(color: Color(0xFFFF4757)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ] else if (pc.canProposeSiteChanges) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(ctx);
                        showWorkspaceSiteFormSheet(
                          context,
                          site: s,
                          directEdit: false,
                          proposeOnly: true,
                        );
                      },
                      icon: const Icon(Icons.edit_note_rounded),
                      label: Text(l10n.t('pc_site_propose_changes')),
                    ),
                  ],
                  if (pc.canManageSites && s.isPending) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              await provider.confirmSite(s.id, reject: true);
                              if (context.mounted) Navigator.pop(ctx);
                            },
                            child: Text(l10n.t('pc_site_reject_pending')),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              await provider.confirmSite(s.id);
                              if (context.mounted) Navigator.pop(ctx);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00D4AA),
                            ),
                            child: Text(l10n.t('pc_site_confirm_pending')),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              );
            },
          );
        },
      );
    },
  );
}

Future<void> showWorkspaceSiteCreateSheet(BuildContext context) async {
  final pc = context.read<PrivateCompanyProvider>();
  if (!pc.canManageSites) return;
  await showWorkspaceSiteFormSheet(
    context,
    directEdit: true,
    proposeOnly: false,
  );
}

class _WsStatusChip extends StatelessWidget {
  const _WsStatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(120)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _WsCountChip extends StatelessWidget {
  const _WsCountChip({
    required this.label,
    required this.count,
    required this.color,
  });
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(24),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Text(
        '$label: $count',
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}
