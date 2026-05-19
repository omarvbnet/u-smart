import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/site.dart';
import '../providers/private_company_provider.dart';
import '../providers/sites_provider.dart';
import '../providers/workspace_sites_provider.dart';
import '../screens/qfield_project_map_screen.dart';

/// Resolves the best QField project for [site], refreshing from API when needed.
Future<QFieldProject?> resolveSiteQFieldProject(
  BuildContext context,
  Site site,
) async {
  var project = site.primaryQFieldProject;
  if (project != null) return project;

  if (!site.hasQfield) return null;

  if (site.isWorkspace && site.workspaceSiteId != null) {
    final detail = await context
        .read<WorkspaceSitesProvider>()
        .loadSiteDetail(site.workspaceSiteId!);
    final projects = detail?.site.qfieldProjects ?? const [];
    for (final p in projects) {
      if (p.currentUrl.trim().isNotEmpty) return p;
    }
    return null;
  }

  if (!context.mounted) return null;
  final includeWs =
      context.read<PrivateCompanyProvider>().canOpenPrivateWorkspace;
  await context.read<SitesProvider>().fetchSites(includeWorkspace: includeWs);
  if (!context.mounted) return null;
  final refreshed = context.read<SitesProvider>().sites.where((s) {
    if (site.isWorkspace) {
      return s.workspaceSiteId == site.workspaceSiteId;
    }
    return s.id == site.id;
  }).firstOrNull;
  return refreshed?.primaryQFieldProject;
}

/// Opens the full QField map for a site card (workspace or owned).
Future<void> openSiteQFieldMap(
  BuildContext context,
  Site site, {
  VoidCallback? onSaved,
}) async {
  final l10n = AppLocalizations.of(context);

  if (!context.mounted) return;
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => const Center(
      child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
    ),
  );

  final project = await resolveSiteQFieldProject(context, site);

  if (context.mounted) Navigator.of(context, rootNavigator: true).pop();

  if (!context.mounted) return;
  if (project == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.t('pc_site_map_load_failed')),
        backgroundColor: const Color(0xFFFF4757),
      ),
    );
    return;
  }

  final pc = context.read<PrivateCompanyProvider>();
  final canWriteMap = site.isWorkspace
      ? (pc.canProposeSiteChanges || pc.canManageSites)
      : site.canEdit;

  await Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => QFieldProjectMapScreen(
        workspaceSiteId: site.isWorkspace ? site.workspaceSiteId : null,
        ownedSiteId: site.isWorkspace ? null : site.id,
        project: project,
        canWrite: canWriteMap,
        onSaved: onSaved,
      ),
    ),
  );
}
