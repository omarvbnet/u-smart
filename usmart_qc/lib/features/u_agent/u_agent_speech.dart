import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:path_provider/path_provider.dart';

import 'u_agent_service.dart';

/// Speaks U Agent replies via Hamsa TTS (server) with on-device flutter_tts fallback.
class UAgentSpeech {
  UAgentSpeech(this._service);

  final UAgentService _service;
  final FlutterTts _fallback = FlutterTts();
  final AudioPlayer _player = AudioPlayer();
  bool _fallbackReady = false;
  bool _hamsaConfigured = true;
  bool _speaking = false;
  VoidCallback? onStart;
  VoidCallback? onComplete;
  VoidCallback? onCancel;

  bool get speaking => _speaking;

  Future<void> init({required String languageCode}) async {
    try {
      await _fallback.setSpeechRate(0.48);
      await _fallback.setVolume(1.0);
      await _fallback.setPitch(1.0);
      await _fallback.setLanguage(languageCode.startsWith('ar') ? 'ar-SA' : 'en-US');
      _fallback.setStartHandler(() {
        _speaking = true;
        onStart?.call();
      });
      _fallback.setCompletionHandler(() {
        _speaking = false;
        onComplete?.call();
      });
      _fallback.setCancelHandler(() {
        _speaking = false;
        onCancel?.call();
      });
      _fallbackReady = true;
    } catch (e) {
      debugPrint('UAgentSpeech fallback init: $e');
    }

    _player.onPlayerComplete.listen((_) {
      _speaking = false;
      onComplete?.call();
    });

    try {
      final status = await _service.fetchTtsStatus();
      if (status != null && status['configured'] == false) {
        _hamsaConfigured = false;
      }
    } catch (_) {}
  }

  Future<void> stop() async {
    try {
      await _player.stop();
    } catch (_) {}
    try {
      await _fallback.stop();
    } catch (_) {}
    if (_speaking) {
      _speaking = false;
      onCancel?.call();
    }
  }

  Future<void> speak(String text, {String? languageCode}) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    await stop();

    if (_hamsaConfigured) {
      try {
        final bytes = await _service.fetchHamsaTtsBytes(trimmed);
        if (bytes != null && bytes.isNotEmpty) {
          _speaking = true;
          onStart?.call();
          final dir = await getTemporaryDirectory();
          final file = File(
            '${dir.path}/u_agent_hamsa_${DateTime.now().millisecondsSinceEpoch}.wav',
          );
          await file.writeAsBytes(bytes, flush: true);
          await _player.play(DeviceFileSource(file.path));
          unawaited(Future<void>.delayed(const Duration(minutes: 2), () async {
            try {
              if (await file.exists()) await file.delete();
            } catch (_) {}
          }));
          return;
        }
        _hamsaConfigured = false;
      } catch (e) {
        debugPrint('Hamsa TTS failed, falling back: $e');
        _hamsaConfigured = false;
      }
    }

    if (!_fallbackReady) return;
    if (languageCode != null) {
      await _fallback.setLanguage(languageCode.startsWith('ar') ? 'ar-SA' : 'en-US');
    }
    await _fallback.speak(trimmed);
  }

  Future<void> dispose() async {
    await stop();
    await _player.dispose();
  }
}
