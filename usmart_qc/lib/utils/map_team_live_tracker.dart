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
    this.onTeamChanged,
  }) : _api = api;

  final ApiService _api;
  final String? currentUserId;
  final bool workspaceEnabled;
  final void Function()? onTeamChanged;

  List<TeamLiveLocation> _team = const [];
  bool _canViewTeam = false;
  bool _showNames = false;
  Timer? _postTimer;
  Timer? _pollTimer;
  MapLiveLocation? _liveLoc;

  List<TeamLiveLocation> get team => _team;
  bool get canViewTeam => _canViewTeam;
  bool get showNames => _showNames;

  void start(MapLiveLocation liveLoc) {
    if (!workspaceEnabled) return;
    stop();
    _liveLoc = liveLoc;
    unawaited(_postOnce());
    _postTimer = Timer.periodic(const Duration(seconds: 10), (_) => _postOnce());
    unawaited(_pollOnce());
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _pollOnce());
  }

  void syncPosition() {
    unawaited(_postOnce());
  }

  void stop() {
    _postTimer?.cancel();
    _pollTimer?.cancel();
    _postTimer = null;
    _pollTimer = null;
    _liveLoc = null;
    _canViewTeam = false;
    if (_team.isNotEmpty) {
      _team = const [];
      onTeamChanged?.call();
    }
  }

  Future<void> _postOnce() async {
    await _liveLoc?.refreshCurrentPosition();
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
    try {
      final data = await _api.get(ApiConfig.privateCompanyLiveLocations);
      if (data['success'] != true) return;
      _canViewTeam = data['canViewTeam'] == true;
      _showNames = data['canViewNames'] == true;
      if (!_canViewTeam) {
        if (_team.isNotEmpty) {
          _team = const [];
          onTeamChanged?.call();
        }
        return;
      }
      if (data['locations'] is! List) return;
      final list = (data['locations'] as List)
          .map((e) => TeamLiveLocation.fromJson(e as Map<String, dynamic>))
          .where((t) =>
              t.requesterId.isNotEmpty &&
              (t.latitude.abs() > 0.0001 || t.longitude.abs() > 0.0001) &&
              t.requesterId != currentUserId)
          .toList();
      _team = list;
      onTeamChanged?.call();
    } catch (_) {}
  }
}
