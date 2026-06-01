import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../providers/private_company_provider.dart';

/// Ticket plans + activation screen for private workspaces.
///
/// Shows the current ticket usage (free tier + purchased credits / unlimited),
/// the three purchasable plans (owner/manager can request one), and an
/// activation-code entry to unlock a plan after the admin issues a code.
class WorkspacePlansScreen extends StatefulWidget {
  const WorkspacePlansScreen({super.key});

  @override
  State<WorkspacePlansScreen> createState() => _WorkspacePlansScreenState();
}

class _WorkspacePlansScreenState extends State<WorkspacePlansScreen> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final pc = context.read<PrivateCompanyProvider>();
      if (pc.billing == null) await pc.refresh();
    });
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestPlan(WorkspaceTicketPlan plan) async {
    final pc = context.read<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    final phoneCtrl = TextEditingController(
      text: pc.myStaffEntry?.phone ?? '',
    );
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.t('pc_plans_request_dialog_title')
            .replaceAll('{{plan}}', _planName(l10n, plan))),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.t('pc_plan_phone_hint')),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: l10n.t('pc_plan_phone_label'),
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.t('cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.t('pc_plans_send')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      phoneCtrl.dispose();
      return;
    }
    final phone = phoneCtrl.text.trim();
    phoneCtrl.dispose();
    setState(() => _busy = true);
    final ok = await pc.requestTicketPlan(plan: plan, phone: phone.isEmpty ? null : phone);
    if (!mounted) return;
    setState(() => _busy = false);
    _showResult(ok, ok ? l10n.t('pc_plan_requested') : (pc.error ?? l10n.t('error_generic')));
  }

  Future<void> _redeem() async {
    final pc = context.read<PrivateCompanyProvider>();
    final l10n = AppLocalizations.of(context);
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() => _busy = true);
    final ok = await pc.redeemActivationCode(code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _codeCtrl.clear();
    _showResult(ok, ok ? l10n.t('pc_activation_success') : (pc.error ?? l10n.t('error_generic')));
  }

  void _showResult(bool ok, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  String _planName(AppLocalizations l10n, WorkspaceTicketPlan plan) {
    switch (plan) {
      case WorkspaceTicketPlan.pack100:
        return l10n.t('pc_plan_pack100_name');
      case WorkspaceTicketPlan.pack1000:
        return l10n.t('pc_plan_pack1000_name');
      case WorkspaceTicketPlan.yearlyUnlimited:
        return l10n.t('pc_plan_yearly_name');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pc = context.watch<PrivateCompanyProvider>();
    final billing = pc.billing;
    final canManage = pc.canManageBilling;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.t('pc_plans_title'))),
      body: RefreshIndicator(
        onRefresh: () => pc.refresh(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _UsageCard(billing: billing, l10n: l10n),
            const SizedBox(height: 16),
            if (!canManage)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  l10n.t('pc_plans_manage_only'),
                  style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.w600),
                ),
              ),
            if (pc.latestPlanRequest?.isPending == true)
              Card(
                color: const Color(0xFFFFF7E6),
                child: ListTile(
                  leading: const Icon(Icons.hourglass_top_rounded, color: Color(0xFFB45309)),
                  title: Text(l10n.t('pc_plan_request_pending')),
                  subtitle: Text(pc.latestPlanRequest!.contactPhone),
                ),
              ),
            const SizedBox(height: 8),
            Text(
              l10n.t('pc_plans_choose'),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            _PlanCard(
              name: l10n.t('pc_plan_pack100_name'),
              desc: l10n.t('pc_plan_pack100_desc'),
              total: l10n.t('pc_plan_pack100_total'),
              icon: Icons.confirmation_number_outlined,
              color: const Color(0xFF6C63FF),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.pack100),
            ),
            _PlanCard(
              name: l10n.t('pc_plan_pack1000_name'),
              desc: l10n.t('pc_plan_pack1000_desc'),
              total: l10n.t('pc_plan_pack1000_total'),
              icon: Icons.workspace_premium_outlined,
              color: const Color(0xFF00B894),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.pack1000),
            ),
            _PlanCard(
              name: l10n.t('pc_plan_yearly_name'),
              desc: l10n.t('pc_plan_yearly_desc'),
              total: null,
              icon: Icons.all_inclusive_rounded,
              color: const Color(0xFFFF7675),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.yearlyUnlimited),
            ),
            const SizedBox(height: 24),
            if (canManage) _activationCard(l10n),
          ],
        ),
      ),
    );
  }

  Widget _activationCard(AppLocalizations l10n) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.vpn_key_rounded, color: Color(0xFF6C63FF)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.t('pc_activation_title'),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(l10n.t('pc_activation_hint'),
                style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            TextField(
              controller: _codeCtrl,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: l10n.t('pc_activation_label'),
                hintText: 'USM-XXXX-XXXX',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _redeem,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: Text(l10n.t('pc_activation_redeem')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.billing, required this.l10n});
  final WorkspaceBilling? billing;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final b = billing;
    final unlimited = b?.unlimited ?? false;
    final remaining = b?.remaining;
    final reached = b?.quotaReached ?? false;
    return Card(
      color: reached ? const Color(0xFFFFF1F0) : const Color(0xFFF5F3FF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              unlimited
                  ? l10n.t('pc_plans_unlimited')
                  : '${remaining ?? '—'}',
              style: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w900,
                color: reached ? const Color(0xFFFF4757) : const Color(0xFF6C63FF),
              ),
            ),
            Text(
              unlimited ? '' : l10n.t('pc_plans_remaining'),
              style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.black87),
            ),
            const SizedBox(height: 8),
            if (b != null && !unlimited)
              Text(
                '${l10n.t('pc_plans_used')}: ${b.used}  ·  ${l10n.t('pc_plans_allowance')}: ${b.allowance ?? '—'}',
                style: const TextStyle(color: Colors.black54),
              ),
            if (unlimited && b?.unlimitedUntil != null)
              Text(
                l10n.t('pc_plans_unlimited_until').replaceAll(
                      '{{date}}',
                      b!.unlimitedUntil!.toLocal().toString().split(' ').first,
                    ),
                style: const TextStyle(color: Colors.black54),
              ),
            const SizedBox(height: 8),
            Text(
              reached ? l10n.t('pc_plans_quota_reached') : l10n.t('pc_plans_free_note'),
              style: TextStyle(
                color: reached ? const Color(0xFFFF4757) : Colors.black54,
                fontWeight: reached ? FontWeight.w700 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.name,
    required this.desc,
    required this.total,
    required this.icon,
    required this.color,
    required this.enabled,
    required this.actionLabel,
    required this.onTap,
  });

  final String name;
  final String desc;
  final String? total;
  final IconData icon;
  final Color color;
  final bool enabled;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.15),
              foregroundColor: color,
              child: Icon(icon),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  Text(desc, style: const TextStyle(color: Colors.black54)),
                  if (total != null)
                    Text(total!, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: enabled ? onTap : null,
              child: Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }
}
