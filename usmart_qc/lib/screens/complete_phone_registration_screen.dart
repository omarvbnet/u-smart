import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import 'privacy_policy_screen.dart';

/// After phone OTP is verified but no account exists — collect profile only (same OTP used on submit).
class CompletePhoneRegistrationScreen extends StatefulWidget {
  const CompletePhoneRegistrationScreen({
    super.key,
    required this.verifiedPhone,
    required this.verifiedOtpCode,
  });

  final String verifiedPhone;
  final String verifiedOtpCode;

  @override
  State<CompletePhoneRegistrationScreen> createState() =>
      _CompletePhoneRegistrationScreenState();
}

class _CompletePhoneRegistrationScreenState
    extends State<CompletePhoneRegistrationScreen> {
  final _nameCtrl = TextEditingController();
  final _companyCtrl = TextEditingController();
  String _role = 'COMPANY';
  String? _province;
  bool _agreed = false;
  bool _submitting = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _companyCtrl.dispose();
    super.dispose();
  }

  String _signupRoleLabel(AppLocalizations l10n, String code) {
    switch (code) {
      case 'PERSONAL':
        return l10n.t('role_personal');
      case 'COMPANY':
      default:
        return l10n.t('role_company');
    }
  }

  String _signupRoleHintKey(String code) {
    switch (code) {
      case 'PERSONAL':
        return 'reg_role_personal_hint';
      case 'COMPANY':
      default:
        return 'reg_role_company_hint';
    }
  }

  void _showSnack(String msg, {bool error = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFFFF4757) : const Color(0xFF00D4AA),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _submit(AppLocalizations l10n) async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      _showSnack(l10n.t('signup_name'));
      return;
    }
    if (_province == null || _province!.isEmpty) {
      _showSnack(l10n.t('validation_province_required'));
      return;
    }
    if (_role == 'COMPANY' && _companyCtrl.text.trim().isEmpty) {
      _showSnack(l10n.t('validation_company_name_required'));
      return;
    }
    if (!_agreed) {
      _showSnack(l10n.t('privacy_agree_required'));
      return;
    }

    setState(() => _submitting = true);
    final ok = await context.read<AuthProvider>().registerWithPhoneOtp(
          phone: widget.verifiedPhone.trim(),
          code: widget.verifiedOtpCode.trim(),
          name: name,
          email: null,
          role: _role,
          province: _province!,
          company: _role == 'COMPANY' ? _companyCtrl.text.trim() : null,
        );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (!ok) {
      final err = context.read<AuthProvider>().error;
      _showSnack(err ?? l10n.t('login_failed'));
      return;
    }
    // Registration succeeded — a session is now active. Pop everything we
    // pushed on top of the root so the reactive `MaterialApp.home` reveals the
    // dashboard (CompanyDashboardScreen / EngineerDashboardScreen).
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    navigator.popUntil((route) => route.isFirst);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(l10n.t('account_created')),
        backgroundColor: const Color(0xFF00D4AA),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.t('complete_registration_title'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.t('complete_registration_subtitle'),
                style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(10),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.verified_rounded, color: Color(0xFF00D4AA), size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.t('complete_registration_phone_label'),
                            style: TextStyle(
                              color: Colors.white.withAlpha(160),
                              fontSize: 12,
                            ),
                          ),
                          Text(
                            widget.verifiedPhone,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              _field(
                controller: _nameCtrl,
                hint: l10n.t('signup_name'),
                icon: Icons.badge_outlined,
              ),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  l10n.t('signup_role'),
                  style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 13),
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _role,
                    isExpanded: true,
                    dropdownColor: const Color(0xFF1a1a2e),
                    style: const TextStyle(color: Colors.white, fontSize: 15),
                    items: const ['COMPANY', 'PERSONAL']
                        .map(
                          (r) => DropdownMenuItem(
                            value: r,
                            child: Text(_signupRoleLabel(l10n, r)),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _role = v);
                    },
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                l10n.t(_signupRoleHintKey(_role)),
                style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11, height: 1.35),
              ),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  l10n.t('signup_province_required_label'),
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withAlpha(15)),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String?>(
                    value: _province,
                    hint: Text(
                      l10n.t('province_select_hint'),
                      style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 15),
                    ),
                    isExpanded: true,
                    dropdownColor: const Color(0xFF1a1a2e),
                    style: const TextStyle(color: Colors.white, fontSize: 15),
                    items: kIraqProvinces
                        .map(
                          (p) => DropdownMenuItem<String?>(
                            value: p,
                            child: Text(p),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => _province = v),
                  ),
                ),
              ),
              if (_role == 'COMPANY') ...[
                const SizedBox(height: 14),
                _field(
                  controller: _companyCtrl,
                  hint: l10n.t('signup_company_required_hint'),
                  icon: Icons.business_outlined,
                ),
              ],
              const SizedBox(height: 16),
              _privacyRow(l10n),
              const SizedBox(height: 20),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _submitting ? null : () => _submit(l10n),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : Text(
                          l10n.t('signup_submit'),
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _privacyRow(AppLocalizations l10n) {
    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: _agreed,
                onChanged: (v) => setState(() => _agreed = v ?? false),
                activeColor: const Color(0xFF6C63FF),
                fillColor: WidgetStateProperty.resolveWith(
                    (_) => _agreed ? const Color(0xFF6C63FF) : Colors.transparent),
                side: BorderSide(color: Colors.white.withAlpha(100)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Wrap(
                children: [
                  Text(
                    l10n.t('privacy_agree'),
                    style: TextStyle(color: Colors.white.withAlpha(220), fontSize: 13, height: 1.4),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()),
                    ),
                    child: Text(
                      ' ${l10n.t('privacy_view_full')}',
                      style: const TextStyle(
                        color: Color(0xFF6C63FF),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
  }) {
    return TextField(
      controller: controller,
      style: const TextStyle(color: Colors.white, fontSize: 15),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF4B5563)),
        prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
        filled: true,
        fillColor: const Color(0xFF12122A),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.white.withAlpha(15)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }
}
