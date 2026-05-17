import '../l10n/app_localizations.dart';

String requesterRoleLabel(AppLocalizations l10n, String role) {
  switch (role.trim().toUpperCase()) {
    case 'PERSONAL':
      return l10n.t('role_individual');
    case 'COMPANY':
    case 'COMPANY_OWNER':
      return l10n.t('role_company');
    case 'ENGINEER':
    case 'QUALITY_ENGINEER':
    case 'SUPERVISION_ENGINEER':
      return l10n.t('role_engineer');
    case 'TECHNICIAN':
      return l10n.t('role_technician');
    case 'WORKER':
      return l10n.t('role_worker');
    default:
      return role;
  }
}
