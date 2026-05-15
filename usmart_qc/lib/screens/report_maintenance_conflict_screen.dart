import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/conflicts_provider.dart';
import '../providers/tickets_provider.dart';
import 'conflict_detail_screen.dart';
import 'attachment_viewer_screen.dart';

/// Screen to report a maintenance conflict: reason + images.
class ReportMaintenanceConflictScreen extends StatefulWidget {
  final String ticketId;

  const ReportMaintenanceConflictScreen({super.key, required this.ticketId});

  @override
  State<ReportMaintenanceConflictScreen> createState() =>
      _ReportMaintenanceConflictScreenState();
}

class _ReportMaintenanceConflictScreenState
    extends State<ReportMaintenanceConflictScreen> {
  final _reasonCtrl = TextEditingController();
  final List<String> _imageUrls = [];
  bool _submitting = false;
  bool _uploading = false;
  final _picker = ImagePicker();

  Future<void> _pickImage() async {
    final x = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 72,
    );
    if (!mounted || x == null) return;
    final provider = context.read<TicketsProvider>();
    final path = x.path;
    final bytes = await x.readAsBytes();
    if (!mounted || bytes.isEmpty) return;
    final ext = (path.split('.').lastOrNull ?? 'jpg').toLowerCase();
    final filename = 'conflict_${DateTime.now().millisecondsSinceEpoch}.$ext';
    setState(() => _uploading = true);
    try {
      final url = await provider.uploadFileFromBytes(bytes, filename);
      if (url != null && mounted) {
        setState(() {
          _imageUrls.add(url);
          _uploading = false;
        });
      } else if (mounted) {
        setState(() => _uploading = false);
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _uploading = false);
        _showError(AppLocalizations.of(context).t('upload_failed'));
      }
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: false,
      withData: true,
    );
    if (!mounted || result == null || result.files.isEmpty) return;
    final file = result.files.single;
    if (file.bytes != null && file.bytes!.isNotEmpty && file.name.isNotEmpty) {
      setState(() => _uploading = true);
      try {
        final provider = context.read<TicketsProvider>();
        final url = await provider.uploadFileFromBytes(file.bytes!, file.name);
        if (url != null && mounted) {
          setState(() {
            _imageUrls.add(url);
            _uploading = false;
          });
        } else if (mounted) {
          setState(() => _uploading = false);
          _showError(AppLocalizations.of(context).t('upload_failed'));
        }
      } catch (_) {
        if (mounted) {
          setState(() => _uploading = false);
          _showError(AppLocalizations.of(context).t('upload_failed'));
        }
      }
    }
  }

  void _removeImage(int index) => setState(() => _imageUrls.removeAt(index));

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _submit() async {
    final reason = _reasonCtrl.text.trim();
    final l10n = AppLocalizations.of(context);
    if (reason.isEmpty) {
      _showError(l10n.t('maint_conflict_reason_required'));
      return;
    }
    if (_imageUrls.isEmpty) {
      _showError(l10n.t('maint_conflict_images_required'));
      return;
    }

    setState(() => _submitting = true);
    final conflictProv = context.read<ConflictsProvider>();
    final conflict = await conflictProv.reportConflict(
      widget.ticketId,
      comment: reason,
      imageUrls: _imageUrls,
    );

    if (mounted) {
      setState(() => _submitting = false);
      if (conflict != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('conflict_reported')),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        Navigator.of(context).pop(true);
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ConflictDetailScreen(conflictId: conflict.id),
          ),
        );
      } else {
        _showError(l10n.t('conflict_report_failed'));
      }
    }
  }

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
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
          l10n.t('report_conflict'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            l10n.t('maint_conflict_form_hint'),
            style: TextStyle(
              color: Colors.white.withAlpha(180),
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            l10n.t('maint_conflict_reason').toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(80),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _reasonCtrl,
            maxLines: 4,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              hintText: l10n.t('maint_conflict_reason_hint'),
              hintStyle: const TextStyle(color: Color(0xFF4B5563)),
              prefixIcon: const Icon(Icons.info_outline_rounded,
                  color: Color(0xFF6C63FF), size: 20),
              filled: true,
              fillColor: const Color(0xFF12122A),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: Colors.white.withAlpha(10)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            l10n.t('maint_conflict_images').toUpperCase(),
            style: TextStyle(
              color: Colors.white.withAlpha(80),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.t('maint_conflict_images_hint'),
            style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 12),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _addButton(
                icon: Icons.photo_library_outlined,
                label: l10n.t('add_image'),
                onTap: _uploading ? null : _pickImage,
              ),
              const SizedBox(width: 12),
              _addButton(
                icon: Icons.attach_file_rounded,
                label: l10n.t('add_file'),
                onTap: _uploading ? null : _pickFile,
              ),
            ],
          ),
          if (_imageUrls.isNotEmpty) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _imageUrls.asMap().entries.map((e) {
                final url = e.value;
                final idx = e.key;
                final displayUrl = url.startsWith('http')
                    ? url
                    : (url.startsWith('/')
                        ? '${ApiConfig.baseUrl}$url'
                        : '${ApiConfig.baseUrl}/$url');
                return Stack(
                  clipBehavior: Clip.none,
                  children: [
                    GestureDetector(
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AttachmentViewerScreen(
                            url: url,
                            label: url.split('/').last,
                          ),
                        ),
                      ),
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A1A2E),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: const Color(0xFF6C63FF).withAlpha(60)),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            displayUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.image_not_supported_rounded,
                              color: Color(0xFF6C63FF),
                              size: 28,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: -6,
                      right: -6,
                      child: GestureDetector(
                        onTap: () => _removeImage(idx),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Color(0xFFFF4757),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.close,
                              color: Colors.white, size: 14),
                        ),
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ],
          const SizedBox(height: 36),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withAlpha(60),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ElevatedButton(
                onPressed: (_submitting || _uploading) ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: (_submitting || _uploading)
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(l10n.t('report_conflict')),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _addButton({
    required IconData icon,
    required String label,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF12122A),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: const Color(0xFF6C63FF), size: 20),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}
