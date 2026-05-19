import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/site_design_document.dart';
import '../providers/tickets_provider.dart';

/// Optional design / specification PDFs on site create & edit forms.
class SiteDesignDocumentsSection extends StatefulWidget {
  const SiteDesignDocumentsSection({
    super.key,
    required this.documents,
    required this.onChanged,
    this.enabled = true,
  });

  final List<SiteDesignDocument> documents;
  final ValueChanged<List<SiteDesignDocument>> onChanged;
  final bool enabled;

  @override
  State<SiteDesignDocumentsSection> createState() =>
      _SiteDesignDocumentsSectionState();
}

class _SiteDesignDocumentsSectionState extends State<SiteDesignDocumentsSection> {
  bool _uploading = false;

  Future<void> _pickPdf(AppLocalizations l10n) async {
    if (!widget.enabled || _uploading) return;
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
      allowMultiple: true,
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return;

    setState(() => _uploading = true);
    final tickets = context.read<TicketsProvider>();
    final next = List<SiteDesignDocument>.from(widget.documents);

    for (final file in picked.files) {
      final name = file.name;
      if (name.isEmpty) continue;
      String? url;
      if (file.bytes != null && file.bytes!.isNotEmpty) {
        url = await tickets.uploadFileFromBytes(file.bytes!, name);
      } else if (file.path != null && file.path!.isNotEmpty) {
        url = await tickets.uploadFile(file.path!);
      }
      if (url == null) continue;
      final baseTitle = name.replaceFirst(RegExp(r'\.[^.]+$'), '');
      next.add(SiteDesignDocument(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        url: url,
        fileName: name,
        title: baseTitle.isEmpty ? name : baseTitle,
        uploadedAt: DateTime.now().toUtc().toIso8601String(),
        mimeType: 'application/pdf',
      ));
    }

    if (mounted) {
      setState(() => _uploading = false);
      if (next.length != widget.documents.length) {
        widget.onChanged(next);
      } else if (picked.files.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.t('upload_failed'))),
        );
      }
    }
  }

  void _remove(int index) {
    final next = List<SiteDesignDocument>.from(widget.documents)..removeAt(index);
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.picture_as_pdf_rounded,
                size: 18, color: Colors.white.withAlpha(180)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                l10n.t('site_design_docs_title'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          l10n.t('site_design_docs_hint'),
          style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
        ),
        const SizedBox(height: 10),
        if (widget.documents.isNotEmpty)
          ...widget.documents.asMap().entries.map((e) {
            final doc = e.value;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF1A1A2E),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF6C63FF).withAlpha(50)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.picture_as_pdf_rounded,
                      color: Color(0xFFFF6B6B), size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      doc.displayName,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (widget.enabled)
                    IconButton(
                      icon: Icon(Icons.close_rounded,
                          color: Colors.white.withAlpha(140), size: 20),
                      onPressed: () => _remove(e.key),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                ],
              ),
            );
          }),
        if (widget.enabled)
          OutlinedButton.icon(
            onPressed: _uploading ? null : () => _pickPdf(l10n),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF00D4AA),
              side: BorderSide(color: const Color(0xFF00D4AA).withAlpha(120)),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            icon: _uploading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.upload_file_rounded, size: 20),
            label: Text(l10n.t('site_design_docs_add')),
          ),
      ],
    );
  }
}
