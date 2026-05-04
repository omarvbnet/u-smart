import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../services/api_service.dart';

/// Staff, checklists, and billing for company owners and coordinators (same APIs as web).
class CompanyProvisorHubScreen extends StatefulWidget {
  const CompanyProvisorHubScreen({super.key});

  @override
  State<CompanyProvisorHubScreen> createState() => _CompanyProvisorHubScreenState();
}

class _CompanyProvisorHubScreenState extends State<CompanyProvisorHubScreen> {
  int _tab = 0;
  String? _message;
  bool _loading = false;
  List<dynamic> _staff = [];
  List<dynamic> _checklists = [];
  Map<String, dynamic>? _billing;

  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  String _role = 'TECHNICIAN';

  final _clName = TextEditingController();
  String _clCategory = 'QUALITY';
  final _clTech = TextEditingController(text: 'inspection');

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _clName.dispose();
    _clTech.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<ApiService>();
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final s = await api.get(ApiConfig.companyStaff);
      final c = await api.get(ApiConfig.inspectionChecklists);
      final b = await api.getSafe(ApiConfig.companyBillingPlan);
      if (mounted) {
        setState(() {
          _staff = (s['users'] as List<dynamic>?) ?? [];
          _checklists = (c['checklists'] as List<dynamic>?) ?? [];
          _billing = b != null && b['success'] == true ? (b['billing'] as Map<String, dynamic>?) : null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _message = 'Could not load data. Use a company owner or coordinator account.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _createStaff() async {
    final api = context.read<ApiService>();
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final data = await api.post(ApiConfig.companyStaff, body: {
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'email': _email.text.trim(),
        'role': _role,
      });
      if (data['success'] == true) {
        final cred = data['credentials'] as Map<String, dynamic>?;
        setState(() {
          _message =
              'Created. Username: ${cred?['username'] ?? ''}  Password: ${cred?['temporaryPassword'] ?? ''}';
          _firstName.clear();
          _lastName.clear();
          _email.clear();
        });
        await _load();
      } else {
        setState(() => _message = data['message']?.toString() ?? 'Failed');
      }
    } catch (_) {
      setState(() => _message = 'Failed to create staff');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createChecklist() async {
    final api = context.read<ApiService>();
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final types = _clTech.text
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .where((s) => s.isNotEmpty)
          .toList();
      final data = await api.post(ApiConfig.inspectionChecklists, body: {
        'name': _clName.text.trim(),
        'taskCategory': _clCategory,
        'techniqueTypes': types,
        'items': [
          {'label': 'First checklist item (edit via web admin if needed)', 'weight': 'minor'}
        ],
      });
      if (data['success'] == true) {
        setState(() {
          _message = 'Checklist saved';
          _clName.clear();
        });
        await _load();
      } else {
        setState(() => _message = data['message']?.toString() ?? 'Failed');
      }
    } catch (_) {
      setState(() => _message = 'Failed to save checklist');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setPlan(String plan) async {
    final api = context.read<ApiService>();
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final data = await api.patch(ApiConfig.companyBillingPlan, body: {'plan': plan});
      if (data['success'] == true) {
        setState(() => _message = 'Plan set to $plan');
        await _load();
      } else {
        setState(() => _message = data['message']?.toString() ?? 'Failed');
      }
    } catch (_) {
      setState(() => _message = 'Only company owner can change billing on the server.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A1F),
        title: const Text('Company hub'),
      ),
      body: _loading && _staff.isEmpty && _checklists.isEmpty
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    for (var i = 0; i < 3; i++)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(['Staff', 'Checklists', 'Billing'][i]),
                          selected: _tab == i,
                          onSelected: (_) => setState(() => _tab = i),
                          selectedColor: const Color(0xFF6C63FF),
                          labelStyle: TextStyle(color: _tab == i ? Colors.white : Colors.white70),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_message!, style: const TextStyle(color: Color(0xFFFBBF24))),
                  ),
                if (_tab == 0) ...[
                  Text('Team (${_staff.length})', style: const TextStyle(color: Colors.white70, fontSize: 16)),
                  const SizedBox(height: 8),
                  ..._staff.map((u) {
                    final m = u as Map<String, dynamic>;
                    return ListTile(
                      dense: true,
                      title: Text(m['username']?.toString() ?? '', style: const TextStyle(color: Colors.white)),
                      subtitle: Text('${m['role'] ?? ''} · ${m['email'] ?? ''}', style: const TextStyle(color: Colors.white54)),
                    );
                  }),
                  const Divider(color: Colors.white24),
                  TextField(
                    controller: _firstName,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(labelText: 'First name', labelStyle: TextStyle(color: Colors.white54)),
                  ),
                  TextField(
                    controller: _lastName,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(labelText: 'Last name', labelStyle: TextStyle(color: Colors.white54)),
                  ),
                  TextField(
                    controller: _email,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(labelText: 'Email', labelStyle: TextStyle(color: Colors.white54)),
                  ),
                  DropdownButton<String>(
                    value: _role,
                    dropdownColor: const Color(0xFF12122A),
                    items: const [
                      DropdownMenuItem(value: 'COORDINATOR', child: Text('Coordinator', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'ENGINEER', child: Text('Engineer (general)', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'QUALITY_ENGINEER', child: Text('Quality engineer', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'SUPERVISION_ENGINEER', child: Text('Supervision engineer', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'TECHNICIAN', child: Text('Technician', style: TextStyle(color: Colors.white))),
                    ],
                    onChanged: (v) => setState(() => _role = v ?? 'TECHNICIAN'),
                  ),
                  FilledButton(onPressed: _loading ? null : _createStaff, child: const Text('Create staff')),
                ],
                if (_tab == 1) ...[
                  ..._checklists.map((c) {
                    final m = c as Map<String, dynamic>;
                    return ListTile(
                      title: Text(m['name']?.toString() ?? '', style: const TextStyle(color: Colors.white)),
                      subtitle: Text(m['taskCategory']?.toString() ?? '', style: const TextStyle(color: Colors.white54)),
                    );
                  }),
                  TextField(
                    controller: _clName,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(labelText: 'Checklist name', labelStyle: TextStyle(color: Colors.white54)),
                  ),
                  DropdownButton<String>(
                    value: _clCategory,
                    dropdownColor: const Color(0xFF12122A),
                    items: const [
                      DropdownMenuItem(value: 'MAINTENANCE', child: Text('Maintenance', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'QUALITY', child: Text('Quality', style: TextStyle(color: Colors.white))),
                      DropdownMenuItem(value: 'SUPERVISION', child: Text('Supervision', style: TextStyle(color: Colors.white))),
                    ],
                    onChanged: (v) => setState(() => _clCategory = v ?? 'QUALITY'),
                  ),
                  TextField(
                    controller: _clTech,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Techniques (comma-separated slugs)',
                      labelStyle: TextStyle(color: Colors.white54),
                    ),
                  ),
                  FilledButton(onPressed: _loading ? null : _createChecklist, child: const Text('Save checklist')),
                ],
                if (_tab == 2) ...[
                  if (_billing != null)
                    Text(
                      'Free tickets: ${_billing!['freeTicketsUsed']}/${_billing!['freeTicketsLimit']}\n'
                      'Plan: ${_billing!['activeTicketPlan'] ?? 'none'}\n'
                      'Rate: \$${_billing!['activeRateUsd'] ?? '—'} / ticket',
                      style: const TextStyle(color: Colors.white70, height: 1.4),
                    )
                  else
                    const Text('Billing is available for the company owner session.', style: TextStyle(color: Colors.white54)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton(onPressed: _loading ? null : () => _setPlan('WEEKLY'), child: const Text('Weekly \$0.7')),
                      OutlinedButton(onPressed: _loading ? null : () => _setPlan('MONTHLY'), child: const Text('Monthly \$0.6')),
                      OutlinedButton(onPressed: _loading ? null : () => _setPlan('YEARLY'), child: const Text('Yearly \$0.5')),
                    ],
                  ),
                ],
              ],
            ),
    );
  }
}
