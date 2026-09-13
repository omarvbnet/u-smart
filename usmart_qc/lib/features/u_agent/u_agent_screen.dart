import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../l10n/app_localizations.dart';
import '../../services/api_service.dart';
import 'u_agent_provider.dart';
import 'u_agent_service.dart';

/// Chat + approval surface for U Agent (all Proviser roles).
class UAgentScreen extends StatelessWidget {
  const UAgentScreen({super.key, this.embedded = false});

  /// When true, used as a dashboard tab (no Scaffold).
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiService>();
    return ChangeNotifierProvider(
      create: (_) {
        final p = UAgentProvider(UAgentService(api));
        p.refreshStatus();
        p.refreshApprovals();
        return p;
      },
      child: embedded ? const _UAgentBody() : const _UAgentScaffold(),
    );
  }
}

class _UAgentScaffold extends StatelessWidget {
  const _UAgentScaffold();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A1F),
        title: Text(l10n.t('nav_u_agent')),
      ),
      body: const _UAgentBody(),
    );
  }
}

class _UAgentBody extends StatefulWidget {
  const _UAgentBody();

  @override
  State<_UAgentBody> createState() => _UAgentBodyState();
}

class _UAgentBodyState extends State<_UAgentBody> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Consumer<UAgentProvider>(
      builder: (context, agent, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome, color: Color(0xFF6C63FF), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${l10n.t('nav_u_agent')} · ${agent.status}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (agent.error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(agent.error!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
              ),
            if (agent.approvals.isNotEmpty)
              SizedBox(
                height: 110,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  scrollDirection: Axis.horizontal,
                  itemCount: agent.approvals.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final a = agent.approvals[i];
                    return Container(
                      width: 220,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF141428),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a['action']?.toString() ?? a['toolId']?.toString() ?? 'Approval',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                          ),
                          const Spacer(),
                          if (agent.canManageApprovals)
                            Row(
                              children: [
                                Expanded(
                                  child: TextButton(
                                    onPressed: () => agent.resolveApproval(
                                      a['id'].toString(),
                                      approve: true,
                                    ),
                                    style: TextButton.styleFrom(
                                      backgroundColor: Colors.green.shade700,
                                      foregroundColor: Colors.white,
                                      padding: EdgeInsets.zero,
                                      minimumSize: const Size(0, 28),
                                    ),
                                    child: Text(l10n.t('u_agent_approve'), style: const TextStyle(fontSize: 11)),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: TextButton(
                                    onPressed: () => agent.resolveApproval(
                                      a['id'].toString(),
                                      approve: false,
                                    ),
                                    style: TextButton.styleFrom(
                                      backgroundColor: Colors.red.shade800,
                                      foregroundColor: Colors.white,
                                      padding: EdgeInsets.zero,
                                      minimumSize: const Size(0, 28),
                                    ),
                                    child: Text(l10n.t('u_agent_reject'), style: const TextStyle(fontSize: 11)),
                                  ),
                                ),
                              ],
                            )
                          else
                            Text(
                              l10n.t('u_agent_waiting_approval'),
                              style: const TextStyle(color: Colors.amber, fontSize: 11),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            Expanded(
              child: agent.messages.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          agent.greeting,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      itemCount: agent.messages.length + (agent.busy ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (agent.busy && i == agent.messages.length) {
                          return const Padding(
                            padding: EdgeInsets.all(8),
                            child: Text('…', style: TextStyle(color: Colors.white54)),
                          );
                        }
                        final m = agent.messages[i];
                        final mine = m.role == 'user';
                        return Align(
                          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.of(context).size.width * 0.82,
                            ),
                            decoration: BoxDecoration(
                              color: mine
                                  ? const Color(0xFF6C63FF).withAlpha(80)
                                  : const Color(0xFF141428),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(m.content, style: const TextStyle(color: Colors.white, height: 1.35)),
                                if (m.timeline.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  ...m.timeline.take(8).map(
                                        (t) => Text(
                                          '• ${t.label}',
                                          style: const TextStyle(color: Colors.white54, fontSize: 11),
                                        ),
                                      ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        style: const TextStyle(color: Colors.white),
                        minLines: 1,
                        maxLines: 4,
                        decoration: InputDecoration(
                          hintText: l10n.t('u_agent_hint'),
                          hintStyle: const TextStyle(color: Colors.white38),
                          filled: true,
                          fillColor: const Color(0xFF141428),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        ),
                        onSubmitted: (_) => _submit(agent),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: agent.busy ? null : () => _submit(agent),
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFF6C63FF),
                        foregroundColor: Colors.white,
                      ),
                      icon: agent.busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _submit(UAgentProvider agent) async {
    final text = _controller.text;
    _controller.clear();
    await agent.send(text);
    if (_scroll.hasClients) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }
}
