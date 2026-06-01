import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';

/// Full-screen Privacy Policy & Terms of Service for Provisor.
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          l10n.t('privacy_policy_title'),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _section(l10n.t('privacy_section_1_title'), l10n.t('privacy_section_1_body')),
              const SizedBox(height: 24),
              _section(l10n.t('privacy_section_2_title'), l10n.t('privacy_section_2_body')),
              const SizedBox(height: 24),
              _section(l10n.t('privacy_section_3_title'), l10n.t('privacy_section_3_body')),
              const SizedBox(height: 24),
              _section(l10n.t('privacy_section_4_title'), l10n.t('privacy_section_4_body')),
              const SizedBox(height: 24),
              _section(l10n.t('privacy_section_5_title'), l10n.t('privacy_section_5_body')),
              const SizedBox(height: 24),
              _section(l10n.t('privacy_section_6_title'), l10n.t('privacy_section_6_body')),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(String title, String body) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: Color(0xFF6C63FF),
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          body,
          style: TextStyle(
            color: Colors.white.withAlpha(230),
            fontSize: 14,
            height: 1.6,
          ),
        ),
      ],
    );
  }
}
