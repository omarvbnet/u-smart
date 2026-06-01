import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/registration_request_provider.dart';
import '../services/api_service.dart';

/// Lets a PERSONAL (individual) account request admin approval to become COMPANY.
class PersonalCompanyUpgradeCard extends StatefulWidget {
  const PersonalCompanyUpgradeCard({super.key});

  @override
  State<PersonalCompanyUpgradeCard> createState() =>
      _PersonalCompanyUpgradeCardState();
}

class _PersonalCompanyUpgradeCardState extends State<PersonalCompanyUpgradeCard> {
  final _companyCtrl = TextEditingController();
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _evidenceUrl;
  String? _pendingCompany;
  String? _rejectionReason;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadStatus());
  }

  @override
  void dispose() {
    _companyCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final data = await api.get(ApiConfig.requesterRoleUpgrade);
      if (!mounted) return;
      if (data['success'] == true && data['eligible'] == true) {
        final pending = data['pending'] as Map<String, dynamic>?;
        final rejected = data['lastRejected'] as Map<String, dynamic>?;
        if (pending == null) {
          await context.read<AuthProvider>().refreshUser();
        }
        setState(() {
          _pendingCompany = pending?['companyName'] as String?;
          _rejectionReason = rejected?['rejectionReason'] as String?;
          _loading = false;
        });
        return;
      }
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _pickEvidence() async {
    final l10n = AppLocalizations.of(context);
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final reg = context.read<RegistrationRequestProvider>();
    String? url;
    if (file.bytes != null) {
      url = await reg.uploadEvidenceFromBytes(
        file.bytes!,
        file.name,
      );
    } else if (file.path != null) {
      url = await reg.uploadEvidence(file.path!);
    }
    if (!mounted) return;
    if (url == null) {
      setState(() => _error = reg.error ?? l10n.t('upload_failed'));
      return;
    }
    setState(() {
      _evidenceUrl = url;
      _error = null;
    });
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final company = _companyCtrl.text.trim();
    if (company.isEmpty) {
      setState(() => _error = l10n.t('validation_company_name_required'));
      return;
    }
    if (_evidenceUrl == null || _evidenceUrl!.isEmpty) {
      setState(() => _error = l10n.t('reg_upload_evidence'));
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final data = await api.post(
        ApiConfig.requesterRoleUpgrade,
        body: {
          'companyName': company,
          'evidenceUrl': _evidenceUrl,
        },
      );
      if (!mounted) return;
      if (data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('role_upgrade_submitted')),
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
        await _loadStatus();
        setState(() => _submitting = false);
        return;
      }
      setState(() {
        _submitting = false;
        _error = data['message']?.toString() ?? l10n.t('login_failed');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final auth = context.watch<AuthProvider>();
    if (!auth.isPersonal) return const SizedBox.shrink();
    // Requesting a company account requires an email on file; the
    // ProfileEmailTile prompts the user to add and verify one first.
    if (auth.user?.hasEmail != true) return const SizedBox.shrink();
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    if (_pendingCompany != null) {
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0xFFFBBF24).withAlpha(25),
          border: Border.all(color: const Color(0xFFFBBF24).withAlpha(80)),
        ),
        child: Row(
          children: [
            const Icon(Icons.hourglass_top_rounded, color: Color(0xFFFBBF24)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '${l10n.t('role_upgrade_pending')}: $_pendingCompany',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF12122A),
        border: Border.all(color: const Color(0xFF6C63FF).withAlpha(50)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.t('role_upgrade_to_company'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.t('role_upgrade_to_company_hint'),
            style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
          ),
          if (_rejectionReason != null && _rejectionReason!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '${l10n.t('role_upgrade_rejected')}: $_rejectionReason',
              style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 12),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _companyCtrl,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: l10n.t('role_upgrade_company_name'),
              labelStyle: TextStyle(color: Colors.white.withAlpha(120)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.white.withAlpha(30)),
              ),
              focusedBorder: const OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
                borderSide: BorderSide(color: Color(0xFF6C63FF)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _submitting ? null : _pickEvidence,
            icon: const Icon(Icons.upload_file_rounded, size: 18),
            label: Text(
              _evidenceUrl != null
                  ? l10n.t('reg_file_uploaded')
                  : l10n.t('reg_upload_evidence'),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF00D4AA),
              side: BorderSide(color: const Color(0xFF00D4AA).withAlpha(80)),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 12)),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: _submitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(l10n.t('role_upgrade_submit')),
          ),
        ],
      ),
    );
  }
}
