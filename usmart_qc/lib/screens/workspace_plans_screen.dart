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
      backgroundColor: const Color(0xFF0A0A0F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A0F),
        elevation: 0,
        title: Text(
          l10n.t('pc_plans_title'),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        color: const Color(0xFF6C63FF),
        backgroundColor: const Color(0xFF14141F),
        onRefresh: () => pc.refresh(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            _UsageCard(billing: billing, l10n: l10n),
            const SizedBox(height: 16),
            if (!canManage)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFB923C).withAlpha(28),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFB923C).withAlpha(80)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        color: Color(0xFFFBBF24), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.t('pc_plans_manage_only'),
                        style: const TextStyle(
                            color: Color(0xFFFBBF24), fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            if (pc.latestPlanRequest?.isPending == true)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFBBF24).withAlpha(22),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFFBBF24).withAlpha(70)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.hourglass_top_rounded,
                        color: Color(0xFFFBBF24)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.t('pc_plan_request_pending'),
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            pc.latestPlanRequest!.contactPhone,
                            style: TextStyle(
                                color: Colors.white.withAlpha(150), fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 4),
            Text(
              l10n.t('pc_plans_choose'),
              style: const TextStyle(
                  fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white),
            ),
            const SizedBox(height: 12),
            _PlanCard(
              name: l10n.t('pc_plan_pack100_name'),
              desc: l10n.t('pc_plan_pack100_desc'),
              total: l10n.t('pc_plan_pack100_total'),
              icon: Icons.confirmation_number_outlined,
              color: const Color(0xFF8B83FF),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.pack100),
            ),
            _PlanCard(
              name: l10n.t('pc_plan_pack1000_name'),
              desc: l10n.t('pc_plan_pack1000_desc'),
              total: l10n.t('pc_plan_pack1000_total'),
              icon: Icons.workspace_premium_outlined,
              color: const Color(0xFF00D4AA),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              badge: l10n.t('pc_plan_best_value'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.pack1000),
            ),
            _PlanCard(
              name: l10n.t('pc_plan_yearly_name'),
              desc: l10n.t('pc_plan_yearly_desc'),
              total: null,
              icon: Icons.all_inclusive_rounded,
              color: const Color(0xFFFF8A94),
              enabled: canManage && !_busy,
              actionLabel: l10n.t('pc_plan_request'),
              onTap: () => _requestPlan(WorkspaceTicketPlan.yearlyUnlimited),
            ),
            const SizedBox(height: 20),
            if (canManage) _activationCard(l10n),
          ],
        ),
      ),
    );
  }

  Widget _activationCard(AppLocalizations l10n) {
    const accent = Color(0xFF8B83FF);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF14141F),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: accent.withAlpha(30),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.vpn_key_rounded, color: accent, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('pc_activation_title'),
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            l10n.t('pc_activation_hint'),
            style: TextStyle(color: Colors.white.withAlpha(150), height: 1.4),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _codeCtrl,
            textCapitalization: TextCapitalization.characters,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1.2),
            decoration: InputDecoration(
              labelText: l10n.t('pc_activation_label'),
              labelStyle: TextStyle(color: Colors.white.withAlpha(150)),
              hintText: 'USM-XXXX-XXXX',
              hintStyle: TextStyle(color: Colors.white.withAlpha(70)),
              filled: true,
              fillColor: Colors.black.withAlpha(60),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.white.withAlpha(25)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: accent, width: 1.5),
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _busy ? null : _redeem,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check_circle_outline, color: Colors.white),
              label: Text(
                l10n.t('pc_activation_redeem'),
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
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

    final gradient = reached
        ? const [Color(0xFF4A1020), Color(0xFF2A0E18)]
        : unlimited
            ? const [Color(0xFF0E3A33), Color(0xFF12122A)]
            : const [Color(0xFF2A2470), Color(0xFF14142E)];
    final accent = reached
        ? const Color(0xFFFF6B81)
        : unlimited
            ? const Color(0xFF00D4AA)
            : const Color(0xFF8B83FF);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withAlpha(60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                unlimited
                    ? Icons.all_inclusive_rounded
                    : Icons.confirmation_number_rounded,
                color: accent,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                (unlimited ? '' : l10n.t('pc_plans_remaining')).toUpperCase(),
                style: TextStyle(
                  color: Colors.white.withAlpha(170),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            unlimited ? l10n.t('pc_plans_unlimited') : '${remaining ?? '—'}',
            style: TextStyle(
              fontSize: unlimited ? 30 : 44,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              height: 1.05,
            ),
          ),
          const SizedBox(height: 10),
          if (b != null && !unlimited)
            Text(
              '${l10n.t('pc_plans_used')}: ${b.used}   ·   ${l10n.t('pc_plans_allowance')}: ${b.allowance ?? '—'}',
              style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 13,
                  fontWeight: FontWeight.w600),
            ),
          if (unlimited && b?.unlimitedUntil != null)
            Text(
              l10n.t('pc_plans_unlimited_until').replaceAll(
                    '{{date}}',
                    b!.unlimitedUntil!.toLocal().toString().split(' ').first,
                  ),
              style: TextStyle(
                  color: Colors.white.withAlpha(180),
                  fontSize: 13,
                  fontWeight: FontWeight.w600),
            ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withAlpha(60),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              reached
                  ? l10n.t('pc_plans_quota_reached')
                  : l10n.t('pc_plans_free_note'),
              style: TextStyle(
                color: reached ? const Color(0xFFFF8A94) : Colors.white.withAlpha(200),
                fontWeight: reached ? FontWeight.w700 : FontWeight.w500,
                fontSize: 12.5,
              ),
            ),
          ),
        ],
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
    this.badge,
  });

  final String name;
  final String desc;
  final String? total;
  final IconData icon;
  final Color color;
  final bool enabled;
  final String actionLabel;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final highlighted = badge != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF14141F),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: highlighted ? color.withAlpha(140) : Colors.white.withAlpha(15),
          width: highlighted ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (badge != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withAlpha(40),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: color.withAlpha(110)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.star_rounded, color: color, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    badge!.toUpperCase(),
                    style: TextStyle(
                      color: color,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: color.withAlpha(36),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      desc,
                      style: TextStyle(
                          color: Colors.white.withAlpha(160), fontSize: 13),
                    ),
                    if (total != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        total!,
                        style: TextStyle(
                            color: color,
                            fontWeight: FontWeight.w800,
                            fontSize: 13.5),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: enabled ? color : Colors.white.withAlpha(20),
                foregroundColor: Colors.white,
                disabledBackgroundColor: Colors.white.withAlpha(15),
                disabledForegroundColor: Colors.white.withAlpha(90),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: enabled ? onTap : null,
              child: Text(
                actionLabel,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
