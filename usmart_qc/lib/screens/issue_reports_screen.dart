import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';

class IssueReportsScreen extends StatefulWidget {
  const IssueReportsScreen({super.key});

  @override
  State<IssueReportsScreen> createState() => _IssueReportsScreenState();
}

class _IssueReportsScreenState extends State<IssueReportsScreen> {
  List<Map<String, dynamic>> _reports = [];
  List<Map<String, dynamic>> _types = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<ApiService>();
    try {
      final res = await api.get('/api/issue-reports');
      final tRes = await api.get('/api/issue-reports/types');
      final reports = (res['reports'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
      final types = (tRes['types'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
      if (!mounted) return;
      setState(() {
        _reports = reports;
        _types = types;
      });
    } catch (_) {
      // keep prior state
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openNew() async {
    final l10n = AppLocalizations.of(context);
    final formKey = GlobalKey<FormState>();
    String? typeId;
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setSt) {
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      l10n.t('issue_reports_new'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: typeId,
                      dropdownColor: const Color(0xFF12122A),
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: l10n.t('issue_reports_type'),
                        labelStyle: const TextStyle(color: Colors.white70),
                        border: const OutlineInputBorder(),
                      ),
                      items: _types
                          .map((t) => DropdownMenuItem<String>(
                                value: t['id'] as String?,
                                child: Text(
                                  (t['label'] as String?) ?? '—',
                                  style: const TextStyle(color: Colors.white),
                                ),
                              ))
                          .toList(),
                      onChanged: (v) => setSt(() => typeId = v),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: titleCtrl,
                      maxLength: 160,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: l10n.t('issue_reports_subject'),
                        labelStyle: const TextStyle(color: Colors.white70),
                        border: const OutlineInputBorder(),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty) ? '*' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: descCtrl,
                      maxLines: 5,
                      maxLength: 4000,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: l10n.t('issue_reports_description'),
                        labelStyle: const TextStyle(color: Colors.white70),
                        border: const OutlineInputBorder(),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty) ? '*' : null,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: submitting ? null : () => Navigator.of(ctx).pop(),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: submitting
                              ? null
                              : () async {
                                  if (!(formKey.currentState?.validate() ?? false)) {
                                    return;
                                  }
                                  setSt(() => submitting = true);
                                  final api = context.read<ApiService>();
                                  final messenger = ScaffoldMessenger.of(context);
                                  final res = await api.post(
                                    '/api/issue-reports',
                                    body: {
                                      'typeId': typeId,
                                      'title': titleCtrl.text.trim(),
                                      'description': descCtrl.text.trim(),
                                      'appVersion': '1.0.4+5',
                                      'platform': Theme.of(context).platform.name,
                                    },
                                  );
                                  if (res['success'] == true) {
                                    if (ctx.mounted) Navigator.of(ctx).pop();
                                    messenger.showSnackBar(
                                      SnackBar(
                                        content: Text(l10n.t('issue_reports_submitted')),
                                      ),
                                    );
                                    _load();
                                  } else {
                                    setSt(() => submitting = false);
                                    messenger.showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          res['message'] as String? ??
                                              l10n.t('issue_reports_submit_failed'),
                                        ),
                                      ),
                                    );
                                  }
                                },
                          child: Text(l10n.t('issue_reports_submit')),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        });
      },
    );
  }

  Widget _statusBadge(String status) {
    final l10n = AppLocalizations.of(context);
    late Color color;
    late String label;
    switch (status) {
      case 'IN_PROGRESS':
        color = const Color(0xFF38BDF8);
        label = l10n.t('issue_reports_status_in_progress');
        break;
      case 'COMPLETED':
        color = const Color(0xFF4ADE80);
        label = l10n.t('issue_reports_status_completed');
        break;
      case 'REJECTED':
        color = const Color(0xFFFF6B6B);
        label = l10n.t('issue_reports_status_rejected');
        break;
      default:
        color = const Color(0xFFFBBF24);
        label = l10n.t('issue_reports_status_pending');
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(40),
        border: Border.all(color: color.withAlpha(120)),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
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
          l10n.t('issue_reports_title'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF6C63FF),
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        onPressed: _openNew,
        label: Text(
          l10n.t('issue_reports_new'),
          style: const TextStyle(color: Colors.white),
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _reports.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        l10n.t('issue_reports_empty'),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withAlpha(140)),
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                      itemCount: _reports.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final r = _reports[i];
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFF12122A),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.white.withAlpha(10)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      r['title'] as String? ?? '—',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  _statusBadge(r['status'] as String? ?? 'PENDING'),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                r['typeLabel'] as String? ?? '—',
                                style: TextStyle(
                                  color: Colors.white.withAlpha(120),
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                r['description'] as String? ?? '',
                                style: TextStyle(
                                  color: Colors.white.withAlpha(220),
                                  fontSize: 13,
                                  height: 1.4,
                                ),
                              ),
                              if ((r['adminNote'] as String?)?.isNotEmpty == true) ...[
                                const SizedBox(height: 10),
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF6C63FF).withAlpha(30),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: const Color(0xFF6C63FF).withAlpha(80),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        l10n.t('issue_reports_admin_note'),
                                        style: const TextStyle(
                                          color: Color(0xFF8C7BFF),
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        r['adminNote'] as String,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                              const SizedBox(height: 8),
                              Text(
                                r['createdAt']?.toString() ?? '',
                                style: TextStyle(
                                  color: Colors.white.withAlpha(80),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
