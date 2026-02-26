import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/tickets_provider.dart';
import '../providers/sites_provider.dart';

const _qcTechniques = [
  ('inspection', 'Inspection'),
  ('supervision', 'Supervision'),
  ('hse', 'HSE'),
  ('investigation', 'Investigation'),
  ('tracking', 'Tracking'),
];

class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final _siteNameCtrl = TextEditingController();
  final _coordinatorCtrl = TextEditingController();
  final _slaCtrl = TextEditingController(text: '24');
  String _technique = 'inspection';
  bool _submitting = false;

  Future<void> _submit() async {
    final siteName = _siteNameCtrl.text.trim();
    final coordinator = _coordinatorCtrl.text.trim();
    final sla = int.tryParse(_slaCtrl.text.trim()) ?? 24;

    if (siteName.isEmpty || coordinator.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Site name and coordinator are required'),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    final provider = context.read<TicketsProvider>();
    final success = await provider.createTicket(
      siteName: siteName,
      siteCoordinator: coordinator,
      technique: _technique,
      slaHours: sla,
    );

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Ticket created successfully'),
            backgroundColor: const Color(0xFF00D4AA),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to create ticket'),
            backgroundColor: const Color(0xFFFF4757),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        setState(() => _submitting = false);
      }
    }
  }

  @override
  void dispose() {
    _siteNameCtrl.dispose();
    _coordinatorCtrl.dispose();
    _slaCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sites = context.watch<SitesProvider>().sites;

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('New Ticket',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (sites.isNotEmpty) ...[
            Text(
              'QUICK FILL',
              style: TextStyle(
                color: Colors.white.withAlpha(80),
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: sites.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final s = sites[i];
                  return GestureDetector(
                    onTap: () {
                      _siteNameCtrl.text = s.siteId;
                      _coordinatorCtrl.text = s.location;
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF6C63FF).withAlpha(25),
                            const Color(0xFF6C63FF).withAlpha(10),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: const Color(0xFF6C63FF).withAlpha(40)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        s.siteId,
                        style: const TextStyle(
                          color: Color(0xFF8B83FF),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 24),
          ],

          _buildField(
            controller: _siteNameCtrl,
            label: 'Site Name',
            hint: 'Enter site name or ID',
            icon: Icons.location_on_outlined,
          ),
          const SizedBox(height: 16),
          _buildField(
            controller: _coordinatorCtrl,
            label: 'Site Coordinator / Location',
            hint: 'Enter coordinator name',
            icon: Icons.person_outline_rounded,
          ),
          const SizedBox(height: 16),

          Text(
            'TECHNIQUE',
            style: TextStyle(
              color: Colors.white.withAlpha(80),
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: const Color(0xFF12122A),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withAlpha(10)),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _technique,
                isExpanded: true,
                dropdownColor: const Color(0xFF12122A),
                style: const TextStyle(color: Colors.white, fontSize: 15),
                icon: Icon(Icons.expand_more_rounded,
                    color: Colors.white.withAlpha(80)),
                items: _qcTechniques
                    .map((t) =>
                        DropdownMenuItem(value: t.$1, child: Text(t.$2)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _technique = v);
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildField(
            controller: _slaCtrl,
            label: 'SLA Hours',
            hint: '24',
            icon: Icons.schedule_rounded,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 36),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: DecoratedBox(
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
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('Create Ticket',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: Colors.white.withAlpha(80),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            prefixIcon:
                Icon(icon, color: const Color(0xFF6C63FF), size: 20),
            filled: true,
            fillColor: const Color(0xFF12122A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.white.withAlpha(10)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
        ),
      ],
    );
  }
}
