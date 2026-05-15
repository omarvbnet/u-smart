import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/tickets_provider.dart';

class NcrResubmitScreen extends StatefulWidget {
  final String ticketId;
  const NcrResubmitScreen({super.key, required this.ticketId});

  @override
  State<NcrResubmitScreen> createState() => _NcrResubmitScreenState();
}

class _NcrResubmitScreenState extends State<NcrResubmitScreen> {
  final _commentCtrl = TextEditingController();
  final List<String> _imageUrls = [];
  bool _submitting = false;
  bool _uploading = false;
  final _picker = ImagePicker();

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

  Future<void> _uploadImage(String path, dynamic xFile) async {
    if (!mounted) return;
    final provider = context.read<TicketsProvider>();
    final bytes = await (xFile is XFile ? xFile.readAsBytes() : Future<List<int>>.value([]));
    if (!mounted || bytes.isEmpty) return;
    final ext = (path.split('.').lastOrNull ?? 'jpg').toLowerCase();
    final filename = 'ncr_evidence_${DateTime.now().millisecondsSinceEpoch}.$ext';
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

  void _removeImage(int index) {
    setState(() => _imageUrls.removeAt(index));
  }

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
    final comment = _commentCtrl.text.trim();
    final l10n = AppLocalizations.of(context);
    if (comment.isEmpty) {
      _showError(l10n.t('ncr_resolving_comments_required'));
      return;
    }
    if (_imageUrls.isEmpty) {
      _showError(l10n.t('ncr_evidence_required'));
      return;
    }

    setState(() => _submitting = true);
    final provider = context.read<TicketsProvider>();
    final success =
        await provider.submitNcrResubmission(widget.ticketId, comment, _imageUrls);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('ncr_sent')),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        Navigator.of(context).pop(true);
      } else {
        _showError(l10n.t('submit_failed'));
        setState(() => _submitting = false);
      }
    }
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
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
        title: Text(l10n.t('ncr_resubmission'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF4757).withAlpha(10),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0x30FF4757)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        color: Color(0xFFFF6B81), size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        l10n.t('ncr_resubmit_hint'),
                        style: TextStyle(
                            color: Colors.white.withAlpha(150), fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Text(
                l10n.t('ncr_resolving_comments'),
                style: TextStyle(
                  color: Colors.white.withAlpha(140),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _commentCtrl,
                maxLines: 6,
                style: const TextStyle(color: Colors.white, fontSize: 15),
                decoration: InputDecoration(
                  hintText: l10n.t('ncr_resolving_comments_hint'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(color: Colors.white.withAlpha(10)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: Color(0xFFFF4757)),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                l10n.t('ncr_evidence_label'),
                style: TextStyle(
                  color: Colors.white.withAlpha(140),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                l10n.t('ncr_evidence_required_hint'),
                style: TextStyle(
                  color: Colors.white.withAlpha(100),
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ..._imageUrls.asMap().entries.map((e) {
                    final url = e.value;
                    final idx = e.key;
                    final isImage = url.toLowerCase().contains('image') ||
                        RegExp(r'\.(jpe?g|png|gif|webp)$').hasMatch(url);
                    return Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                            width: 80,
                            height: 80,
                            child: isImage
                                ? Image.network(
                                    url,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: const Color(0xFF0A0A1F),
                                      child: Icon(Icons.broken_image,
                                          color: Colors.white.withAlpha(100)),
                                    ),
                                  )
                                : Container(
                                    color: const Color(0xFF0A0A1F),
                                    child: Icon(Icons.insert_photo,
                                        color: Colors.white.withAlpha(100)),
                                  ),
                          ),
                        ),
                        Positioned(
                          top: -4,
                          right: -4,
                          child: GestureDetector(
                            onTap: () => _removeImage(idx),
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: const BoxDecoration(
                                color: Color(0xFFFF4757),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    );
                  }),
                  GestureDetector(
                    onTap: _uploading ? null : () async {
                      final choice = await showModalBottomSheet<int>(
                        context: context,
                        backgroundColor: const Color(0xFF12122A),
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                        ),
                        builder: (ctx) => SafeArea(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ListTile(
                                  leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF6C63FF)),
                                  title: Text(l10n.t('pick_from_gallery'),
                                      style: const TextStyle(color: Colors.white)),
                                  onTap: () => Navigator.pop(ctx, 1),
                                ),
                                ListTile(
                                  leading: const Icon(Icons.camera_alt_rounded, color: Color(0xFF6C63FF)),
                                  title: Text(l10n.t('take_photo'),
                                      style: const TextStyle(color: Colors.white)),
                                  onTap: () => Navigator.pop(ctx, 2),
                                ),
                                ListTile(
                                  leading: const Icon(Icons.folder_rounded, color: Color(0xFF6C63FF)),
                                  title: Text(l10n.t('pick_file'),
                                      style: const TextStyle(color: Colors.white)),
                                  onTap: () => Navigator.pop(ctx, 3),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                      if (!mounted) return;
                      if (choice == 1 || choice == 2) {
                        final source = choice == 1 ? ImageSource.gallery : ImageSource.camera;
                        final picked = await _picker.pickImage(
                          source: source,
                          imageQuality: 72,
                          maxWidth: 1920,
                          maxHeight: 1920,
                        );
                        if (picked != null && mounted) await _uploadImage(picked.path, picked);
                      } else if (choice == 3) {
                        await _pickFile();
                      }
                    },
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: const Color(0xFF12122A),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0x40FF4757)),
                      ),
                      child: _uploading
                          ? const Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFFFF4757),
                                ),
                              ),
                            )
                          : const Icon(Icons.add_photo_alternate_rounded,
                              color: Color(0xFFFF6B81), size: 32),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFFF4757), Color(0xFFE8384F)],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFFF4757).withAlpha(60),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                strokeWidth: 2.5, color: Colors.white),
                          )
                        : Text(l10n.t('submit_resubmission'),
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
