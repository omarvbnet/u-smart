import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../providers/sites_provider.dart';
import '../utils/site_import_parsing.dart';

/// Popup menu on the Sites tab header: import many sites from JSON or Excel (.xlsx).
class SiteBulkImportMenu extends StatelessWidget {
  const SiteBulkImportMenu({super.key});

  Future<void> _importJson(BuildContext context, SitesProvider provider) async {
    final l10n = AppLocalizations.of(context);
    final pick = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['json'],
      withData: true,
    );
    if (!context.mounted) return;
    final f = pick?.files.single;
    if (f?.bytes == null) return;
    try {
      final text = utf8.decode(f!.bytes!);
      final rows = sitesFromJsonString(text);
      await _postImport(context, provider, l10n, rows);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${l10n.t('site_import_parse_error')}: $e'),
            backgroundColor: const Color(0xFFFF4757),
          ),
        );
      }
    }
  }

  Future<void> _importXlsx(BuildContext context, SitesProvider provider) async {
    final l10n = AppLocalizations.of(context);
    final pick = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['xlsx'],
      withData: true,
    );
    if (!context.mounted) return;
    final f = pick?.files.single;
    if (f?.bytes == null) return;
    try {
      final rows = sitesFromXlsxBytes(f!.bytes!);
      await _postImport(context, provider, l10n, rows);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${l10n.t('site_import_parse_error')}: $e'),
            backgroundColor: const Color(0xFFFF4757),
          ),
        );
      }
    }
  }

  Future<void> _postImport(
    BuildContext context,
    SitesProvider provider,
    AppLocalizations l10n,
    List<Map<String, dynamic>> rows,
  ) async {
    final res = await provider.bulkImportSites(rows);
    if (!context.mounted) return;
    if (res == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_import_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
      return;
    }
    if (res['success'] == true) {
      final created = res['created'] is int ? res['created'] as int : 0;
      final skipped = res['skipped'] is int ? res['skipped'] as int : 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_import_done', {
            'created': '$created',
            'skipped': '$skipped',
          })),
          backgroundColor: const Color(0xFF00D4AA),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? l10n.t('site_import_failed')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final provider = context.read<SitesProvider>();
    return PopupMenuButton<String>(
      tooltip: l10n.t('site_import_menu'),
      icon: const Icon(Icons.upload_file_rounded, color: Color(0xFF8B83FF)),
      onSelected: (v) {
        if (v == 'json') {
          _importJson(context, provider);
        } else if (v == 'xlsx') {
          _importXlsx(context, provider);
        }
      },
      itemBuilder: (ctx) => [
        PopupMenuItem(
          value: 'json',
          child: Text(l10n.t('site_import_json')),
        ),
        PopupMenuItem(
          value: 'xlsx',
          child: Text(l10n.t('site_import_excel')),
        ),
      ],
    );
  }
}
