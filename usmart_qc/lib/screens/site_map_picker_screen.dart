import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../l10n/app_localizations.dart';

/// Full-screen map to pick site coordinates.
/// Returns [LatLng] on confirm, or null on cancel.
class SiteMapPickerScreen extends StatefulWidget {
  final double? initialLat;
  final double? initialLng;

  const SiteMapPickerScreen({
    super.key,
    this.initialLat,
    this.initialLng,
  });

  @override
  State<SiteMapPickerScreen> createState() => _SiteMapPickerScreenState();
}

class _SiteMapPickerScreenState extends State<SiteMapPickerScreen> {
  static const _defaultCenter = LatLng(33.3152, 44.3661); // Baghdad

  /// CARTO raster tiles (OSM data, CDN intended for app embedding). Do not use
  /// `tile.openstreetmap.org` — volunteer OSM servers return 403 for many apps
  /// that do not meet https://operations.osmfoundation.org/policies/tiles/
  static const _tileSubdomains = ['a', 'b', 'c', 'd'];
  static const _tileUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

  late final MapController _mapController;
  LatLng? _selected;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    if (widget.initialLat != null && widget.initialLng != null) {
      _selected = LatLng(widget.initialLat!, widget.initialLng!);
    }
  }

  Future<void> _useMyLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) return;
    }
    if (perm == LocationPermission.deniedForever) return;

    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      setState(() {
        _selected = LatLng(pos.latitude, pos.longitude);
        _mapController.move(_selected!, 16);
      });
    } catch (_) {}
  }

  void _confirm() {
    if (_selected != null) {
      Navigator.of(context).pop(_selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final center = _selected ?? (widget.initialLat != null && widget.initialLng != null
        ? LatLng(widget.initialLat!, widget.initialLng!)
        : _defaultCenter);

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF05051A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          l10n.t('site_map_pick'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: center,
                initialZoom: _selected != null ? 16 : 10,
                onTap: (_, point) => setState(() => _selected = point),
              ),
              children: [
                TileLayer(
                  urlTemplate: _tileUrlTemplate,
                  subdomains: _tileSubdomains,
                  userAgentPackageName: 'usmart_qc',
                  maxNativeZoom: 19,
                ),
                if (_selected != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: _selected!,
                        width: 40,
                        height: 40,
                        child: const Icon(
                          Icons.location_on,
                          color: Color(0xFF6C63FF),
                          size: 40,
                        ),
                      ),
                    ],
                  ),
                SimpleAttributionWidget(
                  alignment: Alignment.bottomRight,
                  backgroundColor: const Color(0xAA05051A),
                  source: Text(
                    l10n.t('site_map_attribution'),
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF12122A),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l10n.t('site_map_tap_to_select'),
                  style: TextStyle(
                    color: Colors.white.withAlpha(180),
                    fontSize: 13,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (_selected != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '${_selected!.latitude.toStringAsFixed(6)}, ${_selected!.longitude.toStringAsFixed(6)}',
                      style: const TextStyle(
                        color: Color(0xFF6C63FF),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _useMyLocation,
                        icon: const Icon(Icons.my_location, size: 20),
                        label: Text(l10n.t('site_map_use_location')),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: BorderSide(color: Colors.white.withAlpha(100)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: _selected != null ? _confirm : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6C63FF),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: Text(l10n.t('site_map_confirm')),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
