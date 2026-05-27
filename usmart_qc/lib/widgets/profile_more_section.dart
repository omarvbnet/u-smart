import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../l10n/app_localizations.dart';
import '../screens/about_screen.dart';
import '../screens/issue_reports_screen.dart';
import 'profile_contact_email_tile.dart';

/// Extra tiles attached to every dashboard profile tab (engineer, company,
/// dashboard) for the v1.0.4 update:
///   - Contact us via WhatsApp
///   - About Proviser
///   - Report a problem (issue reports)
///
/// Each tile is self-contained: tapping does not require any new server
/// support to be present (server endpoints used here are additive and
/// backwards-compatible with older app builds).
class ProfileMoreSection extends StatelessWidget {
  const ProfileMoreSection({super.key});

  static const String supportWhatsAppPhone = '+9647760777659';

  Future<void> _openWhatsApp(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final phone = supportWhatsAppPhone.replaceAll(RegExp(r'[^0-9]'), '');
    final messenger = ScaffoldMessenger.of(context);
    final uri = Uri.parse('https://wa.me/$phone');
    final ok = await canLaunchUrl(uri);
    if (!ok) {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.t('whatsapp_unavailable'))),
      );
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(
            l10n.t('profile_section_more'),
            style: TextStyle(
              color: Colors.white.withAlpha(120),
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
            ),
          ),
        ),
        // Contact email — only renders when the server (or fallback role
        // logic) marks the user as eligible (COMPANY / private workspace).
        const ProfileContactEmailTile(),
        _tile(
          context,
          icon: Icons.chat_rounded,
          tint: const Color(0xFF25D366),
          title: l10n.t('profile_contact_whatsapp'),
          subtitle: l10n.t('profile_contact_whatsapp_hint'),
          onTap: () => _openWhatsApp(context),
        ),
        _tile(
          context,
          icon: Icons.info_outline_rounded,
          tint: const Color(0xFF6C63FF),
          title: l10n.t('profile_about'),
          subtitle: l10n.t('profile_about_company'),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AboutScreen()),
          ),
        ),
        _tile(
          context,
          icon: Icons.bug_report_rounded,
          tint: const Color(0xFFFBBF24),
          title: l10n.t('profile_report_issue'),
          subtitle: l10n.t('profile_report_issue_hint'),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const IssueReportsScreen()),
          ),
        ),
      ],
    );
  }

  Widget _tile(
    BuildContext context, {
    required IconData icon,
    required Color tint,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tint.withAlpha(20)),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: tint.withAlpha(20),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: tint, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
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
                          color: Colors.white.withAlpha(120),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 14,
                  color: Colors.white.withAlpha(100),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
