import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/app_localizations.dart';

/// Centralizes location-permission handling, including a one-time rationale
/// dialog before escalating to background ("Always") access so geofencing and
/// live workspace location keep working while the app is closed/backgrounded.
class LocationPermissions {
  LocationPermissions._();

  /// Global navigator key so services without a [BuildContext] (geofence,
  /// live-location) can show the background-location rationale dialog.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  static const _rationaleShownKey = 'bg_location_rationale_shown_v1';
  static bool _escalating = false;

  /// Ensures at least while-in-use permission. Returns true when granted
  /// (whileInUse or always).
  static Future<bool> ensureForeground() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  /// Ensures foreground permission, then (once) explains and requests an
  /// upgrade to background/"Always" access so site-arrival detection and live
  /// location continue without the app open. Only shows the rationale a single
  /// time. Returns true when at least foreground access is granted.
  static Future<bool> ensureBackground() async {
    final ok = await ensureForeground();
    if (!ok) return false;

    final perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.always) return true;
    if (_escalating) return true;

    _escalating = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final shown = prefs.getBool(_rationaleShownKey) ?? false;
      if (!shown) {
        await prefs.setBool(_rationaleShownKey, true);
        await _showRationale();
      }
      // Re-request: on iOS this surfaces the system "Always" upgrade prompt;
      // on Android it triggers the background-location request.
      await Geolocator.requestPermission();
    } catch (_) {
      /* best-effort; foreground access already confirmed */
    } finally {
      _escalating = false;
    }
    return true;
  }

  static Future<void> _showRationale() async {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    final l10n = AppLocalizations.of(ctx);
    await showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('bg_loc_title'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        content: Text(
          l10n.t('bg_loc_body'),
          style: TextStyle(color: Colors.white.withAlpha(210), height: 1.5),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: Text(l10n.t('bg_loc_continue')),
          ),
        ],
      ),
    );
  }
}
