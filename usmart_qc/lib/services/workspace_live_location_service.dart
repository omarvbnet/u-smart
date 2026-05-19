import 'dart:async';

import '../config/api_config.dart';
import '../utils/map_live_location.dart';
import 'api_service.dart';

/// Shares GPS with the workspace while the app is open (so managers see staff on maps).
class WorkspaceLiveLocationService {
  WorkspaceLiveLocationService(this._api);

  final ApiService _api;
  final MapLiveLocation _liveLoc = MapLiveLocation();
  Timer? _postTimer;
  bool _running = false;
  bool _workspaceActive = false;

  bool get isRunning => _running;

  void setWorkspaceActive(bool active) {
    _workspaceActive = active;
    if (!active && _running) {
      stop();
    } else if (active && !_running) {
      unawaited(start());
    }
  }

  Future<void> start() async {
    if (_running || !_workspaceActive) return;
    final ok = await MapLiveLocation.ensurePermission();
    if (!ok) return;
    _running = true;
    await _liveLoc.start();
    await _postOnce();
    _postTimer = Timer.periodic(const Duration(seconds: 20), (_) => _postOnce());
  }

  void stop() {
    _running = false;
    _postTimer?.cancel();
    _postTimer = null;
    _liveLoc.stop();
  }

  Future<void> _postOnce() async {
    if (!_workspaceActive) return;
    await _liveLoc.refreshCurrentPosition();
    final pos = _liveLoc.position;
    if (pos == null) return;
    try {
      await _api.post(
        ApiConfig.privateCompanyLiveLocations,
        body: {
          'latitude': pos.latitude,
          'longitude': pos.longitude,
          if (_liveLoc.accuracyM != null) 'accuracy': _liveLoc.accuracyM,
        },
      );
    } catch (_) {}
  }
}
