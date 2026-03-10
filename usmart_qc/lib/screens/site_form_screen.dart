import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/sites_provider.dart';
import 'site_map_picker_screen.dart';

/// Iraq provinces (19 governorates)
const List<String> _iraqProvinces = [
  'Al-Anbar',
  'Babil',
  'Baghdad',
  'Basra',
  'Dhi Qar',
  'Al-Qadisiyyah',
  'Diyala',
  'Duhok',
  'Erbil',
  'Halabja',
  'Karbala',
  'Kirkuk',
  'Maysan',
  'Muthanna',
  'Najaf',
  'Ninawa',
  'Salah Al-Din',
  'Sulaymaniyah',
  'Wasit',
];

/// Screen for adding a new site or editing an existing one.
class SiteFormScreen extends StatefulWidget {
  final Site? site;

  const SiteFormScreen({super.key, this.site});

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

    bool success;
    if (widget.isEditing) {
      success = await provider.updateSite(
        widget.site!.id,
        siteId: siteId,
        location: location,
        province: province,
        latitude: _latitude,
        longitude: _longitude,
      );
    } else {
      success = await provider.createSite(
        siteId: siteId,
        location: location,
        province: province,
        latitude: _latitude,
        longitude: _longitude,
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
          widget.isEditing ? l10n.t('site_edit') : l10n.t('site_add'),
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
            enabled: !widget.isEditing, // Keep siteId immutable when editing (tickets may reference it)
          ),
          const SizedBox(height: 16),
          _TextField(
            controller: _locationCtrl,
            label: l10n.t('site_location'),
            hint: l10n.t('site_location_hint'),
            icon: Icons.location_on_outlined,
          ),
          const SizedBox(height: 16),
          _ProvinceDropdown(
            label: l10n.t('site_province'),
            hint: l10n.t('site_province_hint'),
            value: _selectedProvince,
            items: [
              ..._iraqProvinces,
              if (widget.isEditing &&
                  widget.site!.province.isNotEmpty &&
                  !_iraqProvinces.contains(widget.site!.province))
                widget.site!.province,
            ],
            onChanged: (v) => setState(() => _selectedProvince = v),
          ),
          const SizedBox(height: 16),
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
      ),
    );
  }
}

class _ProvinceDropdown extends StatelessWidget {
  final String label;
  final String hint;
  final String? value;
  final List<String> items;
  final void Function(String?) onChanged;

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
