import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// Editable "contact email" tile shown on the profile screen for COMPANY
/// requesters and private-company workspace members. Hidden for everyone
/// else (the server returns `canEditContactEmail = false` for those roles).
///
/// Backward-compatible: older builds of the Provisor server return no
/// `canEditContactEmail`, in which case the User model derives it from the
/// role / workspace membership and still shows the tile to eligible users.
class ProfileContactEmailTile extends StatefulWidget {
  const ProfileContactEmailTile({super.key});

  @override
  State<ProfileContactEmailTile> createState() => _ProfileContactEmailTileState();
}

class _ProfileContactEmailTileState extends State<ProfileContactEmailTile> {
  bool _busy = false;

  static final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  Future<void> _openEditor(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final l10n = AppLocalizations.of(context);
    final initial = auth.user?.contactEmail ?? '';
    final controller = TextEditingController(text: initial);
    final formKey = GlobalKey<FormState>();

    final result = await showModalBottomSheet<_ContactEmailResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 20,
          bottom: 20 + MediaQuery.of(sheetCtx).viewInsets.bottom,
        ),
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('profile_contact_email_title'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.t('profile_contact_email_hint'),
                style: TextStyle(
                  color: Colors.white.withAlpha(150),
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: controller,
                autofocus: true,
                keyboardType: TextInputType.emailAddress,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF1B1B3A),
                  hintText: 'name@example.com',
                  hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
                  prefixIcon:
                      const Icon(Icons.mail_outline_rounded, color: Color(0xFF6C63FF)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
                validator: (value) {
                  final v = (value ?? '').trim();
                  if (v.isEmpty) return null; // allow clearing via this field
                  if (!_emailRe.hasMatch(v)) {
                    return l10n.t('profile_contact_email_invalid');
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  if (initial.isNotEmpty)
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFFF6B6B),
                          side: const BorderSide(color: Color(0xFFFF6B6B)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: () => Navigator.of(sheetCtx)
                            .pop(const _ContactEmailResult.clear()),
                        child: Text(l10n.t('profile_contact_email_remove')),
                      ),
                    ),
                  if (initial.isNotEmpty) const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF6C63FF),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () {
                        if (!(formKey.currentState?.validate() ?? false)) return;
                        Navigator.of(sheetCtx).pop(
                          _ContactEmailResult.save(controller.text.trim()),
                        );
                      },
                      child: Text(l10n.t('profile_contact_email_save')),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    if (!mounted || result == null) return;
    await _submit(result);
  }

  Future<void> _submit(_ContactEmailResult result) async {
    setState(() => _busy = true);
    final api = context.read<ApiService>();
    final auth = context.read<AuthProvider>();
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      Map<String, dynamic> res;
      if (result.clear) {
        res = await api.delete('/api/profile/contact-email');
      } else {
        res = await api.patch(
          '/api/profile/contact-email',
          body: {'contactEmail': result.value},
        );
      }
      final ok = res['success'] == true;
      if (ok) {
        final newValue = res['contactEmail'];
        auth.applyContactEmail(newValue is String ? newValue : null);
        messenger.showSnackBar(SnackBar(
          content: Text(l10n.t(result.clear
              ? 'profile_contact_email_removed'
              : 'profile_contact_email_saved')),
        ));
      } else {
        messenger.showSnackBar(SnackBar(
          content: Text((res['message'] as String?) ??
              l10n.t('profile_contact_email_save_failed')),
        ));
      }
    } catch (_) {
      messenger.showSnackBar(SnackBar(
        content: Text(l10n.t('profile_contact_email_save_failed')),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null || !user.canEditContactEmail) {
      return const SizedBox.shrink();
    }
    final l10n = AppLocalizations.of(context);
    final value = user.contactEmail;
    final hasValue = value != null && value.trim().isNotEmpty;
    final subtitle = hasValue ? value : l10n.t('profile_contact_email_empty');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF00D4AA).withAlpha(20)),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: _busy ? null : () => _openEditor(context),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF00D4AA).withAlpha(20),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.alternate_email_rounded,
                      color: Color(0xFF00D4AA), size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.t('profile_contact_email_title'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: hasValue
                              ? Colors.white.withAlpha(190)
                              : Colors.white.withAlpha(120),
                          fontSize: 11,
                          fontStyle:
                              hasValue ? FontStyle.normal : FontStyle.italic,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                _busy
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white70),
                      )
                    : Icon(
                        Icons.edit_rounded,
                        size: 16,
                        color: Colors.white.withAlpha(140),
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ContactEmailResult {
  final bool clear;
  final String value;
  const _ContactEmailResult.save(this.value) : clear = false;
  const _ContactEmailResult.clear()
      : clear = true,
        value = '';
}
