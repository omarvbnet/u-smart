import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';

/// Company / workspace managers can request REST API access for automated ticket creation.
class TicketApiAccessCard extends StatefulWidget {
  const TicketApiAccessCard({super.key});

  static bool showForRole(String? role) {
    final r = (role ?? '').toUpperCase();
    return r == 'COMPANY' || r == 'MANAGER' || r == 'COORDINATOR';
  }

  @override
  State<TicketApiAccessCard> createState() => _TicketApiAccessCardState();
}

class _TicketApiAccessCardState extends State<TicketApiAccessCard> {
  final _useCaseCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();
  bool _loading = true;
  bool _submitting = false;
  bool _expanded = false;
  String? _error;
  Map<String, dynamic>? _pending;
  Map<String, dynamic>? _lastRejected;
  List<Map<String, dynamic>> _keys = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadStatus());
  }

  @override
  void dispose() {
    _useCaseCtrl.dispose();
    _labelCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final data = await api.get(ApiConfig.ticketApiKeyRequest);
      if (!mounted) return;
      if (data['success'] == true && data['eligible'] == true) {
        setState(() {
          _pending = data['pending'] as Map<String, dynamic>?;
          _lastRejected = data['lastRejected'] as Map<String, dynamic>?;
          _keys = (data['keys'] as List<dynamic>?)
                  ?.whereType<Map<String, dynamic>>()
                  .toList() ??
              [];
          _loading = false;
        });
        return;
      }
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final useCase = _useCaseCtrl.text.trim();
    if (useCase.isEmpty) {
      setState(() => _error = l10n.t('ticket_api_use_case_required'));
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final data = await api.post(
        ApiConfig.ticketApiKeyRequest,
        body: {
          'useCase': useCase,
          'label': _labelCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      if (data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.t('ticket_api_request_submitted')),
            backgroundColor: const Color(0xFF00D4AA),
          ),
        );
        setState(() {
          _expanded = false;
          _useCaseCtrl.clear();
          _labelCtrl.clear();
        });
        await _loadStatus();
      } else {
        setState(() => _error = data['message']?.toString() ?? l10n.t('login_failed'));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final auth = context.watch<AuthProvider>();
    final role = auth.user?.role;
    if (!TicketApiAccessCard.showForRole(role)) {
      return const SizedBox.shrink();
    }

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF12122A),
        border: Border.all(color: const Color(0xFF00D4AA).withAlpha(50)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.api_rounded, color: Color(0xFF00D4AA), size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.t('ticket_api_request_title'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            l10n.t('ticket_api_request_hint'),
            style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12, height: 1.4),
          ),
          if (_keys.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              l10n.t('ticket_api_active_keys'),
              style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 11),
            ),
            const SizedBox(height: 6),
            ..._keys.map((k) {
              final prefix = k['keyPrefix'] as String? ?? '';
              final label = k['label'] as String?;
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    const Icon(Icons.vpn_key_rounded, color: Color(0xFF00D4AA), size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '$prefix…${label != null && label.isNotEmpty ? ' · $label' : ''}',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
                      ),
                    ),
                    IconButton(
                      tooltip: l10n.t('copy'),
                      icon: Icon(Icons.copy_rounded, size: 18, color: Colors.white.withAlpha(140)),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: prefix));
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(l10n.t('copied'))),
                        );
                      },
                    ),
                  ],
                ),
              );
            }),
            Text(
              l10n.t('ticket_api_key_prefix_note'),
              style: TextStyle(color: Colors.white.withAlpha(100), fontSize: 10),
            ),
          ],
          if (_pending != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFBBF24).withAlpha(25),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFBBF24).withAlpha(80)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.hourglass_top_rounded, color: Color(0xFFFBBF24), size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      l10n.t('ticket_api_request_pending'),
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_lastRejected != null && _pending == null) ...[
            const SizedBox(height: 8),
            Text(
              '${l10n.t('ticket_api_request_rejected')}: ${_lastRejected!['rejectionReason'] ?? ''}',
              style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 12),
            ),
          ],
          if (_pending == null) ...[
            const SizedBox(height: 12),
            if (!_expanded)
              OutlinedButton.icon(
                onPressed: () => setState(() => _expanded = true),
                icon: const Icon(Icons.send_rounded, size: 18),
                label: Text(l10n.t('ticket_api_request_submit_btn')),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF00D4AA),
                  side: BorderSide(color: const Color(0xFF00D4AA).withAlpha(80)),
                ),
              )
            else ...[
              TextField(
                controller: _labelCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: l10n.t('ticket_api_label_optional'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(120)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                  ),
                  focusedBorder: const OutlineInputBorder(
                    borderRadius: BorderRadius.all(Radius.circular(12)),
                    borderSide: BorderSide(color: Color(0xFF00D4AA)),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _useCaseCtrl,
                style: const TextStyle(color: Colors.white),
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: l10n.t('ticket_api_use_case_label'),
                  hintText: l10n.t('ticket_api_use_case_hint'),
                  labelStyle: TextStyle(color: Colors.white.withAlpha(120)),
                  hintStyle: TextStyle(color: Colors.white.withAlpha(80)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                  ),
                  focusedBorder: const OutlineInputBorder(
                    borderRadius: BorderRadius.all(Radius.circular(12)),
                    borderSide: BorderSide(color: Color(0xFF00D4AA)),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 12)),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  TextButton(
                    onPressed: _submitting ? null : () => setState(() => _expanded = false),
                    child: Text(l10n.t('cancel')),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF00D4AA)),
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(l10n.t('ticket_api_send_request')),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}
