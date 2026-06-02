import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../models/workspace_site.dart';
import '../providers/auth_provider.dart';
import '../providers/private_company_provider.dart';
import '../services/api_service.dart';
import '../utils/map_live_location.dart';
import '../utils/map_team_live_tracker.dart';

/// Full-screen workspace map: shows every workspace site (labelled by site name)
/// together with live staff locations (labelled by staff name when permitted).
class WorkspaceMapScreen extends StatefulWidget {
  const WorkspaceMapScreen({super.key});

  @override
  State<WorkspaceMapScreen> createState() => _WorkspaceMapScreenState();
}

class _WorkspaceMapScreenState extends State<WorkspaceMapScreen> {
  static const String _tileUrl =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
  static const List<String> _tileSubs = ['a', 'b', 'c', 'd'];
  // Iraq centroid fallback until sites / GPS load.
  static const LatLng _fallbackCenter = LatLng(33.3152, 44.3661);

  final MapController _mapController = MapController();
  late final MapLiveLocation _liveLoc;
  MapTeamLiveTracker? _teamTracker;

  List<WorkspaceSite> _sites = const [];
  bool _loadingSites = true;
  bool _autoFitted = false;

  @override
  void initState() {
    super.initState();
    _liveLoc = MapLiveLocation(onPositionChanged: () {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    await _fetchSites();
    await MapLiveLocation.ensurePermission();
    await _liveLoc.start();
    if (!mounted) return;
    _startTeamTracking();
    _fitToContent();
  }

  Future<void> _fetchSites() async {
    try {
      final data = await context.read<ApiService>().get(ApiConfig.privateCompanySites);
      if (data['success'] == true && data['sites'] is List) {
        final list = (data['sites'] as List)
            .map((e) => WorkspaceSite.fromJson(e as Map<String, dynamic>))
            .where((s) => s.hasCoordinates)
            .toList();
        if (mounted) setState(() => _sites = list);
      }
    } catch (_) {
      /* ignore — map still renders staff + own location */
    }
    if (mounted) setState(() => _loadingSites = false);
  }

  void _startTeamTracking() {
    final pc = context.read<PrivateCompanyProvider>();
    if (!pc.canOpenPrivateWorkspace) return;
    final auth = context.read<AuthProvider>();
    _teamTracker?.stop();
    _teamTracker = MapTeamLiveTracker(
      api: context.read<ApiService>(),
      currentUserId: auth.user?.id,
      workspaceEnabled: true,
      onTeamChanged: () {
        if (!mounted) return;
        setState(() {});
        if (!_autoFitted) _fitToContent();
      },
    );
    _teamTracker!.start(_liveLoc);
  }

  void _fitToContent() {
    final points = <LatLng>[
      for (final s in _sites)
        if (s.latitude != null && s.longitude != null)
          LatLng(s.latitude!, s.longitude!),
      if (_liveLoc.position != null) _liveLoc.position!,
      for (final t in _teamTracker?.team ?? const [])
        LatLng(t.latitude, t.longitude),
    ];
    if (points.isEmpty) return;
    if (points.length == 1) {
      try {
        _mapController.move(points.first, 14);
        _autoFitted = true;
      } catch (_) {}
      return;
    }
    try {
      _mapController.fitCamera(
        CameraFit.coordinates(
          coordinates: points,
          padding: const EdgeInsets.all(64),
          maxZoom: 16,
        ),
      );
      _autoFitted = true;
    } catch (_) {}
  }

  Future<void> _refresh() async {
    setState(() => _loadingSites = true);
    await _fetchSites();
    _teamTracker?.syncPosition();
    _autoFitted = false;
    _fitToContent();
  }

  List<Marker> _siteMarkers() {
    return [
      for (final s in _sites)
        if (s.latitude != null && s.longitude != null)
          Marker(
            point: LatLng(s.latitude!, s.longitude!),
            width: 140,
            height: 56,
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  constraints: const BoxConstraints(maxWidth: 136),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xEE12122A),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: const Color(0xFF6C63FF).withAlpha(180)),
                  ),
                  child: Text(
                    s.siteCode,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                const Icon(Icons.location_on,
                    color: Color(0xFF6C63FF), size: 30),
              ],
            ),
          ),
    ];
  }

  @override
  void dispose() {
    _teamTracker?.stop();
    _liveLoc.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final team = _teamTracker?.team ?? const [];
    final showNames = _teamTracker?.showNames ?? false;
    final canViewTeam = _teamTracker?.canViewTeam ?? false;
    final initialCenter = _sites.isNotEmpty &&
            _sites.first.latitude != null &&
            _sites.first.longitude != null
        ? LatLng(_sites.first.latitude!, _sites.first.longitude!)
        : (_liveLoc.position ?? _fallbackCenter);

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A1F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A1F),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Workspace map',
            style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _loadingSites ? null : _refresh,
          ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: initialCenter,
              initialZoom: _sites.isNotEmpty ? 12 : 6,
              minZoom: 3,
              maxZoom: 18,
            ),
            children: [
              TileLayer(
                urlTemplate: _tileUrl,
                subdomains: _tileSubs,
                userAgentPackageName: 'usmart_qc',
                maxNativeZoom: 19,
              ),
              MarkerLayer(markers: _siteMarkers()),
              ...buildTeamLiveLocationMapLayers(team, showNames: showNames),
              ...buildUserLocationMapLayers(_liveLoc.position, _liveLoc.accuracyM),
            ],
          ),
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: _legend(team.length, canViewTeam),
          ),
          Positioned(
            right: 12,
            bottom: 24,
            child: Column(
              children: [
                MapMyLocationButton(
                  enabled: _liveLoc.hasPosition,
                  onPressed: () => _liveLoc.moveMapToUser(_mapController),
                ),
                const SizedBox(height: 10),
                Material(
                  color: const Color(0xEE12122A),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: _fitToContent,
                    borderRadius: BorderRadius.circular(12),
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: Icon(Icons.fit_screen_rounded,
                          color: Color(0xFF6C63FF), size: 22),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_loadingSites)
            const Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: LinearProgressIndicator(
                minHeight: 2,
                backgroundColor: Colors.transparent,
                color: Color(0xFF6C63FF),
              ),
            ),
          if (!_loadingSites && _sites.isEmpty && team.isEmpty)
            Center(
              child: Container(
                margin: const EdgeInsets.all(24),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xEE12122A),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.map_outlined,
                        color: Colors.white54, size: 36),
                    const SizedBox(height: 10),
                    Text(
                      canViewTeam
                          ? 'No sites with map coordinates yet, and no staff are sharing live location right now.'
                          : 'No sites with map coordinates yet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Colors.white.withAlpha(200), height: 1.4),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _legend(int staffCount, bool canViewTeam) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xEE12122A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withAlpha(26)),
      ),
      child: Row(
        children: [
          const Icon(Icons.location_on, color: Color(0xFF6C63FF), size: 16),
          const SizedBox(width: 5),
          Text('${_sites.length} sites',
              style: const TextStyle(
                  color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 14),
          const Icon(Icons.person_pin_circle_rounded,
              color: Color(0xFF00D4AA), size: 16),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              canViewTeam
                  ? '$staffCount staff live'
                  : 'Live staff hidden for your role',
              style: const TextStyle(
                  color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
