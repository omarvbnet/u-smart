import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/sites_provider.dart';
import '../providers/tickets_provider.dart';
import '../utils/site_qfield_map.dart';
import 'site_map_picker_screen.dart';

/// Screen for adding a new site or editing an existing one.
class SiteFormScreen extends StatefulWidget {
  final Site? site;
  final bool readOnly;

  const SiteFormScreen({super.key, this.site, this.readOnly = false});

  bool get isEditing => site != null;

  @override
  State<SiteFormScreen> createState() => _SiteFormScreenState();
}

class _SiteFormScreenState extends State<SiteFormScreen> {
  final _siteIdCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _coordinatesCtrl = TextEditingController();
  String? _selectedProvince;
  double? _latitude;
  double? _longitude;
  bool _submitting = false;
  bool _attachQfield = false;
  String? _qfieldUrl;
  String? _qfieldFileName;
  bool _uploadingQfield = false;

  @override
  void initState() {
    super.initState();
    if (widget.site != null) {
      _siteIdCtrl.text = widget.site!.siteId;
      _locationCtrl.text = widget.site!.location;
      _selectedProvince = widget.site!.province;
      if (widget.site!.latitude != null && widget.site!.longitude != null) {
        _latitude = widget.site!.latitude;
        _longitude = widget.site!.longitude;
        _coordinatesCtrl.text =
            '${_latitude!.toStringAsFixed(6)}, ${_longitude!.toStringAsFixed(6)}';
      }
      _attachQfield = widget.site!.hasQfield;
    }
  }

  Future<void> _pickQfield() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['zip', 'qgz', 'gpkg', 'qgs'],
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    setState(() => _uploadingQfield = true);
    final tickets = context.read<TicketsProvider>();
    String? url;
    if (file.bytes != null) {
      url = await tickets.uploadQFieldPackageFromBytes(file.bytes!, file.name);
    } else if (file.path != null) {
      url = await tickets.uploadQFieldPackageFromPath(file.path!);
    }
    if (mounted) {
      setState(() {
        _uploadingQfield = false;
        if (url != null) {
          _qfieldUrl = url;
          _qfieldFileName = file.name;
          _attachQfield = true;
        }
      });
    }
  }

  @override
  void dispose() {
    _siteIdCtrl.dispose();
    _locationCtrl.dispose();
    _coordinatesCtrl.dispose();
    super.dispose();
  }

  void _applyCoordinates(double lat, double lng) {
    setState(() {
      _latitude = lat;
      _longitude = lng;
      _coordinatesCtrl.text =
          '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}';
    });
  }

  Future<void> _openMapPicker() async {
    if (widget.readOnly) return;
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

  Future<void> _submit() async {
    if (widget.readOnly) return;
    final siteId = _siteIdCtrl.text.trim();
    final location = _locationCtrl.text.trim();
    final province = _selectedProvince ?? '';

    if (siteId.isEmpty || location.isEmpty || province.isEmpty) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_form_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    final provider = context.read<SitesProvider>();
    final l10n = AppLocalizations.of(context);

    List<Map<String, dynamic>>? qf;
    if (_attachQfield && _qfieldUrl != null && _qfieldFileName != null) {
      qf = SitesProvider.qfieldProjectPayload(
        _qfieldUrl!,
        _qfieldFileName!,
        title: siteId,
      );
    }

    bool success;
    if (widget.isEditing) {
      success = await provider.updateSite(
        widget.site!.id,
        siteId: siteId,
        location: location,
        province: province,
        latitude: _latitude,
        longitude: _longitude,
        qfieldProjects: qf,
      );
    } else {
      success = await provider.createSite(
        siteId: siteId,
        location: location,
        province: province,
        latitude: _latitude,
        longitude: _longitude,
        hasQfield: _attachQfield && qf != null,
        qfieldProjects: qf,
      );
    }

    if (!mounted) return;
    setState(() => _submitting = false);

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.isEditing
              ? l10n.t('site_updated')
              : l10n.t('site_created')),
          backgroundColor: const Color(0xFF00D4AA),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('site_save_failed')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          widget.readOnly
              ? l10n.t('site_view_shared')
              : (widget.isEditing ? l10n.t('site_edit') : l10n.t('site_add')),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _TextField(
            controller: _siteIdCtrl,
            label: l10n.t('site_id'),
            hint: l10n.t('site_id_hint'),
            icon: Icons.tag_rounded,
            enabled: !widget.readOnly && !widget.isEditing, // Keep siteId immutable when editing (tickets may reference it)
          ),
          const SizedBox(height: 16),
          _TextField(
            controller: _locationCtrl,
            label: l10n.t('site_location'),
            hint: l10n.t('site_location_hint'),
            icon: Icons.location_on_outlined,
            enabled: !widget.readOnly,
          ),
          const SizedBox(height: 16),
          _ProvinceDropdown(
            label: l10n.t('site_province'),
            hint: l10n.t('site_province_hint'),
            value: _selectedProvince,
            items: [
              ...kIraqProvinces,
              if (widget.isEditing &&
                  widget.site!.province.isNotEmpty &&
                  !kIraqProvinces.contains(widget.site!.province))
                widget.site!.province,
            ],
            onChanged: widget.readOnly ? null : (v) => setState(() => _selectedProvince = v),
          ),
          const SizedBox(height: 16),
          if (widget.readOnly)
            _TextField(
              controller: _coordinatesCtrl,
              label: l10n.t('site_coordinates'),
              hint: l10n.t('site_coordinates_hint'),
              icon: Icons.gps_fixed,
              enabled: false,
            )
          else ...[
            _CoordinateSearchField(
              controller: _coordinatesCtrl,
              label: l10n.t('site_search_by_coords'),
              hint: l10n.t('site_coordinates_hint'),
              onApply: (lat, lng) {
                _applyCoordinates(lat, lng);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('${l10n.t('site_coordinates')}: ${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)}'),
                      backgroundColor: const Color(0xFF00D4AA),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              onParseError: () {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l10n.t('site_coords_invalid')),
                      backgroundColor: const Color(0xFFFF4757),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _openMapPicker,
                icon: const Icon(Icons.map, size: 20),
                label: Text(l10n.t('site_select_on_map')),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(color: Colors.white.withAlpha(100)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
          if (_latitude != null && _longitude != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${l10n.t('site_coordinates')}: ${_latitude!.toStringAsFixed(6)}, ${_longitude!.toStringAsFixed(6)}',
                style: const TextStyle(
                  color: Color(0xFF6C63FF),
                  fontSize: 13,
                ),
              ),
            ),
          if (widget.isEditing && widget.site!.canOpenQFieldMap) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => openSiteQFieldMap(
                context,
                widget.site!,
                onSaved: () => context.read<SitesProvider>().fetchSites(
                      includeWorkspace:
                          context.read<SitesProvider>().isWorkspaceMember,
                    ),
              ),
              icon: const Icon(Icons.map_rounded),
              label: Text(l10n.t('pc_site_view_qfield_map')),
            ),
          ],
          if (!widget.readOnly) ...[
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
            if (_attachQfield)
              OutlinedButton.icon(
                onPressed: _uploadingQfield ? null : _pickQfield,
                icon: _uploadingQfield
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.folder_zip_rounded),
                label: Text(_qfieldFileName ?? l10n.t('pc_site_pick_qfield')),
              ),
          ],
          if (!widget.readOnly) ...[
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text(l10n.t('site_save')),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProvinceDropdown extends StatelessWidget {
  final String label;
  final String hint;
  final String? value;
  final List<String> items;
  final void Function(String?)? onChanged;

  const _ProvinceDropdown({
    required this.label,
    required this.hint,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: value != null && items.contains(value) ? value : null,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon: const Icon(
              Icons.map_outlined,
              color: Color(0xFF6C63FF),
              size: 20,
            ),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withAlpha(15)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF6C63FF)),
            ),
          ),
          dropdownColor: const Color(0xFF12122A),
          style: const TextStyle(color: Colors.white, fontSize: 15),
          icon: const Icon(Icons.keyboard_arrow_down_rounded,
              color: Color(0xFF6C63FF)),
          items: items.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _CoordinateSearchField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final void Function(double lat, double lng) onApply;
  final VoidCallback onParseError;

  const _CoordinateSearchField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.onApply,
    required this.onParseError,
  });

  bool _tryParse(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return false;
    final parts = trimmed.split(RegExp(r'[,\s]+'));
    if (parts.length < 2) return false;
    final lat = double.tryParse(parts[0].trim());
    final lng = double.tryParse(parts[1].trim());
    if (lat == null ||
        lng == null ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180) {
      return false;
    }
    onApply(lat, lng);
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          onSubmitted: (v) {
            if (!_tryParse(v)) onParseError();
          },
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon: const Icon(
              Icons.gps_fixed,
              color: Color(0xFF6C63FF),
              size: 20,
            ),
            suffixIcon: IconButton(
              icon: const Icon(Icons.check_circle_outline, color: Color(0xFF6C63FF)),
              onPressed: () {
                if (!_tryParse(controller.text)) onParseError();
              },
            ),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withAlpha(15)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF6C63FF)),
            ),
          ),
        ),
      ],
    );
  }
}

class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final bool enabled;

  const _TextField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          enabled: enabled,
          style: TextStyle(
            color: enabled ? Colors.white : Colors.white.withAlpha(120),
            fontSize: 15,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon: Icon(icon,
                color: const Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withAlpha(15)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF6C63FF)),
            ),
          ),
        ),
      ],
    );
  }
}
