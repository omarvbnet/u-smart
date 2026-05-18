import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../utils/qfield_map_features.dart';
import '../utils/responsive_layout.dart';
import '../widgets/qfield_project_map_sheet.dart';

/// Full-screen immersive QField map with SQL points on-map and editable attributes.
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
  final Set<String> _hiddenLayerKeys = {};
  String? _selectedFeatureId;
  final Map<String, Map<String, dynamic>> _propertyEdits = {};
  final Map<String, TextEditingController> _fieldCtrls = {};
  bool _saving = false;

  static const _polygonFill = Color(0xFF8BC34A);
  static const _lineStroke = Color(0xFFE53935);

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
  }

  void _loadFieldEditsFromProject() {
    // fieldEdits may arrive via API later on model — hydrate from description JSON if needed
  }

  @override
  void dispose() {
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

    if (data != null && data['success'] == true) {
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
          layers.add(_LayerChip(
            key: '$pkg|$layer',
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
          sqlTables.add((name: name, package: pkg.isNotEmpty ? pkg : name, rows: rows));
          final key = '${pkg.isNotEmpty ? pkg : name}|$name';
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
      _loading = false;
    });
    _syncMapFeatures();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitMap());
  }

  void _syncMapFeatures() {
    _features = buildMapFeatures(
      geojson: _geojson,
      sqlTables: _sqlTables,
      hiddenLayerKeys: _hiddenLayerKeys,
    );
    final onMap = <String, int>{};
    for (final f in _features) {
      onMap[f.layerKey] = (onMap[f.layerKey] ?? 0) + 1;
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

  void _selectFeature(QFieldMapFeature? f) {
    for (final c in _fieldCtrls.values) {
      c.dispose();
    }
    _fieldCtrls.clear();
    _selectedFeatureId = f?.id;
    if (f != null) {
      final props = _propsFor(f);
      const skip = {'layer', 'package', 'packagePath', 'source', 'kind'};
      for (final e in props.entries) {
        if (skip.contains(e.key)) continue;
        _fieldCtrls[e.key] = TextEditingController(text: '${e.value ?? ''}');
      }
    }
    setState(() {});
    if (f?.point != null) {
      try {
        _mapController.move(f!.point!, _mapController.camera.zoom < 15 ? 16 : _mapController.camera.zoom);
      } catch (_) {}
    }
  }

  void _onMapTap(TapPosition _, LatLng point) {
    final hit = findNearestFeature(_features, point, maxMeters: 100);
    if (hit != null) {
      _selectFeature(hit);
      return;
    }
    if (widget.canWrite) {
      setState(() => _draftPin = point);
    }
  }

  Color _colorForLayer(String key) {
    for (final l in _layers) {
      if (l.key == key) return l.color;
    }
    return _layerPalette[key.hashCode.abs() % _layerPalette.length];
  }

  List<Polygon> _buildPolygons() {
    final out = <Polygon>[];
    for (final f in _features) {
      final selected = f.id == _selectedFeatureId;
      for (final ring in f.polygons) {
        if (ring.length < 3) continue;
        out.add(Polygon(
          points: ring,
          color: _polygonFill.withAlpha(selected ? 140 : 100),
          borderColor: selected ? const Color(0xFF6C63FF) : Colors.black87,
          borderStrokeWidth: selected ? 3 : 1.5,
        ));
      }
    }
    return out;
  }

  List<Polyline> _buildPolylines() {
    final out = <Polyline>[];
    for (final f in _features) {
      if (f.polyline.length < 2) continue;
      final selected = f.id == _selectedFeatureId;
      out.add(Polyline(
        points: f.polyline,
        color: selected ? const Color(0xFF6C63FF) : _lineStroke,
        strokeWidth: selected ? 6 : 5,
        borderColor: _lineStroke.withAlpha(80),
        borderStrokeWidth: selected ? 8 : 7,
      ));
    }
    return out;
  }

  List<Marker> _buildMarkers(AppLocalizations l10n) {
    final out = <Marker>[];
    for (final f in _features) {
      if (f.point == null) continue;
      final selected = f.id == _selectedFeatureId;
      final color = _colorForLayer(f.layerKey);
      out.add(Marker(
        point: f.point!,
        width: selected ? 44 : 36,
        height: selected ? 52 : 44,
        child: GestureDetector(
          onTap: () => _selectFeature(f),
          child: _MapDataMarker(
            color: color,
            label: f.label,
            selected: selected,
          ),
        ),
      ));
    }
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
    final onMapCount = _features.length;

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
                MarkerLayer(markers: _buildMarkers(l10n)),
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
                _GlassIconButton(icon: Icons.my_location_rounded, onTap: _fitMap),
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
              hiddenKeys: _hiddenLayerKeys,
              selected: _selected,
              canWrite: widget.canWrite,
              hint: _hint,
              noteCtrl: _noteCtrl,
              fieldCtrls: _fieldCtrls,
              propsFor: _selected != null ? () => _propsFor(_selected!) : null,
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
              onClearSelection: () => _selectFeature(null),
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

class _MapDataMarker extends StatelessWidget {
  const _MapDataMarker({
    required this.color,
    this.label,
    this.selected = false,
  });

  final Color color;
  final String? label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null && label!.isNotEmpty)
          Container(
            constraints: const BoxConstraints(maxWidth: 120),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: selected ? const Color(0xFF6C63FF) : const Color(0xE612122A),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: color.withAlpha(200)),
            ),
            child: Text(
              label!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 2),
        Icon(
          Icons.location_on,
          color: selected ? const Color(0xFF6C63FF) : color,
          size: selected ? 40 : 34,
          shadows: const [Shadow(color: Colors.black54, blurRadius: 4)],
        ),
      ],
    );
  }
}

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.scrollController,
    required this.l10n,
    required this.layers,
    required this.hiddenKeys,
    required this.selected,
    required this.canWrite,
    required this.hint,
    required this.noteCtrl,
    required this.fieldCtrls,
    required this.propsFor,
    required this.onToggleLayer,
    required this.onFieldChanged,
    required this.onClearSelection,
    required this.onShowAllOnMap,
  });

  final ScrollController scrollController;
  final AppLocalizations l10n;
  final List<_LayerChip> layers;
  final Set<String> hiddenKeys;
  final QFieldMapFeature? selected;
  final bool canWrite;
  final String? hint;
  final TextEditingController noteCtrl;
  final Map<String, TextEditingController> fieldCtrls;
  final Map<String, dynamic> Function()? propsFor;
  final void Function(String key) onToggleLayer;
  final void Function(String featureId, String key, String value) onFieldChanged;
  final VoidCallback onClearSelection;
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
              const SizedBox(height: 14),
              if (selected == null)
                Text(
                  l10n.t('qfield_map_tap_feature'),
                  style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
                )
              else ...[
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        selected!.label ?? l10n.t('qfield_layer_feature'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
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
                Text(
                  '${l10n.t('qfield_map_edit_fields')} · ${selected!.source}',
                  style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
                ),
                const SizedBox(height: 10),
                ...fieldCtrls.entries.map((e) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: TextField(
                      controller: e.value,
                      enabled: canWrite,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      onChanged: canWrite
                          ? (v) => onFieldChanged(selected!.id, e.key, v)
                          : null,
                      decoration: InputDecoration(
                        labelText: e.key,
                        labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                        filled: true,
                        fillColor: const Color(0xFF1A1A35),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  );
                }),
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
