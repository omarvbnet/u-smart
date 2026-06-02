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

  // Approximate governorate centers, used to place sites that were created
  // without precise coordinates so every workspace site is still visible.
  static const Map<String, LatLng> _provinceCentroids = {
    'Al-Anbar': LatLng(33.4258, 43.3000),
    'Babil': LatLng(32.4682, 44.5500),
    'Baghdad': LatLng(33.3152, 44.3661),
    'Basra': LatLng(30.5081, 47.7835),
    'Dhi Qar': LatLng(31.0428, 46.2575),
    'Al-Qadisiyyah': LatLng(31.9923, 44.9249),
    'Diyala': LatLng(33.7736, 45.1494),
    'Duhok': LatLng(36.8674, 42.9880),
    'Erbil': LatLng(36.1911, 44.0092),
    'Halabja': LatLng(35.1773, 45.9864),
    'Karbala': LatLng(32.6160, 44.0249),
    'Kirkuk': LatLng(35.4681, 44.3922),
    'Maysan': LatLng(31.8356, 47.1448),
    'Muthanna': LatLng(31.3093, 45.2810),
    'Najaf': LatLng(31.9890, 44.3148),
    'Ninawa': LatLng(36.3450, 43.1450),
    'Salah Al-Din': LatLng(34.6116, 43.6786),
    'Sulaymaniyah': LatLng(35.5614, 45.4347),
    'Wasit': LatLng(32.5150, 45.8181),
  };

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
        // Keep ALL workspace sites (not just QField / precisely-located ones).
        // Sites without exact coordinates fall back to their province centroid.
        final list = (data['sites'] as List)
            .map((e) => WorkspaceSite.fromJson(e as Map<String, dynamic>))
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

  /// Deterministic position for a site, falling back to a jittered province
  /// centroid when the site has no precise coordinates. Returns null only when
  /// the site has neither coordinates nor a recognizable province.
  ({LatLng point, bool approx})? _positionFor(WorkspaceSite s) {
    if (s.latitude != null && s.longitude != null) {
      return (point: LatLng(s.latitude!, s.longitude!), approx: false);
    }
    final centroid = _provinceCentroids[s.province.trim()];
    if (centroid == null) return null;
    // Stable jitter (~±5km) so multiple sites in the same province don't stack.
    final h = s.id.hashCode;
    final dLat = (((h % 9) - 4)) * 0.013;
    final dLng = ((((h ~/ 9) % 9) - 4)) * 0.013;
    return (point: LatLng(centroid.latitude + dLat, centroid.longitude + dLng), approx: true);
  }

  List<({WorkspaceSite site, LatLng point, bool approx})> _plottableSites() {
    final out = <({WorkspaceSite site, LatLng point, bool approx})>[];
    for (final s in _sites) {
      final p = _positionFor(s);
      if (p != null) out.add((site: s, point: p.point, approx: p.approx));
    }
    return out;
  }

  void _fitToContent() {
    final points = <LatLng>[
      for (final p in _plottableSites()) p.point,
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
      for (final entry in _plottableSites())
        Marker(
          point: entry.point,
          width: 140,
          height: 58,
          alignment: Alignment.bottomCenter,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                constraints: const BoxConstraints(maxWidth: 136),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xEE12122A),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: (entry.approx
                            ? const Color(0xFFFBBF24)
                            : const Color(0xFF6C63FF))
                        .withAlpha(180),
                  ),
                ),
                child: Text(
                  entry.approx ? '${entry.site.siteCode}  ≈' : entry.site.siteCode,
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
              Icon(
                entry.approx ? Icons.place_outlined : Icons.location_on,
                color: entry.approx
                    ? const Color(0xFFFBBF24)
                    : const Color(0xFF6C63FF),
                size: entry.approx ? 26 : 30,
              ),
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
                          ? 'No workspace sites yet, and no staff are sharing live location right now.'
                          : 'No workspace sites yet.',
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
    final plottable = _plottableSites();
    final approxCount = plottable.where((p) => p.approx).length;
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
          Text(
            approxCount > 0
                ? '${plottable.length} sites · $approxCount ≈ province'
                : '${plottable.length} sites',
            style: const TextStyle(
                color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 12),
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
