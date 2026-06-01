import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// Lets a PERSONAL (individual) account add and verify an auth/identity email
/// via OTP. Once verified, the [PersonalCompanyUpgradeCard] becomes usable
/// (the upgrade request requires an email on file).
///
/// Only renders for PERSONAL accounts. When an email is already on file it
/// shows a compact "verified" state.
class ProfileEmailTile extends StatelessWidget {
  const ProfileEmailTile({super.key});

  static final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null || !user.isPersonal) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final hasEmail = user.hasEmail;
    final accent = hasEmail ? const Color(0xFF00D4AA) : const Color(0xFF6C63FF);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withAlpha(50)),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _openSheet(context),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: accent.withAlpha(30),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    hasEmail
                        ? Icons.verified_rounded
                        : Icons.mark_email_unread_rounded,
                    color: accent,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            l10n.t('profile_email_title'),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (hasEmail) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: accent.withAlpha(36),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                l10n.t('profile_email_verified'),
                                style: TextStyle(
                                  color: accent,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hasEmail
                            ? (user.email ?? '')
                            : l10n.t('profile_email_add_hint'),
                        style: TextStyle(
                          color: hasEmail
                              ? Colors.white.withAlpha(190)
                              : Colors.white.withAlpha(140),
                          fontSize: 11.5,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Icon(
                  hasEmail ? Icons.edit_rounded : Icons.add_circle_outline_rounded,
                  size: 18,
                  color: Colors.white.withAlpha(150),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _EmailVerifySheet(),
    );
  }
}

class _EmailVerifySheet extends StatefulWidget {
  const _EmailVerifySheet();

  @override
  State<_EmailVerifySheet> createState() => _EmailVerifySheetState();
}

class _EmailVerifySheetState extends State<_EmailVerifySheet> {
  final _emailCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String _sentTo = '';

  @override
  void dispose() {
    _emailCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final l10n = AppLocalizations.of(context);
    final email = _emailCtrl.text.trim().toLowerCase();
    if (!ProfileEmailTile._emailRe.hasMatch(email)) {
      setState(() => _error = l10n.t('profile_email_invalid'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    try {
      final res = await api.post(
        ApiConfig.profileEmailSendOtp,
        body: {'email': email},
      );
      if (!mounted) return;
      if (res['success'] == true) {
        setState(() {
          _codeSent = true;
          _sentTo = email;
          _busy = false;
        });
      } else {
        setState(() {
          _busy = false;
          _error = _messageFor(res, l10n);
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.t('profile_email_error');
      });
    }
  }

  Future<void> _verify() async {
    final l10n = AppLocalizations.of(context);
    final code = _codeCtrl.text.trim();
    if (code.length < 4) {
      setState(() => _error = l10n.t('profile_email_code_required'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = context.read<ApiService>();
    final auth = context.read<AuthProvider>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await api.post(
        ApiConfig.profileEmailVerify,
        body: {'email': _sentTo, 'code': code},
      );
      if (!mounted) return;
      if (res['success'] == true) {
        final saved = res['email'];
        auth.applyEmail(saved is String ? saved : _sentTo);
        Navigator.of(context).pop();
        messenger.showSnackBar(SnackBar(
          content: Text(l10n.t('profile_email_verified_msg')),
          backgroundColor: const Color(0xFF00D4AA),
        ));
      } else {
        setState(() {
          _busy = false;
          _error = _messageFor(res, l10n);
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.t('profile_email_error');
      });
    }
  }

  String _messageFor(Map<String, dynamic> res, AppLocalizations l10n) {
    final code = res['code'];
    if (code == 'EMAIL_TAKEN') return l10n.t('profile_email_taken');
    if (code == 'INVALID_CODE') return l10n.t('profile_email_code_invalid');
    final msg = res['message'];
    if (msg is String && msg.trim().isNotEmpty) return msg;
    return l10n.t('profile_email_error');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.t('profile_email_title'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _codeSent
                ? l10n.t('profile_email_code_sent').replaceAll('{{email}}', _sentTo)
                : l10n.t('profile_email_add_hint'),
            style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 13, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (!_codeSent)
            TextField(
              controller: _emailCtrl,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              style: const TextStyle(color: Colors.white),
              decoration: _decoration(
                l10n.t('profile_email_label'),
                'name@example.com',
                Icons.mail_outline_rounded,
              ),
            )
          else
            TextField(
              controller: _codeCtrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: 6,
              ),
              decoration: _decoration(
                l10n.t('profile_email_code_label'),
                '••••••',
                Icons.password_rounded,
              ).copyWith(counterText: ''),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 12)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _busy ? null : (_codeSent ? _verify : _sendCode),
            child: _busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Text(
                    _codeSent
                        ? l10n.t('profile_email_verify')
                        : l10n.t('profile_email_send_code'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
          ),
          if (_codeSent)
            TextButton(
              onPressed: _busy
                  ? null
                  : () {
                      setState(() {
                        _codeSent = false;
                        _codeCtrl.clear();
                        _error = null;
                      });
                    },
              child: Text(
                l10n.t('profile_email_change'),
                style: TextStyle(color: Colors.white.withAlpha(160)),
              ),
            ),
        ],
      ),
    );
  }

  InputDecoration _decoration(String label, String hint, IconData icon) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: Colors.white.withAlpha(150)),
      hintText: hint,
      hintStyle: TextStyle(color: Colors.white.withAlpha(90)),
      filled: true,
      fillColor: const Color(0xFF1B1B3A),
      prefixIcon: Icon(icon, color: const Color(0xFF6C63FF)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
      ),
    );
  }
}
