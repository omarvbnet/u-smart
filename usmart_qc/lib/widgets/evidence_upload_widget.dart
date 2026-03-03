import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/app_localizations.dart';
import '../models/evidence.dart';
import '../screens/attachment_viewer_screen.dart';

class EvidenceUploadWidget extends StatelessWidget {
  final List<TicketEvidence> evidence;
  final bool loading;
  final bool uploading;
  final VoidCallback onPickImage;
  final VoidCallback onPickFile;
  /// When false, upload buttons (photo/file) are hidden (e.g. ticket completed)
  final bool showUploadButtons;

  const EvidenceUploadWidget({
    super.key,
    required this.evidence,
    required this.loading,
    required this.uploading,
    required this.onPickImage,
    required this.onPickFile,
    this.showUploadButtons = true,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final fmt = DateFormat('MMM d, HH:mm');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Row(
            children: [
              Text(
                l10n.t('evidence'),
                style: TextStyle(
                  color: Colors.white.withAlpha(100),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF00D4AA).withAlpha(20),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${evidence.length}',
                  style: const TextStyle(
                    color: Color(0xFF00D4AA),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Color(0xFF6C63FF)),
              ),
            ),
          )
        else ...[
          if (evidence.isNotEmpty)
            SizedBox(
              height: 120,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: evidence.length,
                itemBuilder: (context, index) {
                  final e = evidence[index];
                  return GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AttachmentViewerScreen(
                          url: e.fileUrl,
                          label: e.description ?? e.fileUrl.split('/').last,
                        ),
                      ),
                    ),
                    child: Container(
                      width: 120,
                      margin: const EdgeInsets.only(right: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withAlpha(5),
                        borderRadius: BorderRadius.circular(14),
                        border:
                            Border.all(color: Colors.white.withAlpha(10)),
                      ),
                      child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (e.isImage)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.network(
                              e.fileUrl,
                              width: 80,
                              height: 60,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                width: 80,
                                height: 60,
                                color: Colors.white.withAlpha(8),
                                child: const Icon(
                                    Icons.broken_image_rounded,
                                    color: Color(0xFF4B5563),
                                    size: 24),
                              ),
                            ),
                          )
                        else
                          Container(
                            width: 80,
                            height: 60,
                            decoration: BoxDecoration(
                              color: const Color(0xFF6C63FF).withAlpha(15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(
                                Icons.description_rounded,
                                color: Color(0xFF8B83FF),
                                size: 28),
                          ),
                        const SizedBox(height: 6),
                        Padding(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 6),
                          child: Text(
                            e.description ?? fmt.format(e.createdAt),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: Colors.white.withAlpha(60),
                                fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                    ),
                  );
                },
              ),
            ),
          if (evidence.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                l10n.t('no_evidence'),
                style: TextStyle(
                    color: Colors.white.withAlpha(60), fontSize: 13),
              ),
            ),
          if (showUploadButtons) ...[
            const SizedBox(height: 12),
            // Upload buttons
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: uploading ? null : onPickImage,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6C63FF).withAlpha(15),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: const Color(0xFF6C63FF).withAlpha(30)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (uploading)
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF6C63FF)),
                            )
                          else ...[
                            const Icon(Icons.camera_alt_rounded,
                                color: Color(0xFF8B83FF), size: 18),
                            const SizedBox(width: 6),
                            Text(l10n.t('photo'),
                                style: TextStyle(
                                    color: Color(0xFF8B83FF),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GestureDetector(
                    onTap: uploading ? null : onPickFile,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF00D4AA).withAlpha(15),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: const Color(0xFF00D4AA).withAlpha(30)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.attach_file_rounded,
                              color: Color(0xFF00D4AA), size: 18),
                          const SizedBox(width: 6),
                          Text(l10n.t('file'),
                              style: TextStyle(
                                  color: Color(0xFF00D4AA),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          ],
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}
