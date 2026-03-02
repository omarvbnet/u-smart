import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/sites_provider.dart';

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
  final _provinceCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.site != null) {
      _siteIdCtrl.text = widget.site!.siteId;
      _locationCtrl.text = widget.site!.location;
      _provinceCtrl.text = widget.site!.province;
    }
  }

  @override
  void dispose() {
    _siteIdCtrl.dispose();
    _locationCtrl.dispose();
    _provinceCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final siteId = _siteIdCtrl.text.trim();
    final location = _locationCtrl.text.trim();
    final province = _provinceCtrl.text.trim();

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
      success = await provider.updateSite(widget.site!.id,
          siteId: siteId, location: location, province: province);
    } else {
      success = await provider.createSite(
        siteId: siteId,
        location: location,
        province: province,
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
          _TextField(
            controller: _provinceCtrl,
            label: l10n.t('site_province'),
            hint: l10n.t('site_province_hint'),
            icon: Icons.map_outlined,
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
