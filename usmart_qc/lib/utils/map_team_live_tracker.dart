import 'dart:async';

import '../config/api_config.dart';
import '../models/team_live_location.dart';
import '../services/api_service.dart';
import 'map_live_location.dart';

/// Posts device GPS and polls workspace team locations while a QField map is open.
class MapTeamLiveTracker {
  MapTeamLiveTracker({
    required ApiService api,
    required this.currentUserId,
    required this.workspaceEnabled,
    required this.viewTeam,
    this.onTeamChanged,
  }) : _api = api;

  final ApiService _api;
  final String? currentUserId;
  final bool workspaceEnabled;
  final bool viewTeam;
  final void Function()? onTeamChanged;

  List<TeamLiveLocation> _team = const [];
  Timer? _postTimer;
  Timer? _pollTimer;
  MapLiveLocation? _liveLoc;

  List<TeamLiveLocation> get team => _team;

  void start(MapLiveLocation liveLoc) {
    if (!workspaceEnabled) return;
    stop();
    _liveLoc = liveLoc;
    unawaited(_postOnce());
    _postTimer = Timer.periodic(const Duration(seconds: 15), (_) => _postOnce());
    if (viewTeam) {
      unawaited(_pollOnce());
      _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _pollOnce());
    }
  }

  /// Push latest GPS to the server (e.g. when device position updates).
  void syncPosition() {
    unawaited(_postOnce());
  }

  void stop() {
    _postTimer?.cancel();
    _pollTimer?.cancel();
    _postTimer = null;
    _pollTimer = null;
    _liveLoc = null;
    if (_team.isNotEmpty) {
      _team = const [];
      onTeamChanged?.call();
    }
  }

  Future<void> _postOnce() async {
    final pos = _liveLoc?.position;
    if (pos == null) return;
    try {
      await _api.post(
        ApiConfig.privateCompanyLiveLocations,
        body: {
          'latitude': pos.latitude,
          'longitude': pos.longitude,
          if (_liveLoc?.accuracyM != null) 'accuracy': _liveLoc!.accuracyM,
        },
      );
    } catch (_) {}
  }

  Future<void> _pollOnce() async {
    if (!viewTeam) return;
    try {
      final data = await _api.get(ApiConfig.privateCompanyLiveLocations);
      if (data['success'] != true || data['locations'] is! List) return;
      final list = (data['locations'] as List)
          .map((e) => TeamLiveLocation.fromJson(e as Map<String, dynamic>))
          .where((t) =>
              t.requesterId.isNotEmpty &&
              t.latitude != 0 &&
              t.longitude != 0 &&
              t.requesterId != currentUserId)
          .toList();
      _team = list;
      onTeamChanged?.call();
    } catch (_) {}
  }
}
