import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:url_launcher/url_launcher.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import 'u_agent_provider.dart';
import 'u_agent_service.dart';

/// Floating U Agent host for dashboards (not a bottom-nav tab).
class UAgentHost extends StatefulWidget {
  const UAgentHost({super.key, this.onOpenChanged});

  /// Called when the overlay opens/closes so dashboards can hide the bottom nav.
  final ValueChanged<bool>? onOpenChanged;

  @override
  State<UAgentHost> createState() => _UAgentHostState();
}

class _UAgentHostState extends State<UAgentHost> {
  UAgentProvider? _provider;

  void _onOpenChanged() {
    final p = _provider;
    if (p == null) return;
    widget.onOpenChanged?.call(p.open);
  }

  @override
  void dispose() {
    _provider?.removeOpenListener(_onOpenChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiService>();
    final userId = context.watch<AuthProvider>().user?.id;
    return ChangeNotifierProvider(
      key: ValueKey(userId ?? 'anon'),
      create: (_) {
        final p = UAgentProvider(UAgentService(api), userId: userId);
        _provider?.removeOpenListener(_onOpenChanged);
        _provider = p;
        p.addOpenListener(_onOpenChanged);
        p.refreshStatus();
        return p;
      },
      child: const _UAgentHostBody(),
    );
  }
}

class _UAgentHostBody extends StatelessWidget {
  const _UAgentHostBody();

  @override
  Widget build(BuildContext context) {
    return Consumer<UAgentProvider>(
      builder: (context, agent, _) {
        return Stack(
          children: [
            if (agent.open) const _UAgentChatOverlay(),
            // Body sits above bottomNavigationBar → bottom: 5 = 5px above the nav.
            Positioned(
              right: 12,
              bottom: 5,
              child: _UAgentFab(visible: !agent.open),
            ),
          ],
        );
      },
    );
  }
}

class _UAgentFab extends StatefulWidget {
  const _UAgentFab({required this.visible});
  final bool visible;

  @override
  State<_UAgentFab> createState() => _UAgentFabState();
}

class _UAgentFabState extends State<_UAgentFab> with TickerProviderStateMixin {
  late final AnimationController _slide;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
      ..repeat(reverse: true);
    _slide = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _runSlideLoop();
  }

  Future<void> _runSlideLoop() async {
    while (mounted) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!mounted) return;
      await _slide.forward();
      await Future<void>.delayed(const Duration(milliseconds: 2200));
      if (!mounted) return;
      await _slide.reverse();
      await Future<void>.delayed(const Duration(milliseconds: 2800));
    }
  }

  @override
  void dispose() {
    _slide.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final agent = context.watch<UAgentProvider>();
    final label = AppLocalizations.of(context).t('nav_u_agent');
    return AnimatedScale(
      scale: widget.visible ? 1 : 0.15,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(
        opacity: widget.visible ? 1 : 0,
        duration: const Duration(milliseconds: 180),
        child: IgnorePointer(
          ignoring: !widget.visible,
          child: GestureDetector(
            onTap: agent.toggleOpen,
            child: AnimatedBuilder(
              animation: Listenable.merge([_slide, _pulse]),
              builder: (context, _) {
                final t = Curves.easeOutCubic.transform(_slide.value);
                final glow = 6 + (_pulse.value * 8);
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ClipRect(
                      child: Align(
                        alignment: Alignment.centerRight,
                        widthFactor: t,
                        child: Opacity(
                          opacity: t,
                          child: Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0B141A).withAlpha(230),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white24),
                            ),
                            child: Text(
                              label,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF10A37F), Color(0xFF6C63FF)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF10A37F).withAlpha(100),
                            blurRadius: glow,
                            spreadRadius: 0.5,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.auto_awesome, color: Colors.white, size: 20),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _UAgentChatOverlay extends StatefulWidget {
  const _UAgentChatOverlay();

  @override
  State<_UAgentChatOverlay> createState() => _UAgentChatOverlayState();
}

class _UAgentChatOverlayState extends State<_UAgentChatOverlay> with TickerProviderStateMixin {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final _speech = stt.SpeechToText();
  final _tts = FlutterTts();
  late final AnimationController _sheetCtrl;
  late final AnimationController _waveCtrl;
  bool _speechReady = false;
  bool _ttsReady = false;
  bool _autoSpeak = true;
  bool _voiceLoop = false;

  @override
  void initState() {
    super.initState();
    _sheetCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 360))
      ..forward();
    _waveCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat();
    _initVoice();
  }

  Future<void> _initVoice() async {
    try {
      _speechReady = await _speech.initialize(
        onError: (e) => debugPrint('STT error: $e'),
        onStatus: (s) {
          if (!mounted) return;
          final agent = context.read<UAgentProvider>();
          if (s == 'notListening' || s == 'done') {
            agent.setListening(false);
          }
        },
      );
      await _tts.setSpeechRate(0.48);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
      if (!mounted) return;
      final locale = Localizations.localeOf(context).languageCode;
      await _tts.setLanguage(locale.startsWith('ar') ? 'ar-SA' : 'en-US');
      _tts.setStartHandler(() {
        if (mounted) context.read<UAgentProvider>().setSpeaking(true);
      });
      _tts.setCompletionHandler(() async {
        if (!mounted) return;
        final agent = context.read<UAgentProvider>();
        agent.setSpeaking(false);
        if (agent.voiceMode && _voiceLoop && !agent.busy) {
          await Future<void>.delayed(const Duration(milliseconds: 350));
          if (mounted && agent.voiceMode) await _startVoiceListen();
        }
      });
      _tts.setCancelHandler(() {
        if (mounted) context.read<UAgentProvider>().setSpeaking(false);
      });
      _ttsReady = true;
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Voice init failed: $e');
    }
  }

  @override
  void dispose() {
    _voiceLoop = false;
    _sheetCtrl.dispose();
    _waveCtrl.dispose();
    _controller.dispose();
    _scroll.dispose();
    _speech.stop();
    _tts.stop();
    super.dispose();
  }

  Future<void> _close() async {
    _voiceLoop = false;
    await _speech.stop();
    await _tts.stop();
    await _sheetCtrl.reverse();
    if (mounted) {
      final agent = context.read<UAgentProvider>();
      agent.setVoiceMode(false);
      agent.setOpen(false);
    }
  }

  Future<void> _enterVoiceMode() async {
    final agent = context.read<UAgentProvider>();
    if (!_speechReady) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).t('u_agent_voice_unavailable'))),
      );
      return;
    }
    await _tts.stop();
    _voiceLoop = true;
    agent.setVoiceMode(true);
    await _startVoiceListen();
  }

  Future<void> _exitVoiceMode() async {
    _voiceLoop = false;
    await _speech.stop();
    await _tts.stop();
    if (!mounted) return;
    final agent = context.read<UAgentProvider>();
    agent.setVoiceMode(false);
    agent.setListening(false);
    agent.setLiveTranscript('');
  }

  Future<void> _startVoiceListen() async {
    final agent = context.read<UAgentProvider>();
    if (!_speechReady || agent.busy || agent.speaking) return;
    await _tts.stop();
    agent.setListening(true);
    agent.setLiveTranscript('');
    await _speech.listen(
      onResult: (result) async {
        if (!mounted) return;
        agent.setLiveTranscript(result.recognizedWords);
        if (result.finalResult && result.recognizedWords.trim().isNotEmpty) {
          agent.setListening(false);
          await _speech.stop();
          final reply = await agent.send(result.recognizedWords.trim(), fromVoice: true);
          if (!mounted) return;
          await _scrollToEnd();
          if (_ttsReady && reply != null && reply.trim().isNotEmpty && agent.voiceMode) {
            final speakText = reply.length > 1400 ? '${reply.substring(0, 1400)}…' : reply;
            await _tts.speak(speakText);
          } else if (agent.voiceMode && _voiceLoop) {
            await Future<void>.delayed(const Duration(milliseconds: 400));
            if (mounted && agent.voiceMode) await _startVoiceListen();
          }
        }
      },
      listenFor: const Duration(seconds: 45),
      pauseFor: const Duration(seconds: 2),
      localeId: Localizations.localeOf(context).languageCode.startsWith('ar') ? 'ar_SA' : 'en_US',
      cancelOnError: true,
      partialResults: true,
      listenMode: stt.ListenMode.confirmation,
    );
  }

  Future<void> _interruptVoice() async {
    await _speech.stop();
    await _tts.stop();
    if (!mounted) return;
    final agent = context.read<UAgentProvider>();
    agent.setSpeaking(false);
    agent.setListening(false);
    if (agent.voiceMode && _voiceLoop) {
      await _startVoiceListen();
    }
  }

  Future<void> _pickFiles() async {
    final agent = context.read<UAgentProvider>();
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.custom,
      allowedExtensions: const [
        'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'md', 'json', 'doc', 'docx', 'xls', 'xlsx',
      ],
    );
    if (result == null) return;
    for (final f in result.files) {
      agent.addPendingFile(UAgentPendingFile(name: f.name, path: f.path, bytes: f.bytes));
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final agent = context.read<UAgentProvider>();
    final x = await ImagePicker().pickImage(source: source, imageQuality: 85);
    if (x == null) return;
    agent.addPendingFile(UAgentPendingFile(name: x.name, path: x.path, contentType: 'image/jpeg'));
  }

  Future<void> _scrollToEnd() async {
    if (!_scroll.hasClients) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
    _scroll.animateTo(
      _scroll.position.maxScrollExtent,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOut,
    );
  }

  Future<void> _submit() async {
    final agent = context.read<UAgentProvider>();
    final text = _controller.text;
    _controller.clear();
    final reply = await agent.send(text);
    await _scrollToEnd();
    if (_autoSpeak && _ttsReady && reply != null && reply.trim().isNotEmpty && !agent.voiceMode) {
      final speakText = reply.length > 1200 ? '${reply.substring(0, 1200)}…' : reply;
      await _tts.speak(speakText);
    }
  }

  Future<void> _openArtifact(UAgentArtifact a) async {
    final uri = Uri.tryParse(a.url);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final agent = context.watch<UAgentProvider>();
    final media = MediaQuery.of(context);

    return AnimatedBuilder(
      animation: _sheetCtrl,
      builder: (context, _) {
        final t = Curves.easeOutCubic.transform(_sheetCtrl.value);
        return Stack(
          children: [
            GestureDetector(
              onTap: _close,
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12 * t, sigmaY: 12 * t),
                child: Container(color: Colors.black.withAlpha((170 * t).round())),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Transform.translate(
                offset: Offset(0, (1 - t) * media.size.height * 0.28),
                child: Opacity(
                  opacity: t,
                  child: Material(
                    color: Colors.transparent,
                    child: Container(
                      height: media.size.height,
                      width: double.infinity,
                      color: const Color(0xFF212121),
                      child: agent.voiceMode
                          ? _ChatGptVoiceMode(
                              wave: _waveCtrl,
                              onClose: _exitVoiceMode,
                              onInterrupt: _interruptVoice,
                            )
                          : Column(
                              children: [
                                _header(l10n, agent),
                                if (agent.error != null)
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    child: Text(agent.error!,
                                        style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
                                  ),
                                if (agent.approvals.isNotEmpty) _approvalsStrip(l10n, agent),
                                Expanded(child: _messages(agent)),
                                if (agent.pendingFiles.isNotEmpty) _pendingFiles(agent),
                                _composer(l10n, agent),
                              ],
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _header(AppLocalizations l10n, UAgentProvider agent) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
        child: Row(
          children: [
            IconButton(
              onPressed: _close,
              icon: const Icon(Icons.close_rounded, color: Colors.white70),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.t('nav_u_agent'),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17),
                  ),
                  Text(
                    agent.busy
                        ? l10n.t('u_agent_thinking')
                        : '${agent.status}${agent.activeProvider != null ? ' · ${agent.activeProvider}' : ''}',
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: l10n.t('u_agent_whatsapp'),
              onPressed: () => _showWhatsAppPermissions(agent, l10n),
              icon: Icon(
                Icons.chat_rounded,
                color: agent.waGranted ? const Color(0xFF25D366) : Colors.white70,
              ),
            ),
            IconButton(
              tooltip: l10n.t('u_agent_new_chat'),
              onPressed: agent.busy ? null : () => agent.startNewConversation(),
              icon: const Icon(Icons.edit_square, color: Colors.white70),
            ),
            IconButton(
              tooltip: l10n.t('u_agent_history'),
              onPressed: () => _showHistory(agent, l10n),
              icon: const Icon(Icons.history_rounded, color: Colors.white70),
            ),
            IconButton(
              tooltip: l10n.t('u_agent_auto_speak'),
              onPressed: () => setState(() => _autoSpeak = !_autoSpeak),
              icon: Icon(
                _autoSpeak ? Icons.volume_up_rounded : Icons.volume_off_rounded,
                color: Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _maybeOpenWhatsAppResult(Map<String, dynamic>? data) async {
    if (data == null) return;
    final result = data['result'];
    if (result is! Map) return;
    final inner = result['data'] is Map ? Map<String, dynamic>.from(result['data'] as Map) : result;
    final link = (inner['deepLink'] ?? inner['callLink'] ?? inner['url'])?.toString();
    if (link == null || link.isEmpty) return;
    final uri = Uri.tryParse(link);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _showWhatsAppPermissions(UAgentProvider agent, AppLocalizations l10n) async {
    await agent.refreshWhatsAppConsent();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF2F2F2F),
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.t('u_agent_whatsapp_title'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.t('u_agent_whatsapp_hint'),
                      style: const TextStyle(color: Colors.white54, fontSize: 13, height: 1.35),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      agent.waCloudConfigured
                          ? l10n.t('u_agent_whatsapp_cloud_on')
                          : l10n.t('u_agent_whatsapp_cloud_off'),
                      style: TextStyle(
                        color: agent.waCloudConfigured ? const Color(0xFF25D366) : Colors.amber,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.t('u_agent_whatsapp_grant'),
                          style: const TextStyle(color: Colors.white)),
                      value: agent.waGranted,
                      activeThumbColor: const Color(0xFF25D366),
                      onChanged: (v) async {
                        await agent.updateWhatsAppConsent(
                          granted: v,
                          canSendMessages: v,
                          canSendFiles: v,
                          canStartCalls: v,
                        );
                        setModal(() {});
                      },
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.t('u_agent_whatsapp_messages'),
                          style: const TextStyle(color: Colors.white)),
                      value: agent.waGranted && agent.waMessages,
                      onChanged: agent.waGranted
                          ? (v) async {
                              await agent.updateWhatsAppConsent(canSendMessages: v);
                              setModal(() {});
                            }
                          : null,
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.t('u_agent_whatsapp_files'),
                          style: const TextStyle(color: Colors.white)),
                      value: agent.waGranted && agent.waFiles,
                      onChanged: agent.waGranted
                          ? (v) async {
                              await agent.updateWhatsAppConsent(canSendFiles: v);
                              setModal(() {});
                            }
                          : null,
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.t('u_agent_whatsapp_calls'),
                          style: const TextStyle(color: Colors.white)),
                      value: agent.waGranted && agent.waCalls,
                      onChanged: agent.waGranted
                          ? (v) async {
                              await agent.updateWhatsAppConsent(canStartCalls: v);
                              setModal(() {});
                            }
                          : null,
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _showHistory(UAgentProvider agent, AppLocalizations l10n) async {
    await agent.loadHistory();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF2F2F2F),
      builder: (ctx) {
        final items = agent.conversations;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.add_comment_outlined, color: Colors.white),
                title: Text(l10n.t('u_agent_new_chat'), style: const TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  agent.startNewConversation();
                },
              ),
              const Divider(color: Colors.white12),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(l10n.t('u_agent_no_history'), style: const TextStyle(color: Colors.white54)),
                )
              else
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: items.length,
                    itemBuilder: (_, i) {
                      final c = items[i];
                      return ListTile(
                        leading: const Icon(Icons.chat_bubble_outline, color: Colors.white70),
                        title: Text(
                          c.title?.isNotEmpty == true ? c.title! : 'Chat ${c.id.substring(0, math.min(8, c.id.length))}',
                          style: const TextStyle(color: Colors.white),
                        ),
                        subtitle: Text(
                          '${c.messageCount} msgs',
                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                        ),
                        selected: c.id == agent.conversationId,
                        onTap: () {
                          Navigator.pop(ctx);
                          agent.openConversation(c.id);
                        },
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _approvalsStrip(AppLocalizations l10n, UAgentProvider agent) {
    return SizedBox(
      height: 92,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        scrollDirection: Axis.horizontal,
        itemCount: agent.approvals.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final a = agent.approvals[i];
          return Container(
            width: 200,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF2F2F2F),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.amber.withAlpha(70)),
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
                          onPressed: () async {
                            final result = await agent.resolveApproval(
                              a['id'].toString(),
                              approve: true,
                            );
                            await _maybeOpenWhatsAppResult(result);
                          },
                          style: TextButton.styleFrom(
                            backgroundColor: Colors.green.shade700,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(0, 28),
                            padding: EdgeInsets.zero,
                          ),
                          child: Text(l10n.t('u_agent_approve'), style: const TextStyle(fontSize: 11)),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: TextButton(
                          onPressed: () => agent.resolveApproval(a['id'].toString(), approve: false),
                          style: TextButton.styleFrom(
                            backgroundColor: Colors.red.shade800,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(0, 28),
                            padding: EdgeInsets.zero,
                          ),
                          child: Text(l10n.t('u_agent_reject'), style: const TextStyle(fontSize: 11)),
                        ),
                      ),
                    ],
                  )
                else
                  Text(l10n.t('u_agent_waiting_approval'),
                      style: const TextStyle(color: Colors.amber, fontSize: 11)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _messages(UAgentProvider agent) {
    if (agent.messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: [Color(0xFF10A37F), Color(0xFF6C63FF)]),
                ),
                child: const Icon(Icons.auto_awesome, color: Colors.white, size: 34),
              ),
              const SizedBox(height: 16),
              Text(
                agent.greeting,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                AppLocalizations.of(context).t('u_agent_overlay_hint'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white54, fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: agent.messages.length + (agent.busy ? 1 : 0),
      itemBuilder: (context, i) {
        if (agent.busy && i == agent.messages.length) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: Text('…', style: TextStyle(color: Colors.white54, fontSize: 22)),
          );
        }
        final m = agent.messages[i];
        final mine = m.role == 'user';
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!mine)
                Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 10, top: 2),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Color(0xFF10A37F), Color(0xFF6C63FF)]),
                  ),
                  child: const Icon(Icons.auto_awesome, size: 14, color: Colors.white),
                ),
              Expanded(
                child: Column(
                  crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    if (m.attachmentNames.isNotEmpty) ...[
                      Wrap(
                        spacing: 6,
                        children: m.attachmentNames
                            .map((n) => Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(n, style: const TextStyle(fontSize: 11)),
                                ))
                            .toList(),
                      ),
                      const SizedBox(height: 6),
                    ],
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: mine ? const Color(0xFF2F2F2F) : Colors.transparent,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(m.content, style: const TextStyle(color: Colors.white, height: 1.4, fontSize: 15)),
                    ),
                    if (m.artifacts.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      ...m.artifacts.map(
                        (a) => InkWell(
                          onTap: () => _openArtifact(a),
                          onLongPress: () => Share.share(a.url, subject: a.title ?? a.name),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 6),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2F2F2F),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF10A37F).withAlpha(80)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.description_rounded, color: Color(0xFF10A37F)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(a.title ?? a.name,
                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                                ),
                                const Icon(Icons.open_in_new, color: Colors.white54, size: 18),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _pendingFiles(UAgentProvider agent) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        scrollDirection: Axis.horizontal,
        itemCount: agent.pendingFiles.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final f = agent.pendingFiles[i];
          return Chip(
            deleteIconColor: Colors.white70,
            onDeleted: () => agent.removePendingFile(i),
            backgroundColor: const Color(0xFF2F2F2F),
            label: Text(f.name, style: const TextStyle(color: Colors.white, fontSize: 12)),
            avatar: const Icon(Icons.insert_drive_file, size: 16, color: Color(0xFF10A37F)),
          );
        },
      ),
    );
  }

  Widget _composer(AppLocalizations l10n, UAgentProvider agent) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              onPressed: agent.busy
                  ? null
                  : () async {
                      await showModalBottomSheet<void>(
                        context: context,
                        backgroundColor: const Color(0xFF2F2F2F),
                        builder: (ctx) => SafeArea(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ListTile(
                                leading: const Icon(Icons.photo_library, color: Colors.white),
                                title: Text(l10n.t('u_agent_attach_photo'),
                                    style: const TextStyle(color: Colors.white)),
                                onTap: () {
                                  Navigator.pop(ctx);
                                  _pickImage(ImageSource.gallery);
                                },
                              ),
                              ListTile(
                                leading: const Icon(Icons.camera_alt, color: Colors.white),
                                title: Text(l10n.t('u_agent_attach_camera'),
                                    style: const TextStyle(color: Colors.white)),
                                onTap: () {
                                  Navigator.pop(ctx);
                                  _pickImage(ImageSource.camera);
                                },
                              ),
                              ListTile(
                                leading: const Icon(Icons.attach_file, color: Colors.white),
                                title: Text(l10n.t('u_agent_attach_file'),
                                    style: const TextStyle(color: Colors.white)),
                                onTap: () {
                                  Navigator.pop(ctx);
                                  _pickFiles();
                                },
                              ),
                            ],
                          ),
                        ),
                      );
                    },
              icon: const Icon(Icons.add_circle_outline, color: Colors.white70, size: 28),
            ),
            Expanded(
              child: TextField(
                controller: _controller,
                style: const TextStyle(color: Colors.white),
                minLines: 1,
                maxLines: 5,
                decoration: InputDecoration(
                  hintText: l10n.t('u_agent_hint'),
                  hintStyle: const TextStyle(color: Colors.white38),
                  filled: true,
                  fillColor: const Color(0xFF2F2F2F),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onSubmitted: (_) => _submit(),
              ),
            ),
            const SizedBox(width: 6),
            // ChatGPT-style voice entry
            IconButton.filled(
              onPressed: agent.busy ? null : _enterVoiceMode,
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xFF10A37F),
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.graphic_eq_rounded),
            ),
            const SizedBox(width: 4),
            IconButton.filled(
              onPressed: agent.busy ? null : _submit,
              style: IconButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
              ),
              icon: agent.busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                    )
                  : const Icon(Icons.arrow_upward_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

/// ChatGPT Advanced Voice–style full-screen orb UI.
class _ChatGptVoiceMode extends StatelessWidget {
  const _ChatGptVoiceMode({
    required this.wave,
    required this.onClose,
    required this.onInterrupt,
  });

  final AnimationController wave;
  final VoidCallback onClose;
  final VoidCallback onInterrupt;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final agent = context.watch<UAgentProvider>();
    String label;
    if (agent.busy) {
      label = l10n.t('u_agent_thinking');
    } else if (agent.speaking) {
      label = l10n.t('u_agent_speaking');
    } else if (agent.listening) {
      label = l10n.t('u_agent_listening');
    } else {
      label = l10n.t('u_agent_voice_ready');
    }

    return SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: IconButton(
              onPressed: onClose,
              icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 28),
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: onInterrupt,
            child: AnimatedBuilder(
              animation: wave,
              builder: (context, _) {
                return CustomPaint(
                  size: const Size(220, 220),
                  painter: _VoiceOrbPainter(
                    t: wave.value,
                    listening: agent.listening,
                    speaking: agent.speaking,
                    thinking: agent.busy,
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 28),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              agent.liveTranscript.isEmpty
                  ? l10n.t('u_agent_voice_tap_interrupt')
                  : agent.liveTranscript,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: agent.liveTranscript.isEmpty ? Colors.white38 : Colors.white70,
                fontSize: 15,
                height: 1.35,
              ),
            ),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: Text(
              l10n.t('nav_u_agent'),
              style: const TextStyle(color: Colors.white38, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceOrbPainter extends CustomPainter {
  _VoiceOrbPainter({
    required this.t,
    required this.listening,
    required this.speaking,
    required this.thinking,
  });

  final double t;
  final bool listening;
  final bool speaking;
  final bool thinking;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final base = size.width * 0.28;
    Color a;
    Color b;
    if (speaking) {
      a = const Color(0xFF10A37F);
      b = const Color(0xFF6C63FF);
    } else if (listening) {
      a = const Color(0xFF54E3C0);
      b = const Color(0xFF10A37F);
    } else if (thinking) {
      a = const Color(0xFF6C63FF);
      b = const Color(0xFFAB68FF);
    } else {
      a = const Color(0xFF3F3F3F);
      b = const Color(0xFF10A37F);
    }

    for (var i = 3; i >= 0; i--) {
      final pulse = 1 + math.sin((t * math.pi * 2) + i) * (listening || speaking ? 0.12 : 0.05);
      final r = base * (1.15 + i * 0.22) * pulse;
      final paint = Paint()
        ..shader = RadialGradient(
          colors: [a.withAlpha(40 - i * 8), b.withAlpha(0)],
        ).createShader(Rect.fromCircle(center: center, radius: r));
      canvas.drawCircle(center, r, paint);
    }

    final path = Path();
    const n = 64;
    for (var i = 0; i <= n; i++) {
      final ang = (i / n) * math.pi * 2;
      final wobble = math.sin(ang * 3 + t * math.pi * 2) * (speaking ? 10 : listening ? 8 : 4) +
          math.cos(ang * 5 - t * math.pi * 2) * (thinking ? 6 : 3);
      final r = base + wobble;
      final p = Offset(center.dx + math.cos(ang) * r, center.dy + math.sin(ang) * r);
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    final fill = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [a, b],
      ).createShader(Rect.fromCircle(center: center, radius: base + 16));
    canvas.drawPath(path, fill);
  }

  @override
  bool shouldRepaint(covariant _VoiceOrbPainter oldDelegate) =>
      oldDelegate.t != t ||
      oldDelegate.listening != listening ||
      oldDelegate.speaking != speaking ||
      oldDelegate.thinking != thinking;
}

/// Standalone route wrapper.
class UAgentScreen extends StatelessWidget {
  const UAgentScreen({super.key, this.embedded = false});
  final bool embedded;

  @override
  Widget build(BuildContext context) => const UAgentHost();
}
