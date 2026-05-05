import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// Full company management hub — staff, KPIs, checklists, billing.
/// Accessible by COMPANY_OWNER, COMPANY, MANAGER, TEAM_LEADER, COORDINATOR, ADMIN (hasCoordinatorCompany).
/// [embedded] = true renders without its own Scaffold/AppBar (used as a tab).
class CompanyProvisorHubScreen extends StatefulWidget {
  const CompanyProvisorHubScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<CompanyProvisorHubScreen> createState() =>
      _CompanyProvisorHubScreenState();
}

class _CompanyProvisorHubScreenState extends State<CompanyProvisorHubScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  // ─── Data ────────────────────────────────────────────────────────────────
  bool _loading = false;
  String? _message;
  bool _messageIsError = false;
  List<Map<String, dynamic>> _staff = [];
  List<Map<String, dynamic>> _checklists = [];
  Map<String, dynamic>? _billing;
  Map<String, dynamic>? _dashboard;

  // ─── Create-staff form ───────────────────────────────────────────────────
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  String _createRole = 'TECHNICIAN';

  // ─── Create-checklist form ───────────────────────────────────────────────
  final _clName = TextEditingController();
  String _clCategory = 'QUALITY';
  final _clTech = TextEditingController(text: 'inspection');

  static const _roleLabels = <String, String>{
    'MANAGER': 'Manager',
    'TEAM_LEADER': 'Team Leader',
    'COORDINATOR': 'Coordinator',
    'QC': 'QC',
    'SUPERVISOR': 'Supervisor',
    'ENGINEER': 'Engineer',
    'QUALITY_ENGINEER': 'Quality Engineer',
    'SUPERVISION_ENGINEER': 'Supervision Engineer',
    'TECHNICIAN': 'Technician',
    'CLIENT': 'Client',
  };

  static const _roleColors = <String, Color>{
    'COMPANY_OWNER': Color(0xFFFBBF24),
    'MANAGER': Color(0xFF22C55E),
    'TEAM_LEADER': Color(0xFF14B8A6),
    'COORDINATOR': Color(0xFF6C63FF),
    'QC': Color(0xFF4ADE80),
    'SUPERVISOR': Color(0xFF38BDF8),
    'ENGINEER': Color(0xFF00D4AA),
    'QUALITY_ENGINEER': Color(0xFF4ADE80),
    'SUPERVISION_ENGINEER': Color(0xFF38BDF8),
    'TECHNICIAN': Color(0xFFFF9F43),
    'CLIENT': Color(0xFFA78BFA),
  };

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  @override
  void dispose() {
    _tabs.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _clName.dispose();
    _clTech.dispose();
    super.dispose();
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  Future<void> _loadAll() async {
    if (!mounted) return;
    final api = context.read<ApiService>();
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final results = await Future.wait([
        api.getSafe(ApiConfig.companyStaff),
        api.getSafe(ApiConfig.inspectionChecklists),
        api.getSafe(ApiConfig.companyBillingPlan),
        api.getSafe(ApiConfig.companyDashboard),
      ]);
      if (!mounted) return;
      final staffRes = results[0];
      final checkRes = results[1];
      final billRes = results[2];
      final dashRes = results[3];

      setState(() {
        if (staffRes != null && staffRes['success'] == true) {
          _staff = ((staffRes['users'] as List<dynamic>?) ?? [])
              .map((e) => e as Map<String, dynamic>)
              .toList();
        }
        if (checkRes != null && checkRes['success'] == true) {
          _checklists = ((checkRes['checklists'] as List<dynamic>?) ?? [])
              .map((e) => e as Map<String, dynamic>)
              .toList();
        }
        if (billRes != null && billRes['success'] == true) {
          _billing = billRes['billing'] as Map<String, dynamic>?;
        }
        if (dashRes != null && dashRes['success'] == true) {
          _dashboard = dashRes['dashboard'] as Map<String, dynamic>?;
        }
      });
    } catch (_) {
      if (mounted) {
        _setMessage('Failed to load. Please check your session.', isError: true);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setMessage(String msg, {bool isError = false}) {
    setState(() {
      _message = msg;
      _messageIsError = isError;
    });
  }

  // ─── Create staff ─────────────────────────────────────────────────────────

  Future<void> _createStaff() async {
    final fn = _firstName.text.trim();
    final email = _email.text.trim();
    if (fn.isEmpty || email.isEmpty) {
      _setMessage('First name and email are required.', isError: true);
      return;
    }
    final api = context.read<ApiService>();
    setState(() => _loading = true);
    try {
      final data = await api.post(ApiConfig.companyStaff, body: {
        'firstName': fn,
        'lastName': _lastName.text.trim(),
        'email': email,
        'role': _createRole,
      });
      if (data['success'] == true) {
        final cred = data['credentials'] as Map<String, dynamic>?;
        final uname = cred?['username'] ?? data['user']?['username'] ?? '—';
        final pwd = cred?['temporaryPassword'] ?? '—';
        _firstName.clear();
        _lastName.clear();
        _email.clear();
        _setMessage('✓ Created  ·  Username: $uname  ·  Temp password: $pwd');
        await _loadAll();
      } else {
        _setMessage(
            data['message']?.toString() ?? 'Failed to create.',
            isError: true);
      }
    } catch (_) {
      _setMessage('Network error creating staff.', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ─── Create checklist ─────────────────────────────────────────────────────

  Future<void> _createChecklist() async {
    if (_clName.text.trim().isEmpty) {
      _setMessage('Checklist name is required.', isError: true);
      return;
    }
    final api = context.read<ApiService>();
    setState(() => _loading = true);
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
          {'label': 'Checklist item 1 — edit from web admin', 'weight': 'minor'}
        ],
      });
      if (data['success'] == true) {
        _clName.clear();
        _setMessage('✓ Checklist saved.');
        await _loadAll();
      } else {
        _setMessage(data['message']?.toString() ?? 'Failed.', isError: true);
      }
    } catch (_) {
      _setMessage('Network error.', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ─── Billing ──────────────────────────────────────────────────────────────

  Future<void> _setPlan(String plan) async {
    final auth = context.read<AuthProvider>();
    if (!auth.isCompanyOwner) {
      _setMessage('Only the company owner can change the billing plan.',
          isError: true);
      return;
    }
    final api = context.read<ApiService>();
    setState(() => _loading = true);
    try {
      final data =
          await api.patch(ApiConfig.companyBillingPlan, body: {'plan': plan});
      if (data['success'] == true) {
        _setMessage('✓ Plan set to $plan.');
        await _loadAll();
      } else {
        _setMessage(data['message']?.toString() ?? 'Failed.', isError: true);
      }
    } catch (_) {
      _setMessage('Network error.', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  Widget _buildTabBar() {
    return TabBar(
      controller: _tabs,
      indicatorColor: const Color(0xFF6C63FF),
      labelColor: const Color(0xFF6C63FF),
      unselectedLabelColor: Colors.white54,
      tabs: const [
        Tab(icon: Icon(Icons.dashboard_rounded, size: 20), text: 'Overview'),
        Tab(icon: Icon(Icons.people_rounded, size: 20), text: 'Staff'),
        Tab(icon: Icon(Icons.checklist_rounded, size: 20), text: 'Checklists'),
        Tab(icon: Icon(Icons.credit_card_rounded, size: 20), text: 'Billing'),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) {
      // Used as a bottom-nav tab — no Scaffold/AppBar, just content
      return Column(
        children: [
          Container(
            color: const Color(0xFF0A0A1F),
            child: _buildTabBar(),
          ),
          Expanded(child: _buildBody()),
        ],
      );
    }
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A1F),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Company Hub',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
        ),
        actions: [
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Color(0xFF6C63FF)),
                ),
              ),
            )
          else
            IconButton(
              onPressed: _loadAll,
              icon: const Icon(Icons.refresh_rounded, color: Color(0xFF8B83FF)),
              tooltip: 'Refresh',
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: _buildTabBar(),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    return Column(
      children: [
          if (_message != null)
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: double.infinity,
              color: _messageIsError
                  ? const Color(0xFFFF4757).withAlpha(30)
                  : const Color(0xFF00D4AA).withAlpha(25),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Icon(
                      _messageIsError
                          ? Icons.error_outline_rounded
                          : Icons.check_circle_outline_rounded,
                      color: _messageIsError
                          ? const Color(0xFFFF4757)
                          : const Color(0xFF00D4AA),
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: GestureDetector(
                        onLongPress: () {
                          Clipboard.setData(
                              ClipboardData(text: _message ?? ''));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Copied'),
                                behavior: SnackBarBehavior.floating),
                          );
                        },
                        child: Text(
                          _message!,
                          style: TextStyle(
                            color: _messageIsError
                                ? const Color(0xFFFF4757)
                                : const Color(0xFF00D4AA),
                            fontSize: 13,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded,
                          size: 16, color: Colors.white38),
                      onPressed: () => setState(() => _message = null),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _OverviewTab(
                    dashboard: _dashboard,
                    staff: _staff,
                    billing: _billing,
                    roleColors: _roleColors),
                _StaffTab(
                  staff: _staff,
                  dashboard: _dashboard,
                  createRole: _createRole,
                  firstName: _firstName,
                  lastName: _lastName,
                  email: _email,
                  roleLabels: _roleLabels,
                  roleColors: _roleColors,
                  loading: _loading,
                  onRoleChanged: (v) => setState(() => _createRole = v),
                  onCreateStaff: _createStaff,
                ),
                _ChecklistsTab(
                  checklists: _checklists,
                  clName: _clName,
                  clCategory: _clCategory,
                  clTech: _clTech,
                  loading: _loading,
                  onCategoryChanged: (v) => setState(() => _clCategory = v),
                  onCreateChecklist: _createChecklist,
                ),
                _BillingTab(
                  billing: _billing,
                  loading: _loading,
                  onSetPlan: _setPlan,
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Overview Tab — KPI tiles + performance table
// ═══════════════════════════════════════════════════════════════════════

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.dashboard,
    required this.staff,
    required this.billing,
    required this.roleColors,
  });

  final Map<String, dynamic>? dashboard;
  final List<Map<String, dynamic>> staff;
  final Map<String, dynamic>? billing;
  final Map<String, Color> roleColors;

  @override
  Widget build(BuildContext context) {
    final totalStaff = dashboard?['totalStaff'] as int? ?? staff.length;
    final totalTickets = dashboard?['totalTickets'] as int? ?? 0;
    final staffByRole =
        (dashboard?['staffByRole'] as Map<String, dynamic>?) ?? {};
    final perf =
        (dashboard?['staffPerformance'] as List<dynamic>?) ?? [];

    // Build by-role counts from live staff list as fallback
    final roleCounts = <String, int>{};
    if (staffByRole.isNotEmpty) {
      staffByRole.forEach((k, v) =>
          roleCounts[k] = (v as num?)?.round() ?? 0);
    } else {
      for (final u in staff) {
        final r = u['role'] as String? ?? 'UNKNOWN';
        roleCounts[r] = (roleCounts[r] ?? 0) + 1;
      }
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ── Top metrics row
        Row(
          children: [
            Expanded(
              child: _kpiTile(
                label: 'Total staff',
                value: '$totalStaff',
                icon: Icons.people_alt_rounded,
                color: const Color(0xFF6C63FF),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _kpiTile(
                label: 'Company tickets',
                value: '$totalTickets',
                icon: Icons.assignment_rounded,
                color: const Color(0xFF00D4AA),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // ── Staff by role
        if (roleCounts.isNotEmpty) ...[
          _sectionLabel('Staff by role'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: roleCounts.entries.map((e) {
              final color =
                  roleColors[e.key] ?? const Color(0xFF6B7280);
              return Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: color.withAlpha(22),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: color.withAlpha(80)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                          color: color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _roleLabel(e.key),
                      style: TextStyle(
                          color: color,
                          fontSize: 12,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${e.value}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
        ],

        // ── Billing quick-look
        if (billing != null) ...[
          _sectionLabel('Billing'),
          const SizedBox(height: 8),
          _glassCard(
            child: Row(
              children: [
                const Icon(Icons.credit_card_rounded,
                    color: Color(0xFFFBBF24), size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Free quota: ${billing!['freeTicketsUsed']} / ${billing!['freeTicketsLimit']} used',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        billing!['activeTicketPlan'] != null
                            ? 'Active plan: ${billing!['activeTicketPlan']}  ·  \$${billing!['activeRateUsd']} / ticket'
                            : 'No active plan — ${billing!['freeTicketsLimit'] - (billing!['freeTicketsUsed'] as int)} free tickets left',
                        style: TextStyle(
                          color: billing!['activeTicketPlan'] != null
                              ? const Color(0xFF4ADE80)
                              : Colors.white38,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],

        // ── Performance table
        if (perf.isNotEmpty) ...[
          _sectionLabel('Staff performance'),
          const SizedBox(height: 8),
          _glassCard(
            padding: EdgeInsets.zero,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(
                    const Color(0xFF1a1a35)),
                dataRowMinHeight: 44,
                dataRowMaxHeight: 52,
                columnSpacing: 14,
                columns: const [
                  DataColumn(
                      label: Text('Member',
                          style: TextStyle(
                              color: Color(0xFF8B83FF),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                  DataColumn(
                      label: Text('Role',
                          style: TextStyle(
                              color: Color(0xFF8B83FF),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                  DataColumn(
                      numeric: true,
                      label: Text('Assigned',
                          style: TextStyle(
                              color: Color(0xFF8B83FF),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                  DataColumn(
                      numeric: true,
                      label: Text('Done',
                          style: TextStyle(
                              color: Color(0xFF4ADE80),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                  DataColumn(
                      numeric: true,
                      label: Text('Needs edit',
                          style: TextStyle(
                              color: Color(0xFFFFB347),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                  DataColumn(
                      numeric: true,
                      label: Text('Resubmit',
                          style: TextStyle(
                              color: Color(0xFF8B83FF),
                              fontWeight: FontWeight.w600,
                              fontSize: 11))),
                ],
                rows: perf.map((raw) {
                  final r = raw as Map<String, dynamic>;
                  final userId = r['userId'] as String? ?? '';
                  final role = r['role'] as String? ?? '';
                  final assigned = (r['assigned'] as num?)?.round() ?? 0;
                  final completed =
                      (r['completed'] as num?)?.round() ?? 0;
                  final needsEdit =
                      (r['needsEdit'] as num?)?.round() ?? 0;
                  final resubmit =
                      (r['resubmitted'] as num?)?.round() ?? 0;
                  final matchedUser = staff.cast<Map<String, dynamic>>()
                      .where((u) => u['id'] == userId)
                      .toList();
                  final displayName = matchedUser.isNotEmpty
                      ? (matchedUser.first['username'] ??
                          matchedUser.first['name'] ??
                          '…${userId.substring(userId.length - 6)}')
                      : '…${userId.length > 6 ? userId.substring(userId.length - 6) : userId}';
                  final roleColor = roleColors[role] ??
                      const Color(0xFF6B7280);
                  return DataRow(cells: [
                    DataCell(Text(displayName as String,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12))),
                    DataCell(Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: roleColor.withAlpha(25),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        _roleLabel(role),
                        style: TextStyle(
                            color: roleColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w600),
                      ),
                    )),
                    DataCell(Text('$assigned',
                        style: const TextStyle(
                            color: Colors.white, fontSize: 13))),
                    DataCell(Text('$completed',
                        style: const TextStyle(
                            color: Color(0xFF4ADE80), fontSize: 13))),
                    DataCell(Text('$needsEdit',
                        style: const TextStyle(
                            color: Color(0xFFFFB347), fontSize: 13))),
                    DataCell(Text('$resubmit',
                        style: const TextStyle(
                            color: Color(0xFF8B83FF), fontSize: 13))),
                  ]);
                }).toList(),
              ),
            ),
          ),
        ] else if (dashboard == null && staff.isEmpty) ...[
          const SizedBox(height: 40),
          Center(
            child: Column(
              children: [
                Icon(Icons.group_off_rounded,
                    size: 52, color: Colors.white.withAlpha(40)),
                const SizedBox(height: 14),
                Text(
                  'No data yet.\nCreate staff or pull to refresh.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withAlpha(100), fontSize: 14),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _kpiTile({
    required String label,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withAlpha(30), color.withAlpha(12)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text(value,
              style: TextStyle(
                  color: color,
                  fontSize: 26,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(label,
              style:
                  TextStyle(color: Colors.white.withAlpha(160), fontSize: 12)),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Staff Tab — list + create form
// ═══════════════════════════════════════════════════════════════════════

class _StaffTab extends StatelessWidget {
  const _StaffTab({
    required this.staff,
    required this.dashboard,
    required this.createRole,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.roleLabels,
    required this.roleColors,
    required this.loading,
    required this.onRoleChanged,
    required this.onCreateStaff,
  });

  final List<Map<String, dynamic>> staff;
  final Map<String, dynamic>? dashboard;
  final String createRole;
  final TextEditingController firstName;
  final TextEditingController lastName;
  final TextEditingController email;
  final Map<String, String> roleLabels;
  final Map<String, Color> roleColors;
  final bool loading;
  final void Function(String) onRoleChanged;
  final VoidCallback onCreateStaff;

  @override
  Widget build(BuildContext context) {
    final sortedStaff = List<Map<String, dynamic>>.from(staff);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ── Create staff form
        _glassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.person_add_rounded,
                      color: Color(0xFF6C63FF), size: 20),
                  const SizedBox(width: 8),
                  const Text(
                    'Add new staff member',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _field(firstName, 'First name *')),
                  const SizedBox(width: 10),
                  Expanded(child: _field(lastName, 'Last name')),
                ],
              ),
              const SizedBox(height: 10),
              _field(email, 'Email *',
                  keyboardType: TextInputType.emailAddress),
              const SizedBox(height: 14),
              Text('Role',
                  style: TextStyle(
                      color: Colors.white.withAlpha(160), fontSize: 12)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: roleLabels.entries.map((entry) {
                  final selected = createRole == entry.key;
                  final c =
                      roleColors[entry.key] ?? const Color(0xFF6B7280);
                  return GestureDetector(
                    onTap: () => onRoleChanged(entry.key),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected ? c.withAlpha(40) : Colors.white10,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: selected
                                ? c
                                : Colors.white24,
                            width: selected ? 1.4 : 1),
                      ),
                      child: Text(
                        entry.value,
                        style: TextStyle(
                          color: selected ? c : Colors.white54,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w400,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: loading ? null : onCreateStaff,
                  icon: loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white))
                      : const Icon(Icons.person_add_rounded, size: 18),
                  label: const Text('Create staff member'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // ── Staff list
        if (sortedStaff.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 32),
              child: Text('No staff yet.',
                  style: TextStyle(
                      color: Colors.white.withAlpha(80), fontSize: 14)),
            ),
          )
        else ...[
          _sectionLabel('Team members (${sortedStaff.length})'),
          const SizedBox(height: 8),
          ...sortedStaff.map((u) {
            final role = u['role'] as String? ?? '';
            final color =
                roleColors[role] ?? const Color(0xFF6B7280);
            final username = u['username'] as String? ?? '—';
            final uname = u['name'] as String?;
            final email = u['email'] as String? ?? '';
            final status = u['status'] as String? ?? 'ACTIVE';
            return _glassCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: color.withAlpha(35),
                    child: Text(
                      (uname ?? username).isNotEmpty
                          ? (uname ?? username)[0].toUpperCase()
                          : '?',
                      style: TextStyle(
                          color: color,
                          fontWeight: FontWeight.w800,
                          fontSize: 16),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          uname ?? username,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 14),
                        ),
                        const SizedBox(height: 2),
                        Text('@$username · $email',
                            style: TextStyle(
                                color: Colors.white.withAlpha(120),
                                fontSize: 11)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: color.withAlpha(25),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _roleLabel(role),
                          style: TextStyle(
                              color: color,
                              fontSize: 10,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        status,
                        style: TextStyle(
                          color: status == 'ACTIVE'
                              ? const Color(0xFF4ADE80)
                              : const Color(0xFFFF4757),
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _field(TextEditingController ctrl, String label,
      {TextInputType? keyboardType}) {
    return TextField(
      controller: ctrl,
      keyboardType: keyboardType,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle:
            TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
        enabledBorder: const UnderlineInputBorder(
            borderSide: BorderSide(color: Colors.white24)),
        focusedBorder: const UnderlineInputBorder(
            borderSide:
                BorderSide(color: Color(0xFF6C63FF), width: 2)),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Checklists Tab
// ═══════════════════════════════════════════════════════════════════════

class _ChecklistsTab extends StatelessWidget {
  const _ChecklistsTab({
    required this.checklists,
    required this.clName,
    required this.clCategory,
    required this.clTech,
    required this.loading,
    required this.onCategoryChanged,
    required this.onCreateChecklist,
  });

  final List<Map<String, dynamic>> checklists;
  final TextEditingController clName;
  final String clCategory;
  final TextEditingController clTech;
  final bool loading;
  final void Function(String) onCategoryChanged;
  final VoidCallback onCreateChecklist;

  static const _catColors = {
    'MAINTENANCE': Color(0xFFFF9F43),
    'QUALITY': Color(0xFF4ADE80),
    'SUPERVISION': Color(0xFF38BDF8),
  };

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Create form
        _glassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.playlist_add_rounded,
                      color: Color(0xFF00D4AA), size: 20),
                  const SizedBox(width: 8),
                  const Text('New checklist',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15)),
                ],
              ),
              const SizedBox(height: 14),
              TextField(
                controller: clName,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  labelText: 'Checklist name *',
                  labelStyle: TextStyle(
                      color: Colors.white.withAlpha(160), fontSize: 13),
                  enabledBorder: const UnderlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                  focusedBorder: const UnderlineInputBorder(
                      borderSide:
                          BorderSide(color: Color(0xFF00D4AA), width: 2)),
                ),
              ),
              const SizedBox(height: 14),
              Text('Category',
                  style: TextStyle(
                      color: Colors.white.withAlpha(160), fontSize: 12)),
              const SizedBox(height: 6),
              Row(
                children: ['MAINTENANCE', 'QUALITY', 'SUPERVISION']
                    .map((c) {
                  final selected = clCategory == c;
                  final color =
                      _catColors[c] ?? const Color(0xFF6C63FF);
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => onCategoryChanged(c),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: selected
                              ? color.withAlpha(40)
                              : Colors.white10,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: selected
                                  ? color
                                  : Colors.white24,
                              width: selected ? 1.4 : 1),
                        ),
                        child: Text(c,
                            style: TextStyle(
                              color: selected ? color : Colors.white54,
                              fontWeight: selected
                                  ? FontWeight.w700
                                  : FontWeight.w400,
                              fontSize: 12,
                            )),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: clTech,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  labelText: 'Technique slugs (comma-separated)',
                  hintText: 'inspection, supervision, maintenance…',
                  hintStyle: TextStyle(
                      color: Colors.white.withAlpha(60), fontSize: 12),
                  labelStyle: TextStyle(
                      color: Colors.white.withAlpha(160), fontSize: 13),
                  enabledBorder: const UnderlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                  focusedBorder: const UnderlineInputBorder(
                      borderSide:
                          BorderSide(color: Color(0xFF00D4AA), width: 2)),
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: loading ? null : onCreateChecklist,
                  icon: loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.save_rounded, size: 18),
                  label: const Text('Save checklist'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF00D4AA),
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Checklist list
        if (checklists.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 32),
              child: Text('No checklists yet.',
                  style: TextStyle(
                      color: Colors.white.withAlpha(80), fontSize: 14)),
            ),
          )
        else ...[
          _sectionLabel('Checklists (${checklists.length})'),
          const SizedBox(height: 8),
          ...checklists.map((c) {
            final cat = c['taskCategory'] as String? ?? '';
            final color = _catColors[cat] ?? const Color(0xFF6B7280);
            final techs =
                (c['techniqueTypes'] as List<dynamic>?)?.join(', ') ?? '';
            return _glassCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: color.withAlpha(30),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.checklist_rounded,
                        color: color, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c['name']?.toString() ?? '—',
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 14)),
                        const SizedBox(height: 2),
                        if (techs.isNotEmpty)
                          Text(techs,
                              style: TextStyle(
                                  color: Colors.white.withAlpha(100),
                                  fontSize: 11)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: color.withAlpha(25),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(cat,
                        style: TextStyle(
                            color: color,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Billing Tab
// ═══════════════════════════════════════════════════════════════════════

class _BillingTab extends StatelessWidget {
  const _BillingTab({
    required this.billing,
    required this.loading,
    required this.onSetPlan,
  });

  final Map<String, dynamic>? billing;
  final bool loading;
  final void Function(String) onSetPlan;

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    final used = (billing?['freeTicketsUsed'] as num?)?.round() ?? 0;
    final limit = (billing?['freeTicketsLimit'] as num?)?.round() ?? 50;
    final activePlan = billing?['activeTicketPlan'] as String?;
    final activeRate = billing?['activeRateUsd'];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Summary
        _glassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.receipt_long_rounded,
                      color: Color(0xFFFBBF24), size: 22),
                  const SizedBox(width: 10),
                  const Text('Quota usage',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15)),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('$used used',
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 13)),
                  Text('$limit free total',
                      style: TextStyle(
                          color: Colors.white.withAlpha(120),
                          fontSize: 12)),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: limit > 0 ? (used / limit).clamp(0.0, 1.0) : 0,
                  minHeight: 8,
                  backgroundColor: Colors.white.withAlpha(15),
                  valueColor: AlwaysStoppedAnimation(
                    used >= limit
                        ? const Color(0xFFFF4757)
                        : const Color(0xFFFBBF24),
                  ),
                ),
              ),
              if (activePlan != null) ...[
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Icon(Icons.check_circle_rounded,
                        color: Color(0xFF4ADE80), size: 16),
                    const SizedBox(width: 6),
                    Text(
                      'Active plan: $activePlan  ·  \$$activeRate / ticket',
                      style: const TextStyle(
                          color: Color(0xFF4ADE80), fontSize: 13),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),

        _sectionLabel('Change plan'),
        const SizedBox(height: 8),
        ...const [
          ('WEEKLY', '\$0.70', 'Per ticket — weekly billing',
              Color(0xFF38BDF8)),
          ('MONTHLY', '\$0.60', 'Per ticket — monthly billing',
              Color(0xFF6C63FF)),
          ('YEARLY', '\$0.50', 'Per ticket — yearly billing',
              Color(0xFF4ADE80)),
        ].map(((String plan, String price, String desc, Color color) entry) {
          final active = activePlan == entry.$1;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _glassCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(entry.$1,
                                style: TextStyle(
                                    color: entry.$4,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15)),
                            if (active) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: entry.$4.withAlpha(30),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('Active',
                                    style: TextStyle(
                                        color: entry.$4,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700)),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(entry.$3,
                            style: TextStyle(
                                color: Colors.white.withAlpha(120),
                                fontSize: 12)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(entry.$2,
                      style: TextStyle(
                          color: entry.$4,
                          fontSize: 22,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(width: 14),
                  FilledButton(
                    onPressed: loading || !auth.isCompanyOwner
                        ? null
                        : () => onSetPlan(entry.$1),
                    style: FilledButton.styleFrom(
                      backgroundColor:
                          active ? Colors.white10 : entry.$4,
                      foregroundColor:
                          active ? Colors.white38 : Colors.black,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                    ),
                    child: Text(active ? 'Current' : 'Select',
                        style: const TextStyle(fontSize: 13)),
                  ),
                ],
              ),
            ),
          );
        }),
        if (!auth.isCompanyOwner)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Only the company owner can change the billing plan.',
              style: TextStyle(
                  color: Colors.white.withAlpha(80), fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════

String _roleLabel(String role) {
  const labels = {
    'COMPANY_OWNER': 'Company Owner',
    'MANAGER': 'Manager',
    'TEAM_LEADER': 'Team Leader',
    'COORDINATOR': 'Coordinator',
    'QC': 'QC',
    'SUPERVISOR': 'Supervisor',
    'ENGINEER': 'Engineer',
    'QUALITY_ENGINEER': 'Quality Engineer',
    'SUPERVISION_ENGINEER': 'Supervision Eng.',
    'TECHNICIAN': 'Technician',
    'CLIENT': 'Client',
    'ADMIN': 'Admin',
  };
  return labels[role] ?? role.replaceAll('_', ' ');
}

Widget _sectionLabel(String text) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 2),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        color: Colors.white.withAlpha(120),
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
      ),
    ),
  );
}

Widget _glassCard({
  required Widget child,
  EdgeInsetsGeometry padding = const EdgeInsets.all(16),
  EdgeInsetsGeometry margin = EdgeInsets.zero,
}) {
  return Container(
    margin: margin,
    padding: padding,
    decoration: BoxDecoration(
      color: const Color(0xFF12122A),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.white.withAlpha(12)),
    ),
    child: child,
  );
}
