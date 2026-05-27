import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../l10n/app_localizations.dart';

/// "About" screen shown from every dashboard profile tab.
/// Pure local content — does not depend on any new server endpoint, so older
/// app builds can ship the same UI without breaking backward compatibility.
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  static const String supportEmail = 'support@usmart-iot.com';
  static const String websiteUrl = 'https://proviser.usmart-iot.com';
  static const String appVersion = '1.0.4+5';

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
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
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          l10n.t('profile_about'),
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
              Center(
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: const Icon(Icons.shield_outlined,
                      color: Colors.white, size: 40),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: Text(
                  l10n.t('profile_about'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  '${l10n.t('app_version')} (build $appVersion)',
                  style: TextStyle(
                    color: Colors.white.withAlpha(140),
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF12122A),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF6C63FF).withAlpha(40)),
                ),
                child: Text(
                  l10n.t('profile_about_body'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(220),
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                tileColor: const Color(0xFF12122A),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                leading: const Icon(Icons.business_rounded, color: Color(0xFF00D4AA)),
                title: Text(l10n.t('profile_about_company'),
                    style: const TextStyle(color: Colors.white)),
                subtitle: Text(websiteUrl,
                    style: TextStyle(color: Colors.white.withAlpha(140))),
                onTap: () => _open(websiteUrl),
                trailing: const Icon(Icons.open_in_new_rounded,
                    color: Colors.white70, size: 18),
              ),
              const SizedBox(height: 12),
              ListTile(
                tileColor: const Color(0xFF12122A),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                leading: const Icon(Icons.mail_outline_rounded, color: Color(0xFF6C63FF)),
                title: Text(l10n.t('profile_about_contact'),
                    style: const TextStyle(color: Colors.white)),
                subtitle: Text(supportEmail,
                    style: TextStyle(color: Colors.white.withAlpha(140))),
                onTap: () => _open('mailto:$supportEmail'),
                trailing: const Icon(Icons.open_in_new_rounded,
                    color: Colors.white70, size: 18),
              ),
              const SizedBox(height: 24),
              Center(
                child: Text(
                  '© ${DateTime.now().year} U Smart Technologies',
                  style: TextStyle(
                      color: Colors.white.withAlpha(80), fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
