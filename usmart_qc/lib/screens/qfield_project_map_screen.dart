import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../utils/qfield_map_features.dart';
import '../utils/qfield_map_tap_context.dart';
import '../utils/responsive_layout.dart';
import '../widgets/qfield_map_symbols.dart';
import '../widgets/qfield_project_map_sheet.dart';

/// Full-screen QField map: draws file geometries (lines, polygons, points) from GeoJSON preview.
class QFieldProjectMapScreen extends StatefulWidget {
  const QFieldProjectMapScreen({
    super.key,
    required this.ticketId,
    required this.project,
    this.ticket,
    required this.canWrite,
    this.onSaved,
  });

  final String ticketId;
  final QFieldProject project;
  final Ticket? ticket;
  final bool canWrite;
  final VoidCallback? onSaved;

  @override
  State<QFieldProjectMapScreen> createState() => _QFieldProjectMapScreenState();
}

class _QFieldProjectMapScreenState extends State<QFieldProjectMapScreen> {
  final MapController _mapController = MapController();
  final DraggableScrollableController _panelCtrl = DraggableScrollableController();

  static const _layerPalette = [
    Color(0xFF6C63FF),
    Color(0xFF00D4AA),
    Color(0xFFFBBF24),
    Color(0xFFFF6B81),
    Color(0xFF38BDF8),
    Color(0xFFA78BFA),
    Color(0xFFFB923C),
    Color(0xFF4ADE80),
  ];

  bool _loading = true;
  String? _hint;
  Map<String, dynamic>? _geojson;
  Map<String, double>? _boundsApi;
  LatLng? _draftPin;
  QFieldMapAnnotation? _annotation;
  final TextEditingController _noteCtrl = TextEditingController();

  List<_LayerChip> _layers = const [];
  List<({String name, String package, List<Map<String, dynamic>> rows})> _sqlTables = const [];
  List<QFieldMapFeature> _features = const [];
  int? _defaultCrsEpsg;
  Map<String, int> _layerEpsgByKey = const {};
  final Set<String> _hiddenLayerKeys = {};
  String? _selectedFeatureId;
  List<FeatureTapHit> _locationHits = const [];
  Set<String> _relatedCableIds = const {};
  LatLng? _userLocation;
  double? _userAccuracyM;
  StreamSubscription<Position>? _positionSub;
  final Map<String, Map<String, dynamic>> _propertyEdits = {};
  final Map<String, TextEditingController> _fieldCtrls = {};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _annotation = widget.project.mapAnnotation;
    if (_annotation != null) {
      _draftPin = LatLng(_annotation!.latitude, _annotation!.longitude);
      if (_annotation!.note != null && _annotation!.note!.isNotEmpty) {
        _noteCtrl.text = _annotation!.note!;
      }
    }
    _loadFieldEditsFromProject();
    _loadPreview();
    _startLiveLocation();
  }

  void _loadFieldEditsFromProject() {
    // fieldEdits may arrive via API later on model — hydrate from description JSON if needed
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _noteCtrl.dispose();
    _panelCtrl.dispose();
    for (final c in _fieldCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadPreview() async {
    setState(() => _loading = true);
    final data = await context.read<TicketsProvider>().fetchQFieldMapPreview(
          widget.ticketId,
          widget.project.id,
        );
    if (!mounted) return;

    Map<String, dynamic>? gj;
    Map<String, double>? b;
    String? hint;
    var layers = <_LayerChip>[];
    var sqlTables = <({String name, String package, List<Map<String, dynamic>> rows})>[];
    int? defaultCrs;
    final layerCrs = <String, int>{};

    if (data != null && data['success'] == true) {
      final rawDefaultCrs = data['defaultCrsEpsg'];
      if (rawDefaultCrs is num) defaultCrs = rawDefaultCrs.toInt();
      final g = data['geojson'];
      if (g is Map<String, dynamic>) gj = g;
      final rawB = data['bounds'];
      if (rawB is Map<String, dynamic>) {
        b = {
          'west': (rawB['west'] as num?)?.toDouble() ?? 0,
          'south': (rawB['south'] as num?)?.toDouble() ?? 0,
          'east': (rawB['east'] as num?)?.toDouble() ?? 0,
          'north': (rawB['north'] as num?)?.toDouble() ?? 0,
        };
      }
      final m = data['message'];
      if (m is String && m.trim().isNotEmpty) hint = m.trim();

      final rawLayers = data['layers'];
      if (rawLayers is List) {
        var i = 0;
        for (final row in rawLayers) {
          if (row is! Map<String, dynamic>) continue;
          final layer = row['layer']?.toString() ?? '';
          final pkg = row['package']?.toString() ?? '';
          if (layer.isEmpty && pkg.isEmpty) continue;
          final key = normalizeLayerKey(pkg, layer);
          final crs = row['crsEpsg'];
          if (crs is num) layerCrs[key] = crs.toInt();
          layers.add(_LayerChip(
            key: key,
            label: pkg.isNotEmpty ? '$pkg › $layer' : layer,
            color: _layerPalette[i % _layerPalette.length],
            count: (row['featureCount'] as num?)?.toInt() ?? 0,
          ));
          i++;
        }
      }

      final rawTables = data['dataTables'];
      if (rawTables is List) {
        for (final row in rawTables) {
          if (row is! Map<String, dynamic>) continue;
          final name = row['name']?.toString() ?? '';
          final pkg = row['package']?.toString() ?? '';
          if (name.isEmpty) continue;
          final rows = <Map<String, dynamic>>[];
          final rawRows = row['rows'];
          if (rawRows is List) {
            for (final r in rawRows) {
              if (r is Map) rows.add(Map<String, dynamic>.from(r));
            }
          }
          final pkgNorm = pkg.isNotEmpty ? pkg : name;
          sqlTables.add((name: name, package: pkgNorm, rows: rows));
          final key = normalizeLayerKey(pkgNorm, name);
          if (!layers.any((l) => l.key == key)) {
            layers.add(_LayerChip(
              key: key,
              label: pkg.isNotEmpty ? '$pkg › $name' : name,
              color: _layerPalette[layers.length % _layerPalette.length],
              count: (row['rowCount'] as num?)?.toInt() ?? rows.length,
            ));
          }
        }
      }
    }

    setState(() {
      _geojson = gj;
      _boundsApi = b;
      _hint = hint;
      _layers = layers;
      _sqlTables = sqlTables;
      _defaultCrsEpsg = defaultCrs;
      _layerEpsgByKey = layerCrs;
      _loading = false;
    });
    _syncMapFeatures();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitMap());
  }

  int _drawableOnMapCount() => countDrawables(_features);

  void _syncMapFeatures() {
    _features = buildMapFeatures(
      geojson: _geojson,
      hiddenLayerKeys: _hiddenLayerKeys,
      defaultCrsEpsg: _defaultCrsEpsg,
      layerEpsgByKey: _layerEpsgByKey,
    );
    final onMap = <String, int>{};
    for (final f in _features) {
      var n = 0;
      n += f.points.length;
      n += f.polylines.where((l) => l.length >= 2).length;
      n += f.polygons.where((p) => p.length >= 3).length;
      onMap[f.layerKey] = (onMap[f.layerKey] ?? 0) + n;
    }
    _layers = _layers
        .map(
          (l) => _LayerChip(
            key: l.key,
            label: l.label,
            color: l.color,
            count: onMap[l.key] ?? l.count,
          ),
        )
        .toList();
    if (mounted) setState(() {});
  }

  void _fitMap() {
    final pts = <LatLng>[];
    for (final f in _features) {
      pts.addAll(f.allVertices);
    }
    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;
    if (siteLat != null && siteLng != null) pts.add(LatLng(siteLat, siteLng));
    if (_draftPin != null) pts.add(_draftPin!);
    if (_boundsApi != null) {
      final b = _boundsApi!;
      pts.add(LatLng(b['south']!, b['west']!));
      pts.add(LatLng(b['north']!, b['east']!));
    }
    if (pts.isEmpty) return;
    double minLat = pts.first.latitude, maxLat = pts.first.latitude;
    double minLng = pts.first.longitude, maxLng = pts.first.longitude;
    for (final p in pts) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    final center = LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    final span = ((maxLat - minLat).abs() > (maxLng - minLng).abs())
        ? (maxLat - minLat).abs()
        : (maxLng - minLng).abs();
    var zoom = 13.0;
    if (span < 0.0005) {
      zoom = 18;
    } else if (span < 0.01) {
      zoom = 16;
    } else if (span < 0.08) {
      zoom = 14;
    } else if (span < 0.5) {
      zoom = 12;
    } else {
      zoom = 10;
    }
    try {
      _mapController.move(center, zoom);
    } catch (_) {}
  }

  QFieldMapFeature? get _selected {
    if (_selectedFeatureId == null) return null;
    for (final f in _features) {
      if (f.id == _selectedFeatureId) return f;
    }
    return null;
  }

  Map<String, dynamic> _propsFor(QFieldMapFeature f) {
    final base = Map<String, dynamic>.from(f.properties);
    final edits = _propertyEdits[f.id];
    if (edits != null) base.addAll(edits);
    return base;
  }

  /// All fields for the info panel (metadata + attributes + geometry type).
  Map<String, dynamic> _allDisplayProps(QFieldMapFeature f) {
    final m = Map<String, dynamic>.from(_propsFor(f));
    if (f.geometryType != null && f.geometryType!.isNotEmpty) {
      m['geometryType'] = f.geometryType;
    }
    if (f.label != null && f.label!.isNotEmpty) {
      m['displayLabel'] = f.label;
    }
    final sorted = Map.fromEntries(
      m.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    return sorted;
  }

  Future<void> _startLiveLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return;
    }
    _positionSub?.cancel();
    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 4,
      ),
    ).listen((pos) {
      if (!mounted) return;
      setState(() {
        _userLocation = LatLng(pos.latitude, pos.longitude);
        _userAccuracyM = pos.accuracy;
      });
    });
  }

  void _centerOnUser() {
    if (_userLocation != null) {
      try {
        _mapController.move(_userLocation!, 17);
      } catch (_) {}
    } else {
      _fitMap();
    }
  }

  List<LayerHitGroup> get _layerGroups => groupHitsByLayer(_locationHits);

  QFieldTapContext? get _tapContext {
    final sel = _selected;
    if (sel == null) return null;
    return buildTapContext(
      selected: sel,
      locationHits: _locationHits,
      allFeatures: _features,
      anchor: featureAnchorPoint(sel),
    );
  }

  bool _isFeatureHighlighted(QFieldMapFeature f) {
    if (_selectedFeatureId != null) {
      if (f.id == _selectedFeatureId) return true;
      if (_relatedCableIds.contains(f.id)) return true;
    }
    if (_locationHits.isNotEmpty) {
      return _locationHits.any((h) => h.feature.id == f.id);
    }
    return false;
  }

  bool _dimFeatureOnMap(QFieldMapFeature f) {
    if (_selectedFeatureId == null) return false;
    if (f.id == _selectedFeatureId) return false;
    if (_relatedCableIds.contains(f.id)) return false;
    if (!isCableFeature(f) && !isCableLayer(_layerNameFor(f))) return false;
    return true;
  }

  void _selectFeature(QFieldMapFeature? f, {bool expandPanel = false}) {
    for (final c in _fieldCtrls.values) {
      c.dispose();
    }
    _fieldCtrls.clear();
    if (f != null) {
      final props = _propsFor(f);
      const skip = {'layer', 'package', 'packagePath', 'source', 'kind'};
      for (final e in props.entries) {
        if (skip.contains(e.key)) continue;
        if (e.value == null) continue;
        final s = e.value.toString();
        if (s == '[binary]') continue;
        _fieldCtrls[e.key] = TextEditingController(text: s);
      }
    }
    var hits = _locationHits;
    if (f != null) {
      final anchor = featureAnchorPoint(f);
      if (anchor != null) {
        hits = featuresNearPoint(_features, anchor, maxMeters: 12);
      }
    }
    final related = f == null
        ? const <String>{}
        : relatedCableIdsForContext(
            buildTapContext(
              selected: f,
              locationHits: hits,
              allFeatures: _features,
              anchor: featureAnchorPoint(f),
            ),
          );
    setState(() {
      _selectedFeatureId = f?.id;
      _locationHits = hits;
      _relatedCableIds = related;
    });
    if (expandPanel) {
      try {
        _panelCtrl.animateTo(
          0.45,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOut,
        );
      } catch (_) {}
    }
    if (f != null) {
      final verts = f.allVertices.toList();
      if (verts.isNotEmpty) {
        try {
          _mapController.move(
            verts.first,
            _mapController.camera.zoom < 15 ? 16 : _mapController.camera.zoom,
          );
        } catch (_) {}
      }
    }
  }

  void _clearTapSelection() {
    setState(() {
      _locationHits = const [];
      _relatedCableIds = const {};
    });
    _selectFeature(null);
  }

  void _onMapTap(TapPosition _, LatLng point) {
    final hits = findFeaturesNearTap(_features, point, maxMeters: 80);
    if (hits.isNotEmpty) {
      setState(() => _locationHits = hits);
      if (hits.length == 1) {
        _selectFeature(hits.first.feature, expandPanel: true);
      } else {
        _selectFeature(null, expandPanel: true);
      }
      return;
    }
    _clearTapSelection();
    if (widget.canWrite) {
      setState(() => _draftPin = point);
    }
  }

  String _layerNameFor(QFieldMapFeature f) =>
      f.properties['layer']?.toString() ??
      QFieldMapSymbols.layerNameFromKey(f.layerKey);

  List<Polygon> _buildPolygons() {
    final out = <Polygon>[];
    for (final f in _features) {
      final selected = _isFeatureHighlighted(f);
      final sym = QFieldMapSymbols.polygonStyle(_layerNameFor(f));
      for (final ring in f.polygons) {
        if (ring.length < 3) continue;
        out.add(Polygon(
          points: ring,
          color: selected ? sym.fill.withAlpha(140) : sym.fill,
          borderColor: selected ? const Color(0xFF6C63FF) : sym.border,
          borderStrokeWidth: selected ? 3 : sym.borderWidth,
        ));
      }
    }
    return out;
  }

  List<Polyline> _buildPolylines() {
    final out = <Polyline>[];
    for (final f in _features) {
      final hi = _isFeatureHighlighted(f);
      final dim = _dimFeatureOnMap(f);
      final layerName = _layerNameFor(f);
      final sym = QFieldMapSymbols.lineStyle(layerName);
      var color = sym.color;
      if (hi && _selectedFeatureId == f.id) {
        color = const Color(0xFF6C63FF);
      } else if (hi && (isCableFeature(f) || isCableLayer(layerName))) {
        color = cableDisplayColor(f);
      } else if (isCableFeature(f) || isCableLayer(layerName)) {
        color = cableDisplayColor(f);
      }
      if (dim) color = color.withAlpha(45);
      for (final line in f.polylines) {
        if (line.length < 2) continue;
        out.add(Polyline(
          points: line,
          color: color,
          strokeWidth: hi ? sym.strokeWidth + 1 : sym.strokeWidth,
          borderColor: dim
              ? color.withAlpha(30)
              : (sym.borderColor ?? color.withAlpha(80)),
          borderStrokeWidth: hi ? sym.borderStrokeWidth + 1 : sym.borderStrokeWidth,
        ));
      }
    }
    return out;
  }

  List<CircleMarker> _buildUserLocationCircles() {
    if (_userLocation == null) return const [];
    final acc = _userAccuracyM;
    final out = <CircleMarker>[];
    if (acc != null && acc > 0 && acc < 200) {
      out.add(CircleMarker(
        point: _userLocation!,
        radius: acc,
        color: const Color(0xFF2196F3).withAlpha(35),
        borderColor: const Color(0xFF2196F3).withAlpha(80),
        borderStrokeWidth: 1,
      ));
    }
    out.add(CircleMarker(
      point: _userLocation!,
      radius: 8,
      color: const Color(0xFF2196F3),
      borderColor: Colors.white,
      borderStrokeWidth: 2.5,
    ));
    return out;
  }

  List<Marker> _buildFeaturePointMarkers() {
    final out = <Marker>[];
    for (final f in _features) {
      final selected = _isFeatureHighlighted(f);
      final layerName = _layerNameFor(f);
      final ptStyle = QFieldMapSymbols.pointStyle(layerName);
      for (final pt in f.points) {
        out.add(Marker(
          point: pt,
          width: ptStyle.width + (selected ? 4 : 0),
          height: ptStyle.height + (selected ? 4 : 0),
          child: QFieldMapPointIcon(
            layerName: layerName,
            selected: selected,
          ),
        ));
      }
    }
    return out;
  }

  List<Marker> _buildPointLabelMarkers() {
    final out = <Marker>[];
    for (final f in _features) {
      if (f.points.isEmpty) continue;
      final layerName = _layerNameFor(f);
      if (!shouldShowMapLabel(layerName)) continue;
      final text = mapLabelForFeature(f.properties, layerName) ?? f.label;
      if (text == null || text.isEmpty) continue;
      final hi = _isFeatureHighlighted(f);
      final compact = useCompactMapLabel(layerName);
      for (final pt in f.points) {
        out.add(
          Marker(
            point: pt,
            width: compact ? 50 : 92,
            height: compact ? 22 : 40,
            alignment: Alignment.bottomCenter,
            child: Transform.translate(
              offset: Offset(0, compact ? -22 : -30),
              child: QFieldMapPointLabel(
                text: text,
                highlighted: hi,
                compact: compact,
              ),
            ),
          ),
        );
      }
    }
    return out;
  }

  List<Marker> _buildOverlayMarkers(AppLocalizations l10n) {
    final out = <Marker>[];
    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;
    if (siteLat != null && siteLng != null) {
      out.add(Marker(
        point: LatLng(siteLat, siteLng),
        width: 40,
        height: 40,
        child: const Icon(Icons.place_rounded, color: Color(0xFFFBBF24), size: 36),
      ));
    }
    if (_draftPin != null) {
      out.add(Marker(
        point: _draftPin!,
        width: 48,
        height: 48,
        child: const Icon(Icons.location_on, color: Color(0xFFFF4757), size: 46),
      ));
    }
    return out;
  }

  Future<void> _saveAll() async {
    if (!widget.canWrite) return;
    setState(() => _saving = true);
    final prov = context.read<TicketsProvider>();
    final l10n = AppLocalizations.of(context);

    final editsPayload = <String, Map<String, dynamic>>{};
    for (final e in _propertyEdits.entries) {
      editsPayload[e.key] = Map<String, dynamic>.from(e.value);
    }

    var ok = true;
    if (editsPayload.isNotEmpty) {
      final meta = await prov.postTicketQFieldAction(widget.ticketId, {
        'action': 'update_meta',
        'projectId': widget.project.id,
        'fieldEdits': editsPayload,
      });
      ok = meta.ok;
    }

    if (_draftPin != null) {
      final pin = await prov.postTicketQFieldAction(widget.ticketId, {
        'action': 'set_map_annotation',
        'projectId': widget.project.id,
        'latitude': _draftPin!.latitude,
        'longitude': _draftPin!.longitude,
        if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
      });
      ok = ok && pin.ok;
    }

    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('qfield_map_saved'))),
      );
      widget.onSaved?.call();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('ticket_failed'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final top = MediaQuery.paddingOf(context).top;
    final onMapCount = _drawableOnMapCount();

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_loading)
            const Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
          else
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _draftPin ??
                    LatLng(
                      widget.ticket?.siteLatitude ?? 33.3152,
                      widget.ticket?.siteLongitude ?? 44.3661,
                    ),
                initialZoom: 13,
                onTap: _onMapTap,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
              ),
              children: [
                TileLayer(
                  urlTemplate: QFieldProjectMapSheet.tileUrlTemplate,
                  subdomains: QFieldProjectMapSheet.tileSubdomains,
                  userAgentPackageName: 'usmart_qc',
                  maxNativeZoom: 19,
                ),
                if (_buildPolygons().isNotEmpty) PolygonLayer(polygons: _buildPolygons()),
                if (_buildPolylines().isNotEmpty) PolylineLayer(polylines: _buildPolylines()),
                if (_buildUserLocationCircles().isNotEmpty)
                  CircleLayer(circles: _buildUserLocationCircles()),
                MarkerLayer(
                  markers: [
                    ..._buildFeaturePointMarkers(),
                    ..._buildPointLabelMarkers(),
                    ..._buildOverlayMarkers(l10n),
                  ],
                ),
                SimpleAttributionWidget(
                  alignment: Alignment.bottomLeft,
                  backgroundColor: const Color(0x8805051A),
                  source: Text(
                    l10n.t('site_map_attribution'),
                    style: const TextStyle(color: Colors.white70, fontSize: 9),
                  ),
                ),
              ],
            ),

          // Top gradient + toolbar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xEE05051A),
                    const Color(0xAA05051A),
                    Colors.transparent,
                  ],
                ),
              ),
              padding: EdgeInsets.fromLTRB(8, top + 4, 8, 16),
              child: Row(
                children: [
                  _GlassIconButton(
                    icon: Icons.arrow_back_rounded,
                    onTap: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.project.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          l10n.t('qfield_map_on_map_count', {'count': '$onMapCount'}),
                          style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  _GlassIconButton(
                    icon: Icons.layers_rounded,
                    onTap: () {
                      _panelCtrl.animateTo(
                        0.45,
                        duration: const Duration(milliseconds: 280),
                        curve: Curves.easeOut,
                      );
                    },
                  ),
                  if (widget.canWrite) ...[
                    const SizedBox(width: 6),
                    _GlassIconButton(
                      icon: Icons.save_rounded,
                      onTap: _saving ? null : _saveAll,
                      accent: true,
                      loading: _saving,
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Zoom controls
          Positioned(
            right: 12,
            top: top + 72,
            child: Column(
              children: [
                _GlassIconButton(icon: Icons.add, onTap: () => _zoom(1)),
                const SizedBox(height: 8),
                _GlassIconButton(icon: Icons.remove, onTap: () => _zoom(-1)),
                const SizedBox(height: 8),
                _GlassIconButton(icon: Icons.my_location_rounded, onTap: _centerOnUser),
              ],
            ),
          ),

          // Bottom panel — layers + SQL editor
          DraggableScrollableSheet(
            controller: _panelCtrl,
            initialChildSize: 0.22,
            minChildSize: 0.14,
            maxChildSize: 0.72,
            snap: true,
            snapSizes: const [0.14, 0.22, 0.45, 0.72],
            builder: (ctx, scroll) => _BottomPanel(
              scrollController: scroll,
              l10n: l10n,
              layers: _layers,
              sqlTableCount: _sqlTables.length,
              hiddenKeys: _hiddenLayerKeys,
              selected: _selected,
              layerGroups: _layerGroups,
              tapContext: _tapContext,
              allDisplayProps: _selected != null ? _allDisplayProps(_selected!) : null,
              userLocationLabel: _userLocation != null
                  ? l10n.t('qfield_map_my_location')
                  : null,
              canWrite: widget.canWrite,
              hint: _hint,
              noteCtrl: _noteCtrl,
              fieldCtrls: _fieldCtrls,
              onToggleLayer: (key) {
                setState(() {
                  if (_hiddenLayerKeys.contains(key)) {
                    _hiddenLayerKeys.remove(key);
                  } else {
                    _hiddenLayerKeys.add(key);
                  }
                });
                _syncMapFeatures();
              },
              onFieldChanged: (featureId, key, value) {
                _propertyEdits.putIfAbsent(featureId, () => {})[key] = value;
              },
              onClearSelection: _clearTapSelection,
              onPickTapFeature: (f) => _selectFeature(f, expandPanel: true),
              onShowAllOnMap: _fitMap,
            ),
          ),
        ],
      ),
    );
  }

  void _zoom(double delta) {
    final cam = _mapController.camera;
    _mapController.move(cam.center, (cam.zoom + delta).clamp(3, 19));
  }
}

class _LayerChip {
  _LayerChip({
    required this.key,
    required this.label,
    required this.color,
    required this.count,
  });
  final String key;
  final String label;
  final Color color;
  final int count;
}

class _GlassIconButton extends StatelessWidget {
  const _GlassIconButton({
    required this.icon,
    required this.onTap,
    this.accent = false,
    this.loading = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool accent;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: accent ? const Color(0xCC6C63FF) : const Color(0xCC12122A),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          width: RLayout.minTouchTarget,
          height: RLayout.minTouchTarget,
          child: loading
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.scrollController,
    required this.l10n,
    required this.layers,
    required this.sqlTableCount,
    required this.hiddenKeys,
    required this.selected,
    required this.layerGroups,
    this.tapContext,
    required this.allDisplayProps,
    this.userLocationLabel,
    required this.canWrite,
    required this.hint,
    required this.noteCtrl,
    required this.fieldCtrls,
    required this.onToggleLayer,
    required this.onFieldChanged,
    required this.onClearSelection,
    required this.onPickTapFeature,
    required this.onShowAllOnMap,
  });

  final ScrollController scrollController;
  final AppLocalizations l10n;
  final List<_LayerChip> layers;
  final int sqlTableCount;
  final Set<String> hiddenKeys;
  final QFieldMapFeature? selected;
  final List<LayerHitGroup> layerGroups;
  final QFieldTapContext? tapContext;
  final Map<String, dynamic>? allDisplayProps;
  final String? userLocationLabel;
  final bool canWrite;
  final String? hint;
  final TextEditingController noteCtrl;
  final Map<String, TextEditingController> fieldCtrls;
  final void Function(String key) onToggleLayer;
  final void Function(String featureId, String key, String value) onFieldChanged;
  final VoidCallback onClearSelection;
  final void Function(QFieldMapFeature feature) onPickTapFeature;
  final VoidCallback onShowAllOnMap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xF012122A),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            border: Border.all(color: Colors.white.withAlpha(30)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                    l10n.t('qfield_map_layers'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: onShowAllOnMap,
                    icon: const Icon(Icons.map_rounded, size: 18, color: Color(0xFF00D4AA)),
                    label: Text(
                      l10n.t('qfield_map_fit_all'),
                      style: const TextStyle(color: Color(0xFF00D4AA), fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: layers.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final l = layers[i];
                    final hidden = hiddenKeys.contains(l.key);
                    return FilterChip(
                      label: Text('${l.label} (${l.count})', style: const TextStyle(fontSize: 11)),
                      selected: !hidden,
                      onSelected: (_) => onToggleLayer(l.key),
                      selectedColor: l.color.withAlpha(80),
                      backgroundColor: Colors.white.withAlpha(20),
                      checkmarkColor: l.color,
                      side: BorderSide(color: l.color.withAlpha(160)),
                    );
                  },
                ),
              ),
              if (hint != null && hint!.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(hint!, style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11)),
              ],
              if (userLocationLabel != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.my_location, color: Color(0xFF2196F3), size: 18),
                    const SizedBox(width: 8),
                    Text(
                      userLocationLabel!,
                      style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              if (layerGroups.isEmpty)
                Text(
                  sqlTableCount > 0
                      ? '${l10n.t('qfield_map_tap_feature')} · $sqlTableCount SQL ${l10n.t('qfield_map_layers').toLowerCase()}'
                      : l10n.t('qfield_map_tap_feature'),
                  style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
                )
              else ...[
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.t('qfield_map_layers_at_location'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: onClearSelection,
                      icon: const Icon(Icons.close_rounded, color: Colors.white54),
                    ),
                  ],
                ),
                if (selected == null) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      l10n.t('qfield_map_tap_pick_element'),
                      style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 12),
                    ),
                  ),
                  for (final group in layerGroups) ...[
                    _LayerGroupHeader(group: group),
                    for (final h in group.hits)
                      _TapElementTile(
                        hit: h,
                        selected: selected,
                        onPick: onPickTapFeature,
                      ),
                  ],
                ] else if (tapContext != null) ...[
                  _SelectedElementHeader(
                    title: featureTapListTitle(tapContext!.selected),
                    subtitle: tapContext!.fatId != null
                        ? '${l10n.t('qfield_map_fat_label')} ${tapContext!.fatId}'
                        : featureTapListSubtitle(tapContext!.selected),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    l10n.t('qfield_map_feature_data'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 6),
                  ...tapContext!.primaryProps.entries.map(
                    (e) => _FeatureDataRow(label: e.key, value: '${e.value ?? ''}'),
                  ),
                  if (tapContext!.primaryProps.isEmpty)
                    Text(
                      l10n.t('qfield_layer_no_attributes'),
                      style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
                    ),
                  if (tapContext!.fatSummary.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      l10n.t('qfield_map_fat_site_info'),
                      style: const TextStyle(
                        color: Color(0xFF00D4AA),
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    ...tapContext!.fatSummary.entries.map(
                      (e) => _FeatureDataRow(label: e.key, value: e.value),
                    ),
                  ],
                  if (tapContext!.handholes.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      l10n.t('qfield_map_handholes_for_fat'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    for (final bundle in tapContext!.handholes) ...[
                      const SizedBox(height: 8),
                      _TapElementTile(
                        hit: bundle.handhole,
                        selected: selected,
                        onPick: onPickTapFeature,
                      ),
                      ...displayPropsForFeature(bundle.handhole.feature).entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(left: 12, bottom: 2),
                              child: _FeatureDataRow(
                                label: e.key,
                                value: '${e.value ?? ''}',
                              ),
                            ),
                          ),
                      for (final entry in bundle.cablesByType.entries) ...[
                        Padding(
                          padding: const EdgeInsets.only(left: 8, top: 6, bottom: 2),
                          child: Row(
                            children: [
                              Container(
                                width: 24,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: cableTypeColorForLabel(entry.key),
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                entry.key,
                                style: TextStyle(
                                  color: Colors.white.withAlpha(210),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                '(${entry.value.length})',
                                style: TextStyle(
                                  color: Colors.white.withAlpha(120),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        for (final h in entry.value)
                          Padding(
                            padding: const EdgeInsets.only(left: 12),
                            child: _TapElementTile(
                              hit: h,
                              selected: selected,
                              onPick: onPickTapFeature,
                              isCable: true,
                            ),
                          ),
                      ],
                    ],
                  ],
                  if (tapContext!.excavations.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      l10n.t('qfield_map_excavation_for_fat'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    for (final h in tapContext!.excavations) ...[
                      const SizedBox(height: 6),
                      _TapElementTile(
                        hit: h,
                        selected: selected,
                        onPick: onPickTapFeature,
                      ),
                      ...displayPropsForFeature(h.feature).entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(left: 12, bottom: 2),
                              child: _FeatureDataRow(
                                label: e.key,
                                value: '${e.value ?? ''}',
                              ),
                            ),
                          ),
                    ],
                  ],
                  if (tapContext!.fatCablesByType.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      l10n.t('qfield_map_cables_at_location'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    for (final entry in tapContext!.fatCablesByType.entries) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: 6, bottom: 2),
                        child: Row(
                          children: [
                            Container(
                              width: 24,
                              height: 4,
                              decoration: BoxDecoration(
                                color: cableTypeColorForLabel(entry.key),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              entry.key,
                              style: TextStyle(
                                color: Colors.white.withAlpha(210),
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      for (final h in entry.value)
                        _TapElementTile(
                          hit: h,
                          selected: selected,
                          onPick: onPickTapFeature,
                          isCable: true,
                        ),
                    ],
                  ],
                  if (tapContext!.otherLayerGroups.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      l10n.t('qfield_map_other_layers_at_location'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    for (final group in tapContext!.otherLayerGroups) ...[
                      _LayerGroupHeader(group: group),
                      for (final h in group.hits)
                        _TapElementTile(
                          hit: h,
                          selected: selected,
                          onPick: onPickTapFeature,
                        ),
                    ],
                  ],
                  if (canWrite && fieldCtrls.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      l10n.t('qfield_map_edit_fields'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...fieldCtrls.entries.map((e) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: TextField(
                          controller: e.value,
                          style: const TextStyle(color: Colors.white, fontSize: 14),
                          onChanged: (v) => onFieldChanged(selected!.id, e.key, v),
                          decoration: InputDecoration(
                            labelText: e.key,
                            labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                            filled: true,
                            fillColor: const Color(0xFF1A1A35),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ],
              ],
              if (canWrite) ...[
                const SizedBox(height: 16),
                Text(
                  l10n.t('qfield_map_tap_place_pin'),
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: noteCtrl,
                  style: const TextStyle(color: Colors.white),
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: l10n.t('qfield_map_note_hint'),
                    hintStyle: TextStyle(color: Colors.white.withAlpha(90)),
                    filled: true,
                    fillColor: const Color(0xFF05051A),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectedElementHeader extends StatelessWidget {
  const _SelectedElementHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF6C63FF).withAlpha(70),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF6C63FF).withAlpha(140)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _LayerGroupHeader extends StatelessWidget {
  const _LayerGroupHeader({required this.group});

  final LayerHitGroup group;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 4),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: isCableLayer(group.layerName)
                  ? cableTypeColor(group.layerName)
                  : const Color(0xFF00D4AA),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            group.layerName,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '(${group.hits.length})',
            style: TextStyle(color: Colors.white.withAlpha(130), fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _TapElementTile extends StatelessWidget {
  const _TapElementTile({
    required this.hit,
    required this.selected,
    required this.onPick,
    this.isCable = false,
  });

  final FeatureTapHit hit;
  final QFieldMapFeature? selected;
  final void Function(QFieldMapFeature f) onPick;
  final bool isCable;

  @override
  Widget build(BuildContext context) {
    final f = hit.feature;
    final isSel = selected?.id == f.id;
    final layerName = f.properties['layer']?.toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: isSel ? const Color(0xFF6C63FF).withAlpha(90) : const Color(0xFF1A1A35),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => onPick(f),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                if (isCable)
                  Container(
                    width: 28,
                    height: 4,
                    decoration: BoxDecoration(
                      color: cableDisplayColor(f),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  )
                else
                  QFieldMapPointIcon(
                    layerName: layerName,
                    selected: isSel,
                    small: true,
                  ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        featureTapListTitle(f),
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: isSel ? FontWeight.w700 : FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        featureTapListSubtitle(f),
                        style: TextStyle(
                          color: Colors.white.withAlpha(140),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSel)
                  const Icon(Icons.check_circle_rounded,
                      color: Color(0xFF00D4AA), size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureDataRow extends StatelessWidget {
  const _FeatureDataRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A35),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withAlpha(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withAlpha(150),
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          SelectableText(
            value.isEmpty ? '—' : value,
            style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.3),
          ),
        ],
      ),
    );
  }
}
