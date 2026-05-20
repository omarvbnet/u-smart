import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/workspace_site.dart';
import '../providers/tickets_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/sites_provider.dart';
import '../models/site_design_document.dart';
import '../providers/workspace_sites_provider.dart';
import '../screens/site_map_picker_screen.dart';
import 'site_design_documents_section.dart';

Future<void> showWorkspaceSiteFormSheet(
  BuildContext context, {
  WorkspaceSite? site,
  required bool directEdit,
  required bool proposeOnly,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF12122A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => WorkspaceSiteFormSheet(
      site: site,
      directEdit: directEdit,
      proposeOnly: proposeOnly,
    ),
  );
}

class WorkspaceSiteFormSheet extends StatefulWidget {
  const WorkspaceSiteFormSheet({
    super.key,
    this.site,
    required this.directEdit,
    required this.proposeOnly,
  });

  final WorkspaceSite? site;
  final bool directEdit;
  final bool proposeOnly;

  @override
  State<WorkspaceSiteFormSheet> createState() => _WorkspaceSiteFormSheetState();
}

class _WorkspaceSiteFormSheetState extends State<WorkspaceSiteFormSheet> {
  final _code = TextEditingController();
  final _location = TextEditingController();
  final _coordsCtrl = TextEditingController();
  String? _province;
  double? _latitude;
  double? _longitude;
  bool _attachQfield = false;
  String? _qfieldUrl;
  String? _qfieldFileName;
  bool _uploading = false;
  bool _saving = false;
  List<SiteDesignDocument> _designDocuments = [];

  @override
  void initState() {
    super.initState();
    final s = widget.site;
    if (s != null) {
      _code.text = s.siteCode;
      _location.text = s.location;
      _province = s.province;
      _attachQfield = s.hasQfield;
      _designDocuments = List<SiteDesignDocument>.from(s.designDocuments);
      if (s.hasCoordinates) {
        _latitude = s.latitude;
        _longitude = s.longitude;
        _coordsCtrl.text =
            '${s.latitude!.toStringAsFixed(6)}, ${s.longitude!.toStringAsFixed(6)}';
      }
    }
  }

  void _applyCoordinates(double lat, double lng) {
    setState(() {
      _latitude = lat;
      _longitude = lng;
      _coordsCtrl.text = '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}';
    });
  }

  Future<void> _openMapPicker() async {
    final result = await Navigator.of(context).push<LatLng>(
      MaterialPageRoute(
        builder: (context) => SiteMapPickerScreen(
          initialLat: _latitude,
          initialLng: _longitude,
        ),
      ),
    );
    if (result != null && mounted) {
      _applyCoordinates(result.latitude, result.longitude);
    }
  }

  void _parseCoordsFromField() {
    final text = _coordsCtrl.text.trim();
    if (text.isEmpty) {
      setState(() {
        _latitude = null;
        _longitude = null;
      });
      return;
    }
    final parts = text.split(RegExp(r'[,\s;]+')).where((s) => s.isNotEmpty).toList();
    if (parts.length < 2) return;
    final lat = double.tryParse(parts[0]);
    final lng = double.tryParse(parts[1]);
    if (lat != null && lng != null) {
      _applyCoordinates(lat, lng);
    }
  }

  @override
  void dispose() {
    _code.dispose();
    _location.dispose();
    _coordsCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickQfield() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['zip', 'qgz', 'gpkg', 'qgs'],
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    setState(() => _uploading = true);
    final tickets = context.read<TicketsProvider>();
    String? url;
    if (file.bytes != null) {
      url = await tickets.uploadQFieldPackageFromBytes(file.bytes!, file.name);
    } else if (file.path != null) {
      url = await tickets.uploadQFieldPackageFromPath(file.path!);
    }
    if (mounted) {
      setState(() {
        _uploading = false;
        if (url != null) {
          _qfieldUrl = url;
          _qfieldFileName = file.name;
          _attachQfield = true;
        }
      });
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final code = _code.text.trim();
    final loc = _location.text.trim();
    final prov = _province?.trim() ?? '';
    if (code.isEmpty || loc.isEmpty || prov.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('pc_site_form_required'))),
      );
      return;
    }
    setState(() => _saving = true);
    final ws = context.read<WorkspaceSitesProvider>();
    List<Map<String, dynamic>>? qf;
    if (_attachQfield && _qfieldUrl != null && _qfieldFileName != null) {
      qf = WorkspaceSitesProvider.qfieldProjectPayload(
        _qfieldUrl!,
        _qfieldFileName!,
        title: code,
      );
    }
    final designPayload =
        WorkspaceSitesProvider.designDocumentsPayload(_designDocuments);

    bool ok;
    if (widget.site == null) {
      ok = await ws.createSite(
        siteCode: code,
        location: loc,
        province: prov,
        latitude: _latitude,
        longitude: _longitude,
        hasQfield: _attachQfield && qf != null,
        qfieldProjects: qf,
        designDocuments: designPayload,
      );
    } else {
      ok = await ws.updateSite(
        widget.site!.id,
        siteCode: widget.directEdit ? code : null,
        location: loc,
        province: prov,
        latitude: _latitude,
        longitude: _longitude,
        qfieldProjects: qf,
        designDocuments: designPayload,
      );
    }
    if (mounted) {
      setState(() => _saving = false);
      if (ok) {
        final pc = context.read<PrivateCompanyProvider>();
        if (pc.canOpenPrivateWorkspace) {
          final sitesProv = context.read<SitesProvider>();
          final match = ws.sites
              .where((s) => s.siteCode.toLowerCase() == code.toLowerCase())
              .toList();
          if (match.isNotEmpty) {
            sitesProv.mergeWorkspaceSiteFromJson(match.first.toJson());
          }
          await sitesProv.fetchSites(includeWorkspace: true);
        }
        if (context.mounted) Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.proposeOnly
                  ? l10n.t('pc_site_submitted_for_approval')
                  : l10n.t('pc_site_saved'),
            ),
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.site == null
                  ? l10n.t('pc_site_add')
                  : widget.proposeOnly
                      ? l10n.t('pc_site_propose_changes')
                      : l10n.t('pc_site_edit'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _code,
              enabled: widget.site == null || widget.directEdit,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_id'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _location,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_location'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _province,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('site_province'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
              items: kIraqProvinces
                  .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                  .toList(),
              onChanged: (v) => setState(() => _province = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _coordsCtrl,
              style: const TextStyle(color: Colors.white),
              keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
              decoration: InputDecoration(
                labelText: l10n.t('site_coordinates'),
                hintText: l10n.t('site_coordinates_hint'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
              ),
              onSubmitted: (_) => _parseCoordsFromField(),
              onEditingComplete: _parseCoordsFromField,
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _openMapPicker,
                icon: const Icon(Icons.map, size: 20),
                label: Text(l10n.t('site_select_on_map')),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(color: Colors.white.withAlpha(100)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            if (_latitude != null && _longitude != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${l10n.t('site_coordinates')}: ${_latitude!.toStringAsFixed(6)}, ${_longitude!.toStringAsFixed(6)}',
                  style: const TextStyle(color: Color(0xFF6C63FF), fontSize: 12),
                ),
              ),
            const SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                l10n.t('pc_site_attach_qfield'),
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
              subtitle: Text(
                l10n.t('pc_site_attach_qfield_hint'),
                style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
              ),
              value: _attachQfield,
              activeThumbColor: const Color(0xFF6C63FF),
              onChanged: (v) => setState(() => _attachQfield = v),
            ),
            if (_attachQfield) ...[
              OutlinedButton.icon(
                onPressed: _uploading ? null : _pickQfield,
                icon: _uploading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.folder_zip_rounded),
                label: Text(
                  _qfieldFileName ?? l10n.t('pc_site_pick_qfield'),
                ),
              ),
              if (!widget.directEdit && widget.site != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    l10n.t('pc_site_engineer_qfield_note'),
                    style: TextStyle(color: Colors.amberAccent.withAlpha(200), fontSize: 11),
                  ),
                ),
            ],
            const SizedBox(height: 16),
            SiteDesignDocumentsSection(
              documents: _designDocuments,
              onChanged: (docs) => setState(() => _designDocuments = docs),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      widget.proposeOnly
                          ? l10n.t('pc_site_submit_approval')
                          : l10n.t('save'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
