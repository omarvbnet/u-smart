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
    this.onTicketUpdated,
  });

  final Ticket ticket;
  final ValueChanged<Ticket?>? onTicketUpdated;

  @override
  State<WorkspaceTicketExpensesSection> createState() => _WorkspaceTicketExpensesSectionState();
}

class _WorkspaceTicketExpensesSectionState extends State<WorkspaceTicketExpensesSection> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  final _reasonFreeformCtrl = TextEditingController();
  String? _reason;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    _reasonFreeformCtrl.dispose();
    super.dispose();
  }

  List<String> get _reasons {
    final fromTicket = widget.ticket.workspaceTicketExpenseReasons;
    if (fromTicket.isNotEmpty) return fromTicket;
    final pc = context.read<PrivateCompanyProvider>();
    return pc.workspace?.ticketExpenseReasons ?? const [];
  }

  bool get _canAdd {
    if (!widget.ticket.workspaceTicketExpensesEnabled) return false;
    if (widget.ticket.isCompleted) return false;
    final auth = context.read<AuthProvider>();
    final uid = auth.user?.id;
    if (uid == null) return false;
    return uid == widget.ticket.assignedEngineerId || widget.ticket.maintenanceCrewIds.contains(uid);
  }

  /// Only the assigned ticket lead may delete expense lines (not crew or managers).
  bool get _isTicketLead {
    final auth = context.read<AuthProvider>();
    final uid = auth.user?.id;
    if (uid == null) return false;
    return uid == widget.ticket.assignedEngineerId;
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text.trim().replaceAll(',', '.'));
    final reason = _reason?.trim() ?? '';
    if (amount == null || amount <= 0 || reason.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).t('pc_ticket_expenses_validation')),
          backgroundColor: const Color(0xFF6C63FF),
        ),
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
      _reasonFreeformCtrl.clear();
      setState(() => _reason = null);
      final updated = await context.read<TicketsProvider>().fetchTicketDetail(widget.ticket.id);
      widget.onTicketUpdated?.call(updated);
    }
  }

  Future<void> _deleteLine(TicketExpenseLine line) async {
    final pc = context.read<PrivateCompanyProvider>();
    final ok = await pc.deleteTicketExpense(line.id);
    if (!mounted) return;
    if (ok) {
      final updated = await context.read<TicketsProvider>().fetchTicketDetail(widget.ticket.id);
      widget.onTicketUpdated?.call(updated);
    }
  }

  static OutlineInputBorder _fieldBorder() {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
    );
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

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            const Color(0xFF6C63FF).withValues(alpha: 0.16),
            const Color(0xFF12122A).withValues(alpha: 0.85),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF00D4AA).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.request_quote_rounded, color: Color(0xFF00D4AA), size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.t('pc_ticket_expenses_title'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        l10n.t('pc_ticket_expenses_hint'),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.72),
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF00D4AA).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF00D4AA).withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.summarize_rounded, color: Color(0xFF00D4AA), size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${l10n.t('pc_expenses_total')}: ${total.toStringAsFixed(2)} IQD',
                      style: TextStyle(
                        color: lines.isEmpty
                            ? Colors.white.withValues(alpha: 0.55)
                            : const Color(0xFF00D4AA),
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (lines.isNotEmpty) ...[
              const SizedBox(height: 10),
              ...lines.map((e) {
                final when = e.createdAt != null ? DateFormat('yyyy-MM-dd HH:mm').format(e.createdAt!.toLocal()) : '';
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    title: Text(
                      '${e.amount.toStringAsFixed(2)} ${e.currency} · ${e.reason}',
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      [e.staffName, when, if (e.note != null && e.note!.isNotEmpty) e.note]
                          .whereType<String>()
                          .where((s) => s.isNotEmpty)
                          .join(' · '),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11),
                    ),
                    trailing: !widget.ticket.isCompleted && _isTicketLead
                        ? IconButton(
                            icon: const Icon(Icons.delete_outline_rounded, color: Colors.white54),
                            onPressed: () => _deleteLine(e),
                          )
                        : null,
                  ),
                );
              }),
            ],
            if (_canAdd) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                decoration: InputDecoration(
                  labelText: l10n.t('pc_expenses_amount'),
                  labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.65)),
                  filled: true,
                  fillColor: Colors.black.withValues(alpha: 0.2),
                  enabledBorder: _fieldBorder(),
                  focusedBorder: _fieldBorder().copyWith(
                    borderSide: const BorderSide(color: Color(0xFF6C63FF)),
                  ),
                  border: _fieldBorder(),
                ),
              ),
              const SizedBox(height: 10),
              if (reasons.isNotEmpty)
                DropdownButtonFormField<String>(
                  value: _reason,
                  dropdownColor: const Color(0xFF1a1a2e),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: l10n.t('pc_expenses_reason'),
                    labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.65)),
                    filled: true,
                    fillColor: Colors.black.withValues(alpha: 0.2),
                    enabledBorder: _fieldBorder(),
                    focusedBorder: _fieldBorder().copyWith(
                      borderSide: const BorderSide(color: Color(0xFF6C63FF)),
                    ),
                    border: _fieldBorder(),
                  ),
                  items: reasons.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                  onChanged: (v) => setState(() => _reason = v),
                )
              else
                TextField(
                  controller: _reasonFreeformCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: l10n.t('pc_expenses_reason_freeform'),
                    labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.65)),
                    filled: true,
                    fillColor: Colors.black.withValues(alpha: 0.2),
                    enabledBorder: _fieldBorder(),
                    focusedBorder: _fieldBorder().copyWith(
                      borderSide: const BorderSide(color: Color(0xFF6C63FF)),
                    ),
                    border: _fieldBorder(),
                  ),
                ),
              const SizedBox(height: 10),
              TextField(
                controller: _noteCtrl,
                style: const TextStyle(color: Colors.white),
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: l10n.t('pc_expenses_note_optional'),
                  labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.65)),
                  filled: true,
                  fillColor: Colors.black.withValues(alpha: 0.2),
                  enabledBorder: _fieldBorder(),
                  focusedBorder: _fieldBorder().copyWith(
                    borderSide: const BorderSide(color: Color(0xFF6C63FF)),
                  ),
                  border: _fieldBorder(),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: context.watch<PrivateCompanyProvider>().submitting ? null : _submit,
                icon: const Icon(Icons.add_rounded),
                label: Text(l10n.t('pc_expenses_add_line')),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
