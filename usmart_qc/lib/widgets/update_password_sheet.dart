import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// [mandatoryRecovery]: after email-based reset — user must submit temporary + new password (no OTP).
void showUpdatePasswordSheet(BuildContext context, {bool mandatoryRecovery = false}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    isDismissible: !mandatoryRecovery,
    enableDrag: !mandatoryRecovery,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _UpdatePasswordSheet(mandatoryRecovery: mandatoryRecovery),
  );
}

class _UpdatePasswordSheet extends StatefulWidget {
  const _UpdatePasswordSheet({required this.mandatoryRecovery});

  final bool mandatoryRecovery;

  @override
  State<_UpdatePasswordSheet> createState() => _UpdatePasswordSheetState();
}

class _UpdatePasswordSheetState extends State<_UpdatePasswordSheet> {
  bool _stepSent = false;
  bool _sending = false;
  bool _submitting = false;
  final _codeCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _currentPwCtrl = TextEditingController();
  bool _obscure = true;
  bool _obscureCurrent = true;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    _passwordCtrl.dispose();
    _currentPwCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final res = await api.post(ApiConfig.sendChangePasswordOtp);
      if (mounted) {
        if (res['success'] == true) {
          setState(() {
            _stepSent = true;
            _sending = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).t('code_sent')),
              behavior: SnackBarBehavior.floating,
              backgroundColor: const Color(0xFF00D4AA),
            ),
          );
        } else {
          setState(() {
            _sending = false;
            _error = res['message'] as String? ?? 'Failed';
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = 'Network error';
        });
      }
    }
  }

  Future<void> _submitMandatory() async {
    final current = _currentPwCtrl.text;
    final password = _passwordCtrl.text;
    if (current.isEmpty || password.length < 6) {
      setState(() => _error = AppLocalizations.of(context).t('invalid_code'));
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final res = await api.post(
        ApiConfig.changePassword,
        body: {'currentPassword': current, 'newPassword': password},
      );
      if (!mounted) return;
      if (res['success'] == true) {
        await context.read<AuthProvider>().applyPasswordChangeResponse(res);
        if (!mounted) return;
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).t('password_updated')),
            behavior: SnackBarBehavior.floating,
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
      } else {
        setState(() {
          _submitting = false;
          _error = res['message'] as String? ?? 'Failed';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Network error';
        });
      }
    }
  }

  Future<void> _submitOtp() async {
    final code = _codeCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (code.isEmpty || password.length < 6) {
      setState(() => _error = AppLocalizations.of(context).t('invalid_code'));
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final res = await api.post(ApiConfig.changePassword, body: {
        'code': code,
        'newPassword': password,
      });
      if (!mounted) return;
      if (res['success'] == true) {
        await context.read<AuthProvider>().applyPasswordChangeResponse(res);
        if (!mounted) return;
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).t('password_updated')),
            behavior: SnackBarBehavior.floating,
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
      } else {
        setState(() {
          _submitting = false;
          _error = res['message'] as String? ?? 'Failed';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Network error';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (widget.mandatoryRecovery) {
      return DraggableScrollableSheet(
        initialChildSize: 0.55,
        minChildSize: 0.4,
        maxChildSize: 0.85,
        builder: (_, sc) => Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0A0A1F),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border.all(color: Colors.white.withAlpha(15)),
          ),
          padding: const EdgeInsets.all(24),
          child: ListView(
            controller: sc,
            children: [
              Text(
                l10n.t('update_password'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.t('password_recovery_sheet_hint'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _currentPwCtrl,
                obscureText: _obscureCurrent,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('temporary_password_hint'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscureCurrent ? Icons.visibility_off : Icons.visibility,
                      color: Colors.white54,
                    ),
                    onPressed: () => setState(() => _obscureCurrent = !_obscureCurrent),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('new_password'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_off : Icons.visibility,
                      color: Colors.white54,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFFF4757),
                    fontSize: 13,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _submitting ? null : () => _submitMandatory(),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_rounded, size: 20),
                label: Text(
                  _submitting ? l10n.t('updating') : l10n.t('update_password'),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D4AA),
                  foregroundColor: const Color(0xFF0A0A1F),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.35,
      maxChildSize: 0.7,
      builder: (_, sc) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0A0A1F),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        padding: const EdgeInsets.all(24),
        child: ListView(
          controller: sc,
          children: [
            Text(
              l10n.t('update_password'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.t('update_password_hint'),
              style: TextStyle(
                color: Colors.white.withAlpha(180),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 20),
            if (!_stepSent) ...[
              ElevatedButton.icon(
                onPressed: _sending ? null : () => _sendOtp(),
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.email_outlined, size: 20),
                label: Text(_sending ? l10n.t('sending') : l10n.t('send_code')),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ] else ...[
              TextField(
                controller: _codeCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('reg_code_placeholder'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.t('new_password'),
                  hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                  filled: true,
                  fillColor: const Color(0xFF12122A),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_off : Icons.visibility,
                      color: Colors.white54,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFFF4757),
                    fontSize: 13,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _submitting ? null : () => _submitOtp(),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_rounded, size: 20),
                label: Text(
                  _submitting ? l10n.t('updating') : l10n.t('update_password'),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D4AA),
                  foregroundColor: const Color(0xFF0A0A1F),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
