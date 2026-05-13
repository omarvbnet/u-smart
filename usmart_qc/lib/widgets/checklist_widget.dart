import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import '../l10n/app_localizations.dart';
import '../models/inspection_checklist.dart';

class ChecklistResponseItem {
  final String id;
  final String label;
  final String weight;
  bool checked;
  String? comment;
  /// 'accepted' | 'rejected' — each item must have a result
  String? result;

  ChecklistResponseItem({
    required this.id,
    required this.label,
    this.weight = 'minor',
    this.checked = false,
    this.comment,
    this.result,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'checked': checked,
        'weight': weight,
        if (result != null && result!.isNotEmpty) 'result': result!,
        if (comment != null && comment!.isNotEmpty) 'comment': comment,
      };
}

class ChecklistWidget extends StatefulWidget {
  final List<InspectionChecklist> templates;
  final bool loading;
  final void Function(Map<String, dynamic> response) onComplete;
  /// When set, auto-select this template once [templates] are loaded (e.g. ticket’s attached checklist).
  final String? initialTemplateId;

  const ChecklistWidget({
    super.key,
    required this.templates,
    required this.loading,
    required this.onComplete,
    this.initialTemplateId,
  });

  @override
  State<ChecklistWidget> createState() => _ChecklistWidgetState();
}

class _ChecklistWidgetState extends State<ChecklistWidget> {
  InspectionChecklist? _selected;
  List<ChecklistResponseItem> _items = [];

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (mounted) _applyInitialTemplateIfNeeded();
    });
  }

  @override
  void didUpdateWidget(ChecklistWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTemplateId != oldWidget.initialTemplateId ||
        widget.templates != oldWidget.templates) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted) _applyInitialTemplateIfNeeded();
      });
    }
  }

  void _applyInitialTemplateIfNeeded() {
    final id = widget.initialTemplateId;
    if (id == null || id.isEmpty || _selected != null) return;
    for (final t in widget.templates) {
      if (t.id == id) {
        _selectChecklist(t);
        return;
      }
    }
  }

  void _selectChecklist(InspectionChecklist checklist) {
    setState(() {
      _selected = checklist;
      _items = checklist.items
          .map((i) => ChecklistResponseItem(id: i.id, label: i.label, weight: i.weight))
          .toList();
    });
  }

  void _submit() {
    if (_selected == null) return;
    final itemsWithResult = _items.where((i) => i.result == 'accepted' || i.result == 'rejected').length;
    if (_items.isNotEmpty && itemsWithResult < _items.length) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.t('accept_reject_all', {'count': '${_items.length}'}),
          ),
          backgroundColor: const Color(0xFFFBBF24),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
      return;
    }
    final response = {
      'checklistId': _selected!.id,
      'checklistName': _selected!.name,
      'items': _items.map((i) => i.toJson()).toList(),
      'completedAt': DateTime.now().toIso8601String(),
    };
    widget.onComplete(response);
  }

  int get _checkedCount => _items.where((i) => i.result == 'accepted' || i.result == 'rejected').length;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Text(
            l10n.t('checklist_header'),
            style: TextStyle(
              color: Colors.white.withAlpha(100),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
        ),
        if (widget.loading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Color(0xFF6C63FF)),
              ),
            ),
          )
        else if (_selected == null) ...[
          if (widget.templates.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                l10n.t('no_checklists'),
                style: TextStyle(
                    color: Colors.white.withAlpha(60), fontSize: 13),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: widget.templates
                    .map((t) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: GestureDetector(
                            onTap: () => _selectChecklist(t),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white.withAlpha(5),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                    color: Colors.white.withAlpha(10)),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF6C63FF)
                                          .withAlpha(20),
                                      borderRadius:
                                          BorderRadius.circular(10),
                                    ),
                                    child: const Icon(
                                        Icons.checklist_rounded,
                                        color: Color(0xFF8B83FF),
                                        size: 18),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(t.name,
                                            style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 14,
                                                fontWeight:
                                                    FontWeight.w600)),
                                        Text(
                                            '${t.items.length} ${l10n.t('items')}',
                                            style: TextStyle(
                                                color: Colors.white
                                                    .withAlpha(60),
                                                fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.arrow_forward_ios_rounded,
                                      color: Color(0xFF4B5563), size: 16),
                                ],
                              ),
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
        ] else ...[
          // Selected checklist header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => setState(() {
                    _selected = null;
                    _items = [];
                  }),
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(8),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white, size: 16),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(_selected!.name,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                ),
                Text(
                  '$_checkedCount / ${_items.length}',
                  style: const TextStyle(
                    color: Color(0xFF00D4AA),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Progress bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: _items.isEmpty ? 0 : _checkedCount / _items.length,
                minHeight: 4,
                backgroundColor: Colors.white.withAlpha(10),
                valueColor: const AlwaysStoppedAnimation(Color(0xFF00D4AA)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          // Items with Accept / Reject
          ..._items.asMap().entries.map((entry) {
            final idx = entry.key;
            final item = entry.value;
            final isAccepted = item.result == 'accepted';
            final isRejected = item.result == 'rejected';
            return Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isAccepted
                      ? const Color(0xFF00D4AA).withAlpha(12)
                      : isRejected
                          ? const Color(0xFFFF4757).withAlpha(12)
                          : Colors.white.withAlpha(3),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isAccepted
                        ? const Color(0xFF00D4AA).withAlpha(35)
                        : isRejected
                            ? const Color(0xFFFF4757).withAlpha(35)
                            : Colors.white.withAlpha(8),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.label,
                        style: TextStyle(
                          color: isAccepted || isRejected
                              ? Colors.white
                              : Colors.white.withAlpha(180),
                          fontSize: 14,
                          decoration: isRejected
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () => setState(() {
                        _items[idx].result = 'accepted';
                        _items[idx].checked = true;
                      }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: isAccepted
                              ? const Color(0xFF00D4AA)
                              : const Color(0xFF00D4AA).withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle,
                              size: 16,
                              color: isAccepted
                                  ? Colors.white
                                  : const Color(0xFF00D4AA),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              l10n.t('accept'),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isAccepted
                                    ? Colors.white
                                    : const Color(0xFF00D4AA),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () => setState(() {
                        _items[idx].result = 'rejected';
                        _items[idx].checked = false;
                      }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: isRejected
                              ? const Color(0xFFFF4757)
                              : const Color(0xFFFF4757).withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.cancel,
                              size: 16,
                              color: isRejected
                                  ? Colors.white
                                  : const Color(0xFFFF6B81),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              l10n.t('reject'),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isRejected
                                    ? Colors.white
                                    : const Color(0xFFFF6B81),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 12),
          // Submit button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GestureDetector(
              onTap: _submit,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF00D4AA), Color(0xFF00B894)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    l10n.t('complete_close'),
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),
      ],
    );
  }
}
