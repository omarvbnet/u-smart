import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../widgets/status_badge.dart';
import 'ncr_resubmit_screen.dart';

class TicketDetailScreen extends StatefulWidget {
  final String ticketId;
  const TicketDetailScreen({super.key, required this.ticketId});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Ticket? _ticket;
  bool _loading = true;
  bool _assigning = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final provider = context.read<TicketsProvider>();
    final t = await provider.fetchTicketDetail(widget.ticketId);
    if (mounted) {
      setState(() {
        _ticket = t;
        _loading = false;
      });
    }
  }

  Future<void> _assignToMe() async {
    setState(() => _assigning = true);
    final ok =
        await context.read<TicketsProvider>().assignTicketToMe(widget.ticketId);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text(ok ? 'Ticket assigned to you' : 'Failed to assign'),
          backgroundColor:
              ok ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      if (ok) await _load();
      setState(() => _assigning = false);
    }
  }

  Color get _accentColor {
    final s = _ticket?.status ?? 'PENDING';
    switch (s.toUpperCase()) {
      case 'PENDING':
        return const Color(0xFFFBBF24);
      case 'ON_SITE':
        return const Color(0xFF6C63FF);
      case 'IN_PROGRESS':
        return const Color(0xFF00D4AA);
      case 'COMPLETED':
        return const Color(0xFF4ADE80);
      default:
        return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
          : _ticket == null
              ? const Center(
                  child: Text('Ticket not found',
                      style: TextStyle(color: Color(0xFF6B7280))))
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF6C63FF),
                  child: CustomScrollView(
                    slivers: [
                      _buildAppBar(),
                      SliverPadding(
                        padding: const EdgeInsets.all(16),
                        sliver: SliverList(
                          delegate: SliverChildListDelegate(
                              _buildContent()),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  SliverAppBar _buildAppBar() {
    final t = _ticket!;
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: const Color(0xFF05051A),
      foregroundColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _accentColor.withAlpha(40),
                    const Color(0xFF05051A),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
            Positioned(
              top: -30,
              right: -30,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      _accentColor.withAlpha(30),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          t.siteName ?? 'Unknown Site',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      StatusBadge(status: t.status, fontSize: 13),
                    ],
                  ),
                  if (t.isAssigned) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.person, size: 14, color: _accentColor),
                        const SizedBox(width: 4),
                        Text(
                          'Assigned to ${t.assignedEngineerName}',
                          style: TextStyle(
                            color: _accentColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildContent() {
    final t = _ticket!;
    final fmt = DateFormat('MMM d, yyyy HH:mm');

    return [
      // Assign button
      if (t.canBeAssigned) ...[
        GestureDetector(
          onTap: _assigning ? null : _assignToMe,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF6C63FF), Color(0xFF5A52E0)],
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6C63FF).withAlpha(60),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_assigning)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                else ...[
                  const Icon(Icons.person_add_rounded,
                      color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  const Text(
                    'Assign to Me',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],

      // Details
      _glassSection('Details', [
        _row('Coordinator', t.siteCoordinator ?? '-'),
        _row('Technique', _techniqueName(t.technique)),
        _row('SLA', t.slaHours != null ? '${t.slaHours} hours' : '-'),
        _row('Created', fmt.format(t.createdAt)),
        if (t.completedAt != null) _row('Completed', t.completedAt!),
      ]),

      if (t.inspectionResult != null) ...[
        const SizedBox(height: 16),
        _glassSection('Inspection', [
          _row('Result', _techniqueName(t.inspectionResult!)),
          if (t.inspectionComments != null)
            _row('Comments', t.inspectionComments!),
        ]),
      ],

      if (t.isNcr) ...[
        const SizedBox(height: 16),
        _ncrSection(t),
      ],

      const SizedBox(height: 16),
      _timelineSection(t),

      if (t.designSpecifications != null &&
          t.designSpecifications!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _glassSection('Design Specifications', [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              t.designSpecifications!,
              style: TextStyle(
                  color: Colors.white.withAlpha(180), fontSize: 14),
            ),
          ),
        ]),
      ],
      const SizedBox(height: 40),
    ];
  }

  Widget _glassSection(String title, List<Widget> children) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF12122A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withAlpha(10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Text(
                  title.toUpperCase(),
                  style: TextStyle(
                    color: Colors.white.withAlpha(100),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              ...children,
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                  color: Colors.white.withAlpha(80), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ncrSection(Ticket t) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x30FF4757)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF4757).withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.warning_rounded,
                      color: Color(0xFFFF6B81), size: 16),
                ),
                const SizedBox(width: 8),
                const Text(
                  'NCR Report',
                  style: TextStyle(
                    color: Color(0xFFFF6B81),
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (t.ncrReason != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                t.ncrReason!,
                style: TextStyle(
                    color: Colors.white.withAlpha(150), fontSize: 13),
              ),
            ),
          if (t.ncrResubmissions.isNotEmpty) ...[
            const Divider(color: Color(0x10FFFFFF), height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Resubmissions (${t.ncrResubmissions.length})',
                style: TextStyle(
                    color: Colors.white.withAlpha(80),
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
            ),
            ...t.ncrResubmissions.map((r) => Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        r.by == 'admin'
                            ? Icons.admin_panel_settings
                            : Icons.person,
                        size: 14,
                        color: Colors.white.withAlpha(60),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${r.action} - ${r.comment ?? 'No comment'}',
                          style: TextStyle(
                              color: Colors.white.withAlpha(120), fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                )),
          ],
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  final result = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (_) =>
                          NcrResubmitScreen(ticketId: t.id),
                    ),
                  );
                  if (result == true) _load();
                },
                icon: const Icon(Icons.reply_rounded, size: 18),
                label: const Text('Resubmit',
                    style: TextStyle(fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFF4757),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _timelineSection(Ticket t) {
    return _glassSection('Status Timeline', [
      ...t.statusTimeline.asMap().entries.map((entry) {
        final i = entry.key;
        final log = entry.value;
        final isLast = i == t.statusTimeline.length - 1;
        final color = _statusColor(log.status);
        final fmt = DateFormat('MMM d, HH:mm');

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                      boxShadow: [
                        BoxShadow(color: color.withAlpha(100), blurRadius: 6),
                      ],
                    ),
                  ),
                  if (!isLast)
                    Container(
                      width: 2,
                      height: 30,
                      color: color.withAlpha(40),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      StatusBadge(status: log.status),
                      const Spacer(),
                      Text(
                        fmt.format(log.createdAt),
                        style: TextStyle(
                            color: Colors.white.withAlpha(60), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    ]);
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return const Color(0xFFFBBF24);
      case 'ON_SITE':
        return const Color(0xFF6C63FF);
      case 'IN_PROGRESS':
        return const Color(0xFF00D4AA);
      case 'COMPLETED':
        return const Color(0xFF4ADE80);
      default:
        return const Color(0xFF6B7280);
    }
  }

  String _techniqueName(String t) {
    return t.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }
}
