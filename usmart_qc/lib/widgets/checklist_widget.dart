import 'package:flutter/material.dart';
import '../models/inspection_checklist.dart';

class ChecklistResponseItem {
  final String id;
  final String label;
  bool checked;
  String? note;

  ChecklistResponseItem({
    required this.id,
    required this.label,
    this.checked = false,
    this.note,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'checked': checked,
        if (note != null && note!.isNotEmpty) 'note': note,
      };
}

class ChecklistWidget extends StatefulWidget {
  final List<InspectionChecklist> templates;
  final bool loading;
  final void Function(Map<String, dynamic> response) onComplete;

  const ChecklistWidget({
    super.key,
    required this.templates,
    required this.loading,
    required this.onComplete,
  });

  @override
  State<ChecklistWidget> createState() => _ChecklistWidgetState();
}

class _ChecklistWidgetState extends State<ChecklistWidget> {
  InspectionChecklist? _selected;
  List<ChecklistResponseItem> _items = [];

  void _selectChecklist(InspectionChecklist checklist) {
    setState(() {
      _selected = checklist;
      _items = checklist.items
          .map((i) => ChecklistResponseItem(id: i.id, label: i.label))
          .toList();
    });
  }

  void _submit() {
    if (_selected == null) return;
    final response = {
      'checklistId': _selected!.id,
      'checklistName': _selected!.name,
      'items': _items.map((i) => i.toJson()).toList(),
      'completedAt': DateTime.now().toIso8601String(),
    };
    widget.onComplete(response);
  }

  int get _checkedCount => _items.where((i) => i.checked).length;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Text(
            'INSPECTION CHECKLIST',
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
                'No checklists available. Contact admin to create templates.',
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
                                            '${t.items.length} items',
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
          // Items
          ..._items.asMap().entries.map((entry) {
            final i = entry.key;
            final item = entry.value;
            return Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
              child: GestureDetector(
                onTap: () => setState(() => _items[i].checked = !item.checked),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: item.checked
                        ? const Color(0xFF00D4AA).withAlpha(8)
                        : Colors.white.withAlpha(3),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: item.checked
                          ? const Color(0xFF00D4AA).withAlpha(30)
                          : Colors.white.withAlpha(8),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color: item.checked
                              ? const Color(0xFF00D4AA)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: item.checked
                                ? const Color(0xFF00D4AA)
                                : const Color(0xFF4B5563),
                            width: 2,
                          ),
                        ),
                        child: item.checked
                            ? const Icon(Icons.check,
                                color: Colors.white, size: 14)
                            : null,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          item.label,
                          style: TextStyle(
                            color: item.checked
                                ? Colors.white
                                : Colors.white.withAlpha(150),
                            fontSize: 14,
                            decoration: item.checked
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
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
                child: const Center(
                  child: Text(
                    'Complete & Close Ticket',
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
