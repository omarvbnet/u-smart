import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/api_config.dart';

/// Full-screen viewer for attachments (images). PDFs open externally.
class AttachmentViewerScreen extends StatelessWidget {
  final String url;
  final String? label;

  const AttachmentViewerScreen({
    super.key,
    required this.url,
    this.label,
  });

  static String _fullUrl(String url) {
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return '${ApiConfig.baseUrl}$url';
    return '${ApiConfig.baseUrl}/$url';
  }

  static bool _isImage(String url) {
    final lower = url.toLowerCase();
    return lower.contains('image') ||
        RegExp(r'\.(jpe?g|png|gif|webp)$').hasMatch(lower);
  }

  @override
  Widget build(BuildContext context) {
    final fullUrl = _fullUrl(url);

    if (!_isImage(url)) {
      return Scaffold(
        backgroundColor: const Color(0xFF05051A),
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          foregroundColor: Colors.white,
          elevation: 0,
          title: Text(
            label ?? url.split('/').last,
            style: const TextStyle(fontSize: 16),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.picture_as_pdf_rounded,
                    size: 64, color: Color(0xFF6C63FF)),
                const SizedBox(height: 16),
                Text(
                  'PDF / File',
                  style: TextStyle(
                    color: Colors.white.withAlpha(180),
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () async {
                    final uri = Uri.tryParse(fullUrl);
                    if (uri != null && await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                  icon: const Icon(Icons.open_in_new_rounded, size: 20),
                  label: const Text('Open in browser'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          InteractiveViewer(
            minScale: 0.5,
            maxScale: 4,
            child: Center(
              child: Image.network(
                fullUrl,
                fit: BoxFit.contain,
                loadingBuilder: (context, child, loadingProgress) {
                  if (loadingProgress == null) return child;
                  return Center(
                    child: CircularProgressIndicator(
                      color: const Color(0xFF6C63FF),
                      value: loadingProgress.expectedTotalBytes != null
                          ? loadingProgress.cumulativeBytesLoaded /
                              loadingProgress.expectedTotalBytes!
                          : null,
                    ),
                  );
                },
                errorBuilder: (_, __, ___) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.broken_image_rounded,
                          size: 64, color: Colors.white.withAlpha(100)),
                      const SizedBox(height: 12),
                      Text(
                        'Failed to load image',
                        style: TextStyle(
                          color: Colors.white.withAlpha(150),
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded,
                      color: Colors.white, size: 28),
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black.withAlpha(120),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
