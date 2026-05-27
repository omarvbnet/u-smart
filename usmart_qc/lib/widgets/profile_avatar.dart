import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// Round avatar with an "edit" button for uploading or removing the user's
/// profile photo. Falls back to the user initial when no photo is set.
class ProfileAvatar extends StatefulWidget {
  final double size;
  final bool editable;
  const ProfileAvatar({super.key, this.size = 90, this.editable = true});

  @override
  State<ProfileAvatar> createState() => _ProfileAvatarState();
}

class _ProfileAvatarState extends State<ProfileAvatar> {
  bool _busy = false;

  Future<void> _pickFrom(ImageSource src) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: src,
      imageQuality: 85,
      maxWidth: 1024,
      maxHeight: 1024,
    );
    if (picked == null) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final auth = context.read<AuthProvider>();
    final api = context.read<ApiService>();
    final l10n = AppLocalizations.of(context);
    try {
      final bytes = await picked.readAsBytes();
      final res = await api.postMultipartBytes(
        '/api/profile/photo',
        bytes: bytes,
        filename: picked.name,
      );
      final ok = res['success'] == true;
      final url = ok ? res['photoUrl'] as String? : null;
      if (ok && url != null) {
        auth.applyPhotoUrl(url);
      } else {
        messenger.showSnackBar(SnackBar(
          content: Text(res['message'] as String? ?? l10n.t('profile_update_photo_failed')),
        ));
      }
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.t('profile_update_photo_failed'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final auth = context.read<AuthProvider>();
    final api = context.read<ApiService>();
    final l10n = AppLocalizations.of(context);
    try {
      final res = await api.delete('/api/profile/photo');
      if (res['success'] == true) {
        auth.applyPhotoUrl(null);
      } else {
        messenger.showSnackBar(SnackBar(
          content: Text(res['message'] as String? ?? l10n.t('profile_update_photo_failed')),
        ));
      }
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.t('profile_update_photo_failed'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openSheet() {
    final l10n = AppLocalizations.of(context);
    final user = context.read<AuthProvider>().user;
    final hasPhoto = (user?.photoUrl ?? '').isNotEmpty;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: Colors.white),
              title: Text(l10n.t('profile_change_photo'),
                  style: const TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.of(ctx).pop();
                _pickFrom(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: Colors.white),
              title: Text(l10n.t('profile_change_photo'),
                  style: const TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.of(ctx).pop();
                _pickFrom(ImageSource.camera);
              },
            ),
            if (hasPhoto)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded, color: Color(0xFFFF6B6B)),
                title: Text(l10n.t('profile_remove_photo'),
                    style: const TextStyle(color: Color(0xFFFF6B6B))),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _remove();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final size = widget.size;
    final hasPhoto = (user?.photoUrl ?? '').isNotEmpty;
    final radius = size * 0.31;
    final letter = (user?.name ?? user?.username ?? '?')
        .trim()
        .substring(0, 1)
        .toUpperCase();

    final core = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withAlpha(60),
            blurRadius: 30,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: hasPhoto
            ? _NetworkOrFileImage(url: user!.photoUrl!)
            : Center(
                child: Text(
                  letter,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: size * 0.4,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
      ),
    );

    if (!widget.editable) return core;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        core,
        Positioned(
          right: -4,
          bottom: -4,
          child: Material(
            color: const Color(0xFF12122A),
            shape: const CircleBorder(),
            elevation: 4,
            child: InkWell(
              onTap: _busy ? null : _openSheet,
              customBorder: const CircleBorder(),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: _busy
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.edit_rounded, color: Colors.white, size: 16),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _NetworkOrFileImage extends StatelessWidget {
  final String url;
  const _NetworkOrFileImage({required this.url});

  @override
  Widget build(BuildContext context) {
    if (url.startsWith('http')) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) =>
            const Icon(Icons.broken_image_rounded, color: Colors.white70),
      );
    }
    return Image.file(File(url), fit: BoxFit.cover);
  }
}
