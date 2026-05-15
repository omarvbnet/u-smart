import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company_expense.dart';
import '../models/ticket.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';
import '../providers/tickets_provider.dart';

class WorkspaceTicketExpensesSection extends StatefulWidget {
  const WorkspaceTicketExpensesSection({
    super.key,
    required this.ticket,
    required this.onChanged,
  });

  final Ticket ticket;
  final VoidCallback onChanged;

  @override
  State<WorkspaceTicketExpensesSection> createState() =>
      _WorkspaceTicketExpensesSectionState();
}

class _WorkspaceTicketExpensesSectionState extends State<WorkspaceTicketExpensesSection> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  String? _reason;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  List<String> get _reasons {
    final pc = context.read<PrivateCompanyProvider>();
    final fromWs = pc.workspace?.ticketExpenseReasons ?? const [];
    if (fromWs.isNotEmpty) return fromWs;
    return const [];
  }

  bool get _canAdd {
    if (!widget.ticket.workspaceTicketExpensesEnabled) return false;
    if (widget.ticket.isCompleted) return false;
    final auth = context.read<AuthProvider>();
    final uid = auth.user?.id;
    if (uid == null) return false;
    return uid == widget.ticket.assignedEngineerId ||
        widget.ticket.maintenanceCrewIds.contains(uid);
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text.trim().replaceAll(',', '.'));
    final reason = _reason?.trim() ?? '';
    if (amount == null || amount <= 0 || reason.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter amount and pick a reason.')),
      );
      return;
    }
    final pc = context.read<PrivateCompanyProvider>();
    final ok = await pc.submitTicketExpense(
      ticketId: widget.ticket.id,
      amount: amount,
      reason: reason,
      note: _noteCtrl.text.trim(),
    );
    if (!mounted) return;
    if (ok) {
      _amountCtrl.clear();
      _noteCtrl.clear();
      setState(() => _reason = null);
      await context.read<TicketsProvider>().fetchTicketDetail(widget.ticket.id);
      widget.onChanged();
    }
  }

  Future<void> _deleteLine(TicketExpenseLine line) async {
    final pc = context.read<PrivateCompanyProvider>();
    final ok = await pc.deleteTicketExpense(line.id);
    if (!mounted) return;
    if (ok) {
      await context.read<TicketsProvider>().fetchTicketDetail(widget.ticket.id);
      widget.onChanged();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (!widget.ticket.workspaceTicketExpensesEnabled) {
      return const SizedBox.shrink();
    }

    final lines = widget.ticket.ticketExpenses;
    final total = lines.fold<double>(0, (s, e) => s + e.amount);
    final reasons = _reasons;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 16),
        Text(
          l10n.t('pc_ticket_expenses_title'),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          l10n.t('pc_ticket_expenses_hint'),
          style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11, height: 1.35),
        ),
        if (lines.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            '${l10n.t('pc_expenses_total')}: ${total.toStringAsFixed(2)} IQD',
            style: const TextStyle(
              color: Color(0xFF00D4AA),
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          ...lines.map((e) {
            final when = e.createdAt != null
                ? DateFormat('yyyy-MM-dd HH:mm').format(e.createdAt!.toLocal())
                : '';
            return Card(
              color: const Color(0xFF12122A),
              margin: const EdgeInsets.only(top: 8),
              child: ListTile(
                dense: true,
                title: Text(
                  '${e.amount.toStringAsFixed(2)} ${e.currency} · ${e.reason}',
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
                subtitle: Text(
                  [e.staffName, when, if (e.note != null && e.note!.isNotEmpty) e.note]
                      .whereType<String>()
                      .where((s) => s.isNotEmpty)
                      .join(' · '),
                  style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
                ),
                trailing: _canAdd || context.read<PrivateCompanyProvider>().canManageStaff
                    ? IconButton(
                        icon: const Icon(Icons.delete_outline, color: Colors.white54),
                        onPressed: () => _deleteLine(e),
                      )
                    : null,
              ),
            );
          }),
        ],
        if (_canAdd) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: l10n.t('pc_expenses_amount'),
              labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 8),
          if (reasons.isNotEmpty)
            DropdownButtonFormField<String>(
              value: _reason,
              dropdownColor: const Color(0xFF12122A),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: l10n.t('pc_expenses_reason'),
                labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
              items: reasons
                  .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                  .toList(),
              onChanged: (v) => setState(() => _reason = v),
            )
          else
            Text(
              l10n.t('pc_expenses_no_reasons'),
              style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
            ),
          const SizedBox(height: 8),
          TextField(
            controller: _noteCtrl,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: l10n.t('pc_expenses_note_optional'),
              labelStyle: TextStyle(color: Colors.white.withAlpha(140)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: context.watch<PrivateCompanyProvider>().submitting ? null : _submit,
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.t('pc_expenses_add_line')),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF6C63FF)),
          ),
        ],
      ],
    );
  }
}
