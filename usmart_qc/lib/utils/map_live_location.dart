import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../models/team_live_location.dart';

/// Tracks device GPS and builds flutter_map layers for a live blue-dot overlay.
class MapLiveLocation {
  MapLiveLocation({this.onPositionChanged});

  final VoidCallback? onPositionChanged;

  LatLng? _position;
  double? _accuracyM;
  StreamSubscription<Position>? _sub;

  LatLng? get position => _position;
  double? get accuracyM => _accuracyM;
  bool get hasPosition => _position != null;

  Future<void> start() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return;
    }
    await _sub?.cancel();
    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 4,
      ),
    ).listen((pos) {
      final next = LatLng(pos.latitude, pos.longitude);
      if (_position != null) {
        const dist = Distance();
        if (dist(_position!, next) < 3) {
          _accuracyM = pos.accuracy;
          return;
        }
      }
      _position = next;
      _accuracyM = pos.accuracy;
      onPositionChanged?.call();
    });
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  void moveMapToUser(MapController controller, {double zoom = 17}) {
    if (_position == null) return;
    try {
      controller.move(_position!, zoom);
    } catch (_) {}
  }
}

List<CircleMarker> buildUserLocationCircles(LatLng? position, double? accuracyM) {
  if (position == null) return const [];
  final out = <CircleMarker>[];
  if (accuracyM != null && accuracyM > 0 && accuracyM < 200) {
    out.add(
      CircleMarker(
        point: position,
        radius: accuracyM,
        useRadiusInMeter: true,
        color: const Color(0xFF2196F3).withAlpha(35),
        borderColor: const Color(0xFF2196F3).withAlpha(80),
        borderStrokeWidth: 1,
      ),
    );
  }
  return out;
}

/// Fixed-size on-screen dot (stays visible at any zoom).
Marker? buildUserLocationMarker(LatLng? position) {
  if (position == null) return null;
  return Marker(
    point: position,
    width: 28,
    height: 28,
    alignment: Alignment.center,
    child: Container(
      decoration: BoxDecoration(
        color: const Color(0xFF2196F3),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2196F3).withAlpha(120),
            blurRadius: 8,
            spreadRadius: 1,
          ),
        ],
      ),
    ),
  );
}

/// Circle accuracy ring + blue dot marker layers for [FlutterMap.children].
List<Widget> buildUserLocationMapLayers(LatLng? position, double? accuracyM) {
  final circles = buildUserLocationCircles(position, accuracyM);
  final marker = buildUserLocationMarker(position);
  return [
    if (circles.isNotEmpty) CircleLayer(circles: circles),
    if (marker != null) MarkerLayer(markers: [marker]),
  ];
}

Color _teamMemberColor(String requesterId) {
  final hash = requesterId.hashCode;
  const palette = [
    Color(0xFFFF9F43),
    Color(0xFF00D4AA),
    Color(0xFFA78BFA),
    Color(0xFFFF6B81),
    Color(0xFF38BDF8),
    Color(0xFFFBBF24),
    Color(0xFF4ADE80),
    Color(0xFFFB923C),
  ];
  return palette[hash.abs() % palette.length];
}

List<CircleMarker> buildTeamLiveLocationCircles(
  List<TeamLiveLocation> team, {
  bool showNames = true,
}) {
  final out = <CircleMarker>[];
  for (final m in team) {
    final point = LatLng(m.latitude, m.longitude);
    final acc = m.accuracy;
    if (acc != null && acc > 0 && acc < 200) {
      out.add(
        CircleMarker(
          point: point,
          radius: acc,
          useRadiusInMeter: true,
          color: _teamMemberColor(m.requesterId).withAlpha(28),
          borderColor: _teamMemberColor(m.requesterId).withAlpha(70),
          borderStrokeWidth: 1,
        ),
      );
    }
  }
  return out;
}

List<Marker> buildTeamLiveLocationMarkers(
  List<TeamLiveLocation> team, {
  bool showNames = true,
}) {
  return [
    for (final m in team)
      Marker(
        point: LatLng(m.latitude, m.longitude),
        width: showNames ? 120 : 32,
        height: showNames ? 52 : 32,
        alignment: Alignment.bottomCenter,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showNames)
              Container(
                constraints: const BoxConstraints(maxWidth: 116),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xEE12122A),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _teamMemberColor(m.requesterId).withAlpha(160),
                  ),
                ),
                child: Text(
                  m.displayName,
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
            if (showNames) const SizedBox(height: 4),
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: _teamMemberColor(m.requesterId),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2.5),
                boxShadow: [
                  BoxShadow(
                    color: _teamMemberColor(m.requesterId).withAlpha(100),
                    blurRadius: 6,
                  ),
                ],
              ),
              child: const Icon(Icons.person_rounded, color: Colors.white, size: 12),
            ),
          ],
        ),
      ),
  ];
}

/// Team staff overlays (accuracy rings + markers with optional name labels).
List<Widget> buildTeamLiveLocationMapLayers(
  List<TeamLiveLocation> team, {
  bool showNames = true,
}) {
  if (team.isEmpty) return const [];
  final circles = buildTeamLiveLocationCircles(team, showNames: showNames);
  final markers = buildTeamLiveLocationMarkers(team, showNames: showNames);
  return [
    if (circles.isNotEmpty) CircleLayer(circles: circles),
    if (markers.isNotEmpty) MarkerLayer(markers: markers),
  ];
}

/// Compact “center on me” control for map overlays.
class MapMyLocationButton extends StatelessWidget {
  const MapMyLocationButton({
    super.key,
    required this.onPressed,
    this.enabled = true,
  });

  final VoidCallback onPressed;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xEE12122A),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(
            Icons.my_location_rounded,
            color: enabled ? const Color(0xFF2196F3) : Colors.white38,
            size: 22,
          ),
        ),
      ),
    );
  }
}
