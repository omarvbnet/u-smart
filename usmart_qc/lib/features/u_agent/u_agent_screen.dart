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
import '../../services/api_service.dart';
import 'u_agent_provider.dart';
import 'u_agent_service.dart';

/// WhatsApp-style floating U Agent: animated bubble + full chat overlay.
/// Place inside a [Stack] on dashboards (not in the bottom navigation bar).
class UAgentHost extends StatelessWidget {
  const UAgentHost({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiService>();
    return ChangeNotifierProvider(
      create: (_) {
        final p = UAgentProvider(UAgentService(api));
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
            Positioned(
              right: 16,
              bottom: 88,
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

class _UAgentFabState extends State<_UAgentFab> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final agent = context.watch<UAgentProvider>();
    return AnimatedScale(
      scale: widget.visible ? 1 : 0.2,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(
        opacity: widget.visible ? 1 : 0,
        duration: const Duration(milliseconds: 200),
        child: IgnorePointer(
          ignoring: !widget.visible,
          child: GestureDetector(
            onTap: agent.toggleOpen,
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (context, child) {
                final glow = 12 + (_pulse.value * 14);
                return Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF25D366), Color(0xFF6C63FF), Color(0xFF00D4AA)],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF25D366).withAlpha(90),
                        blurRadius: glow,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: child,
                );
              },
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Icon(Icons.auto_awesome, color: Colors.white, size: 28),
                  if (agent.busy || agent.listening)
                    Positioned(
                      right: 10,
                      top: 10,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: agent.listening ? Colors.redAccent : Colors.amber,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                      ),
                    ),
                ],
              ),
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

class _UAgentChatOverlayState extends State<_UAgentChatOverlay>
    with TickerProviderStateMixin {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final _speech = stt.SpeechToText();
  final _tts = FlutterTts();
  late final AnimationController _sheetCtrl;
  late final AnimationController _waveCtrl;
  bool _speechReady = false;
  bool _ttsReady = false;
  bool _autoSpeak = true;

  @override
  void initState() {
    super.initState();
    _sheetCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 380),
    )..forward();
    _waveCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
    _initVoice();
  }

  Future<void> _initVoice() async {
    try {
      _speechReady = await _speech.initialize(
        onError: (e) => debugPrint('STT error: $e'),
        onStatus: (s) {
          if (!mounted) return;
          if (s == 'notListening' || s == 'done') {
            context.read<UAgentProvider>().setListening(false);
          }
        },
      );
      await _tts.setSpeechRate(0.48);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.02);
      if (!mounted) return;
      final locale = Localizations.localeOf(context).languageCode;
      if (locale.startsWith('ar')) {
        await _tts.setLanguage('ar-SA');
      } else {
        await _tts.setLanguage('en-US');
      }
      _tts.setStartHandler(() {
        if (mounted) context.read<UAgentProvider>().setSpeaking(true);
      });
      _tts.setCompletionHandler(() {
        if (mounted) context.read<UAgentProvider>().setSpeaking(false);
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
    _sheetCtrl.dispose();
    _waveCtrl.dispose();
    _controller.dispose();
    _scroll.dispose();
    _speech.stop();
    _tts.stop();
    super.dispose();
  }

  Future<void> _close() async {
    await _speech.stop();
    await _tts.stop();
    await _sheetCtrl.reverse();
    if (mounted) context.read<UAgentProvider>().setOpen(false);
  }

  Future<void> _toggleListen() async {
    final agent = context.read<UAgentProvider>();
    if (!_speechReady) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).t('u_agent_voice_unavailable'))),
      );
      return;
    }
    if (agent.listening) {
      await _speech.stop();
      agent.setListening(false);
      return;
    }
    await _tts.stop();
    agent.setListening(true);
    await _speech.listen(
      onResult: (result) {
        _controller.text = result.recognizedWords;
        _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
        if (result.finalResult && result.recognizedWords.trim().isNotEmpty) {
          agent.setListening(false);
          _submit(fromVoice: true);
        }
      },
      listenFor: const Duration(seconds: 30),
      pauseFor: const Duration(seconds: 3),
      localeId: Localizations.localeOf(context).languageCode.startsWith('ar') ? 'ar_SA' : 'en_US',
      cancelOnError: true,
      partialResults: true,
    );
  }

  Future<void> _pickFiles() async {
    final agent = context.read<UAgentProvider>();
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.custom,
      allowedExtensions: const [
        'pdf',
        'png',
        'jpg',
        'jpeg',
        'webp',
        'txt',
        'csv',
        'md',
        'json',
        'doc',
        'docx',
        'xls',
        'xlsx',
      ],
    );
    if (result == null) return;
    for (final f in result.files) {
      agent.addPendingFile(UAgentPendingFile(
        name: f.name,
        path: f.path,
        bytes: f.bytes,
      ));
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final agent = context.read<UAgentProvider>();
    final picker = ImagePicker();
    final x = await picker.pickImage(source: source, imageQuality: 85);
    if (x == null) return;
    agent.addPendingFile(UAgentPendingFile(
      name: x.name,
      path: x.path,
      contentType: 'image/jpeg',
    ));
  }

  Future<void> _submit({bool fromVoice = false}) async {
    final agent = context.read<UAgentProvider>();
    final text = _controller.text;
    _controller.clear();
    final reply = await agent.send(text, fromVoice: fromVoice);
    if (_scroll.hasClients) {
      await Future<void>.delayed(const Duration(milliseconds: 60));
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
    if (_autoSpeak && _ttsReady && reply != null && reply.trim().isNotEmpty) {
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
                filter: ImageFilter.blur(sigmaX: 10 * t, sigmaY: 10 * t),
                child: Container(color: Colors.black.withAlpha((140 * t).round())),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Transform.translate(
                offset: Offset(0, (1 - t) * media.size.height * 0.35),
                child: Opacity(
                  opacity: t,
                  child: Material(
                    color: Colors.transparent,
                    child: Container(
                      height: media.size.height * 0.88,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: const Color(0xFF0B141A),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                        border: Border.all(color: Colors.white.withAlpha(18)),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF25D366).withAlpha(40),
                            blurRadius: 40,
                            offset: const Offset(0, -8),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          _header(l10n, agent),
                          if (agent.error != null)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text(
                                agent.error!,
                                style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                              ),
                            ),
                          if (agent.approvals.isNotEmpty) _approvalsStrip(l10n, agent),
                          Expanded(child: _messages(agent)),
                          if (agent.pendingFiles.isNotEmpty) _pendingFiles(agent),
                          if (agent.listening) _listeningBar(l10n),
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
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF075E54).withAlpha(220),
            const Color(0xFF128C7E).withAlpha(180),
          ],
        ),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            IconButton(
              onPressed: _close,
              icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 28),
            ),
            Container(
              width: 42,
              height: 42,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [Color(0xFF25D366), Color(0xFF6C63FF)]),
              ),
              child: const Icon(Icons.auto_awesome, color: Colors.white, size: 22),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.t('nav_u_agent'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    agent.listening
                        ? l10n.t('u_agent_listening')
                        : agent.speaking
                            ? l10n.t('u_agent_speaking')
                            : agent.busy
                                ? l10n.t('u_agent_thinking')
                                : '${agent.status}${agent.activeProvider != null ? ' · ${agent.activeProvider}' : ''}',
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: l10n.t('u_agent_auto_speak'),
              onPressed: () => setState(() => _autoSpeak = !_autoSpeak),
              icon: Icon(
                _autoSpeak ? Icons.volume_up_rounded : Icons.volume_off_rounded,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _approvalsStrip(AppLocalizations l10n, UAgentProvider agent) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        scrollDirection: Axis.horizontal,
        itemCount: agent.approvals.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final a = agent.approvals[i];
          return Container(
            width: 210,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF1F2C34),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.amber.withAlpha(80)),
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
                          onPressed: () => agent.resolveApproval(a['id'].toString(), approve: true),
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
                  Text(
                    l10n.t('u_agent_waiting_approval'),
                    style: const TextStyle(color: Colors.amber, fontSize: 11),
                  ),
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
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.85, end: 1),
                duration: const Duration(milliseconds: 900),
                curve: Curves.easeInOut,
                builder: (context, v, child) => Transform.scale(scale: v, child: child),
                child: Container(
                  width: 84,
                  height: 84,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Color(0xFF25D366), Color(0xFF6C63FF)]),
                  ),
                  child: const Icon(Icons.auto_awesome, color: Colors.white, size: 40),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                agent.greeting,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                AppLocalizations.of(context).t('u_agent_overlay_hint'),
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      itemCount: agent.messages.length + (agent.busy ? 1 : 0),
      itemBuilder: (context, i) {
        if (agent.busy && i == agent.messages.length) {
          return Align(
            alignment: Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF1F2C34),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(3, (d) {
                  return AnimatedBuilder(
                    animation: _waveCtrl,
                    builder: (context, _) {
                      final phase = (_waveCtrl.value + d * 0.2) % 1.0;
                      final y = math.sin(phase * math.pi * 2) * 3;
                      return Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        width: 7,
                        height: 7,
                        transform: Matrix4.translationValues(0, y, 0),
                        decoration: const BoxDecoration(
                          color: Color(0xFF25D366),
                          shape: BoxShape.circle,
                        ),
                      );
                    },
                  );
                }),
              ),
            ),
          );
        }
        final m = agent.messages[i];
        final mine = m.role == 'user';
        return Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
            decoration: BoxDecoration(
              color: mine ? const Color(0xFF005C4B) : const Color(0xFF1F2C34),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(mine ? 16 : 4),
                bottomRight: Radius.circular(mine ? 4 : 16),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (m.attachmentNames.isNotEmpty) ...[
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: m.attachmentNames
                        .map(
                          (n) => Chip(
                            visualDensity: VisualDensity.compact,
                            backgroundColor: Colors.black26,
                            label: Text(n, style: const TextStyle(color: Colors.white70, fontSize: 11)),
                            avatar: const Icon(Icons.attach_file, size: 14, color: Colors.white70),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 6),
                ],
                Text(m.content, style: const TextStyle(color: Colors.white, height: 1.35)),
                if (m.artifacts.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...m.artifacts.map(
                    (a) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: InkWell(
                        onTap: () => _openArtifact(a),
                        onLongPress: () => Share.share(a.url, subject: a.title ?? a.name),
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.black26,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF25D366).withAlpha(90)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.description_rounded, color: Color(0xFF25D366)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  a.title ?? a.name,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                                ),
                              ),
                              const Icon(Icons.open_in_new, color: Colors.white54, size: 18),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
                if (m.timeline.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...m.timeline.take(6).map(
                        (t) => Text(
                          '• ${t.label}',
                          style: const TextStyle(color: Colors.white54, fontSize: 11),
                        ),
                      ),
                ],
                if (!mine && m.content.trim().isNotEmpty)
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton(
                      visualDensity: VisualDensity.compact,
                      onPressed: () async {
                        if (!_ttsReady) return;
                        await _tts.stop();
                        await _tts.speak(m.content.length > 1200 ? m.content.substring(0, 1200) : m.content);
                      },
                      icon: const Icon(Icons.record_voice_over_rounded, color: Colors.white54, size: 18),
                    ),
                  ),
              ],
            ),
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
            backgroundColor: const Color(0xFF1F2C34),
            label: Text(f.name, style: const TextStyle(color: Colors.white, fontSize: 12)),
            avatar: const Icon(Icons.insert_drive_file, size: 16, color: Color(0xFF25D366)),
          );
        },
      ),
    );
  }

  Widget _listeningBar(AppLocalizations l10n) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
      child: Row(
        children: [
          AnimatedBuilder(
            animation: _waveCtrl,
            builder: (context, _) {
              return Row(
                children: List.generate(5, (i) {
                  final h = 8 + (math.sin((_waveCtrl.value * math.pi * 2) + i) * 10).abs();
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: 4,
                    height: h,
                    decoration: BoxDecoration(
                      color: Colors.redAccent,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              );
            },
          ),
          const SizedBox(width: 10),
          Text(l10n.t('u_agent_listening'), style: const TextStyle(color: Colors.redAccent)),
        ],
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
                        backgroundColor: const Color(0xFF1F2C34),
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
              icon: const Icon(Icons.add_circle_outline, color: Color(0xFF25D366), size: 28),
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
                  fillColor: const Color(0xFF1F2C34),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onSubmitted: (_) => _submit(),
              ),
            ),
            const SizedBox(width: 6),
            _MicButton(
              listening: agent.listening,
              enabled: !agent.busy,
              onTap: _toggleListen,
              wave: _waveCtrl,
            ),
            const SizedBox(width: 4),
            IconButton.filled(
              onPressed: agent.busy ? null : () => _submit(),
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xFF25D366),
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
    );
  }
}

class _MicButton extends StatelessWidget {
  const _MicButton({
    required this.listening,
    required this.enabled,
    required this.onTap,
    required this.wave,
  });

  final bool listening;
  final bool enabled;
  final VoidCallback onTap;
  final AnimationController wave;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: wave,
      builder: (context, child) {
        final scale = listening ? 1 + (math.sin(wave.value * math.pi * 2).abs() * 0.12) : 1.0;
        return Transform.scale(
          scale: scale,
          child: IconButton.filled(
            onPressed: enabled ? onTap : null,
            style: IconButton.styleFrom(
              backgroundColor: listening ? Colors.redAccent : const Color(0xFF1F2C34),
              foregroundColor: Colors.white,
            ),
            icon: Icon(listening ? Icons.stop_rounded : Icons.mic_rounded),
          ),
        );
      },
    );
  }
}

/// Standalone route (optional). Prefer [UAgentHost] on dashboards.
class UAgentScreen extends StatelessWidget {
  const UAgentScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  Widget build(BuildContext context) {
    return const UAgentHost();
  }
}
