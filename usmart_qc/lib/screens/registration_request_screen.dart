import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/registration_request_provider.dart';

/// Modal for requesting registration (Company or Engineer).
/// Mirrors the web login page flow: role selection → form + evidence upload → submit.
void showRegistrationRequestModal(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, scrollController) => const _RegistrationRequestContent(),
    ),
  );
}

class _RegistrationRequestContent extends StatefulWidget {
  const _RegistrationRequestContent();

  @override
  State<_RegistrationRequestContent> createState() =>
      _RegistrationRequestContentState();
}

class _RegistrationRequestContentState extends State<_RegistrationRequestContent> {
  int _step = 0; // 0=role, 1=form
  String? _role; // COMPANY | ENGINEER
  final _legalName = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String? _evidenceUrl;
  bool _success = false;

  @override
  void dispose() {
    _legalName.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      allowMultiple: false,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    if (!mounted) return;
    final file = result.files.single;
    final path = file.path;
    final bytes = file.bytes;
    final filename = file.name;

    final provider = context.read<RegistrationRequestProvider>();
    String? url;
    // Prefer bytes over path - iOS paths can be inaccessible after picker dismisses
    if (bytes != null && bytes.isNotEmpty && filename.isNotEmpty) {
      url = await provider.uploadEvidenceFromBytes(bytes, filename);
    } else if (path != null && path.isNotEmpty) {
      url = await provider.uploadEvidence(path);
    }
    if (url != null && mounted) {
      setState(() => _evidenceUrl = url);
    } else if (mounted && provider.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error!),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (_evidenceUrl == null || _evidenceUrl!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('reg_evidence_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    final provider = context.read<RegistrationRequestProvider>();
    final ok = await provider.submit(
      legalName: _legalName.text.trim(),
      phone: _phone.text.trim(),
      email: _email.text.trim(),
      evidenceUrl: _evidenceUrl!,
      role: _role!,
    );

    if (!mounted) return;
    if (ok) {
      setState(() => _success = true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? l10n.t('reg_submit_failed')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A1F),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(60),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                Text(
                  l10n.t('reg_request_title'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                if (!_success)
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Color(0xFF6B7280)),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              child: _success ? _buildSuccess(l10n) : _buildForm(l10n),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccess(AppLocalizations l10n) {
    return Column(
      children: [
        const SizedBox(height: 32),
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: const Color(0xFF00D4AA).withAlpha(30),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check_circle_rounded, color: Color(0xFF00D4AA), size: 36),
        ),
        const SizedBox(height: 20),
        Text(
          l10n.t('reg_success_title'),
          style: const TextStyle(
            color: Color(0xFF00D4AA),
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          l10n.t('reg_success_hint'),
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 14),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: Text(l10n.t('ok')),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AppLocalizations l10n) {
    if (_step == 0) {
      return _buildRoleStep(l10n);
    }
    return _buildFormStep(l10n);
  }

  Widget _buildRoleStep(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.t('reg_choose_role'),
          style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 14),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _RoleCard(
                icon: Icons.business_rounded,
                label: l10n.t('role_company'),
                hint: l10n.t('reg_role_company_hint'),
                onTap: () {
                  setState(() {
                    _role = 'COMPANY';
                    _step = 1;
                  });
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _RoleCard(
                icon: Icons.engineering_rounded,
                label: l10n.t('role_engineer'),
                hint: l10n.t('reg_role_engineer_hint'),
                onTap: () {
                  setState(() {
                    _role = 'ENGINEER';
                    _step = 1;
                  });
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFormStep(AppLocalizations l10n) {
    final provider = context.watch<RegistrationRequestProvider>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton(
          onPressed: () => setState(() => _step = 0),
          child: Text(
            '← ${l10n.t('reg_back')} (${_role == 'COMPANY' ? l10n.t('role_company') : l10n.t('role_engineer')})',
            style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 13),
          ),
        ),
        const SizedBox(height: 8),
        _TextField(
          controller: _legalName,
          label: l10n.t('reg_legal_name'),
          hint: l10n.t('reg_legal_name_hint'),
          icon: Icons.person_outline_rounded,
          keyboardType: TextInputType.name,
        ),
        const SizedBox(height: 12),
        _TextField(
          controller: _phone,
          label: l10n.t('reg_phone'),
          hint: '+964...',
          icon: Icons.phone_outlined,
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 12),
        _TextField(
          controller: _email,
          label: l10n.t('reg_email'),
          hint: 'email@example.com',
          icon: Icons.email_outlined,
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 16),
        Text(
          l10n.t('reg_evidence_label'),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          l10n.t('reg_evidence_hint'),
          style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
        ),
        const SizedBox(height: 8),
        if (_evidenceUrl != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF00D4AA).withAlpha(20),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF00D4AA).withAlpha(60)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF00D4AA), size: 22),
                const SizedBox(width: 10),
                Text(
                  l10n.t('reg_file_uploaded'),
                  style: const TextStyle(color: Color(0xFF00D4AA), fontSize: 14),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => setState(() => _evidenceUrl = null),
                  child: Text(l10n.t('reg_remove'), style: const TextStyle(color: Color(0xFFFF4757), fontSize: 12)),
                ),
              ],
            ),
          ),
        ] else
          InkWell(
            onTap: provider.uploading ? null : _pickAndUploadFile,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(8),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withAlpha(20), style: BorderStyle.solid),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (provider.uploading)
                    const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6C63FF)),
                    )
                  else
                    const Icon(Icons.upload_file_rounded, color: Color(0xFF6C63FF), size: 28),
                  const SizedBox(width: 12),
                  Text(
                    provider.uploading ? l10n.t('reg_uploading') : l10n.t('reg_upload_evidence'),
                    style: TextStyle(
                      color: provider.uploading ? Colors.white.withAlpha(120) : Colors.white,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: provider.submitting ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: provider.submitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(l10n.t('reg_submit')),
          ),
        ),
      ],
    );
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String hint;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.label,
    required this.hint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Column(
          children: [
            Icon(icon, color: const Color(0xFF6C63FF), size: 36),
            const SizedBox(height: 12),
            Text(
              label,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType keyboardType;

  const _TextField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withAlpha(15)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF6C63FF)),
            ),
          ),
        ),
      ],
    );
  }
}
