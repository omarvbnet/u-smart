import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_map_note.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../providers/workspace_sites_provider.dart';
import '../utils/qfield_map_features.dart';
import '../utils/qfield_map_point_labels.dart';
import '../utils/qfield_map_tap_context.dart';
import '../utils/responsive_layout.dart';
import '../widgets/qfield_map_bottom_panel.dart';
import '../widgets/qfield_map_note_bubble.dart';
import '../widgets/qfield_map_symbols.dart';
import '../widgets/qfield_project_map_sheet.dart';

/// Full-screen QField map: draws file geometries (lines, polygons, points) from GeoJSON preview.
class QFieldProjectMapScreen extends StatefulWidget {
  const QFieldProjectMapScreen({
    super.key,
    this.ticketId,
    this.workspaceSiteId,
    required this.project,
    this.ticket,
    required this.canWrite,
    this.onSaved,
  }) : assert(ticketId != null || workspaceSiteId != null);

  final String? ticketId;
  final String? workspaceSiteId;
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

  List<QFieldMapNote> _mapNotes = const [];
  bool _addCommentMode = false;
  bool _postingComment = false;

  List<QFieldLayerChip> _layers = const [];
  List<QFieldSqlTableData> _sqlTables = const [];
  Map<String, dynamic>? _previewStats;
  List<QFieldMapFeature> _features = const [];
  int? _defaultCrsEpsg;
  Map<String, int> _layerEpsgByKey = const {};
  final Set<String> _hiddenLayerKeys = {};
  final Set<String> _hiddenCableTypeKeys = {};
  final Set<String> _hiddenCableIdKeys = {};
  List<CableMapToggle> _cableToggles = const [];
  String? _selectedFeatureId;
  List<FeatureTapHit> _locationHits = const [];
  Set<String> _relatedCableIds = const {};
  LatLng? _userLocation;
  double? _userAccuracyM;
  StreamSubscription<Position>? _positionSub;
  final Map<String, Map<String, dynamic>> _propertyEdits = {};
  final Map<String, TextEditingController> _fieldCtrls = {};
  bool _saving = false;

  List<Marker> _cachedFeatureMarkers = const [];
  List<Marker> _cachedLabelMarkers = const [];
  List<Polyline> _cachedPolylines = const [];
  List<Polygon> _cachedPolygons = const [];
  int _mapGeomVersion = 0;
  int _builtGeomVersion = -1;

  @override
  void initState() {
    super.initState();
    _mapNotes = List<QFieldMapNote>.from(widget.project.mapNotes);
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
    final Map<String, dynamic>? data;
    if (widget.workspaceSiteId != null) {
      data = await context.read<WorkspaceSitesProvider>().fetchQFieldMapPreview(
            widget.workspaceSiteId!,
            widget.project.id,
          );
    } else {
      data = await context.read<TicketsProvider>().fetchQFieldMapPreview(
            widget.ticketId!,
            widget.project.id,
          );
    }
    if (!mounted) return;

    Map<String, dynamic>? gj;
    Map<String, double>? b;
    String? hint;
    var layers = <QFieldLayerChip>[];
    var sqlTables = <QFieldSqlTableData>[];
    var mapNotes = List<QFieldMapNote>.from(_mapNotes);
    Map<String, dynamic>? previewStats;
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
      final rawStats = data['stats'];
      if (rawStats is Map) previewStats = Map<String, dynamic>.from(rawStats);

      final previewNotes = parseQFieldMapNotes(data['mapNotes']);
      if (previewNotes.isNotEmpty) {
        mapNotes = previewNotes;
      }

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
          layers.add(QFieldLayerChip(
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
          final columns = <String>[];
          final rawCols = row['columns'];
          if (rawCols is List) {
            for (final c in rawCols) {
              if (c != null && '$c'.trim().isNotEmpty) columns.add('$c'.trim());
            }
          }
          final pkgNorm = pkg.isNotEmpty ? pkg : name;
          final layerKey = normalizeLayerKey(pkgNorm, name);
          sqlTables.add(QFieldSqlTableData(
            name: name,
            package: pkgNorm,
            layerKey: layerKey,
            columns: columns,
            rows: rows,
            rowCount: (row['rowCount'] as num?)?.toInt() ?? rows.length,
            hasGeometry: row['hasGeometry'] == true,
          ));
          final key = normalizeLayerKey(pkgNorm, name);
          if (!layers.any((l) => l.key == key)) {
            layers.add(QFieldLayerChip(
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
      _previewStats = previewStats;
      _mapNotes = mapNotes;
      _defaultCrsEpsg = defaultCrs;
      _layerEpsgByKey = layerCrs;
      _loading = false;
    });
    _syncMapFeatures();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitMap());
  }

  int _drawableOnMapCount() => countDrawables(_features);

  void _showSqlTableDetails(QFieldSqlTableData table) {
    final l10n = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.55,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (_, scroll) {
            final shown = table.rows.length;
            final total = table.rowCount;
            final truncated = shown < total;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 8),
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          table.package.isNotEmpty
                              ? '${table.package} › ${table.name}'
                              : table.name,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.close_rounded, color: Colors.white70),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    truncated
                        ? l10n.t('qfield_sql_rows_shown', {
                            'shown': '$shown',
                            'total': '$total',
                          })
                        : '$total ${l10n.t('qfield_layer_feature_count')}',
                    style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: table.rows.isEmpty
                      ? Center(
                          child: Text(
                            l10n.t('qfield_layer_no_features'),
                            style: TextStyle(color: Colors.white.withAlpha(140)),
                          ),
                        )
                      : ListView.builder(
                          controller: scroll,
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: table.rows.length,
                          itemBuilder: (_, i) {
                            final row = table.rows[i];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1A1A35),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${l10n.t('qfield_sql_row')} ${i + 1}',
                                    style: TextStyle(
                                      color: Colors.white.withAlpha(160),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  ...row.entries.map(
                                    (e) => Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            e.key,
                                            style: TextStyle(
                                              color: Colors.white.withAlpha(140),
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          SelectableText(
                                            '${e.value ?? ''}'.isEmpty ? '—' : '${e.value}',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 13,
                                              height: 1.3,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _syncMapFeatures() {
    final all = buildMapFeatures(
      geojson: _geojson,
      hiddenLayerKeys: const {},
      defaultCrsEpsg: _defaultCrsEpsg,
      layerEpsgByKey: _layerEpsgByKey,
    );
    _cableToggles = buildCableMapToggles(all);
    _features = all
        .where(
          (f) => isCableFeatureVisible(
            f,
            hiddenLayerKeys: _hiddenLayerKeys,
            hiddenCableTypeKeys: _hiddenCableTypeKeys,
            hiddenCableIdKeys: _hiddenCableIdKeys,
          ),
        )
        .toList();
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
          (l) => QFieldLayerChip(
            key: l.key,
            label: l.label,
            color: l.color,
            count: onMap[l.key] ?? l.count,
          ),
        )
        .toList();
    _invalidateMapGeometry();
  }

  void _invalidateMapGeometry() {
    _mapGeomVersion++;
    if (mounted) setState(() {});
  }

  void _ensureMapGeometryCache() {
    if (_builtGeomVersion == _mapGeomVersion) return;
    _builtGeomVersion = _mapGeomVersion;
    _cachedFeatureMarkers = _buildFeaturePointMarkers();
    _cachedLabelMarkers = buildQFieldPointLabelMarkers(
      features: _features,
      isHighlighted: _isFeatureHighlighted,
      layerNameFor: _layerNameFor,
    );
    _cachedPolylines = _buildPolylines();
    _cachedPolygons = _buildPolygons();
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
      final next = LatLng(pos.latitude, pos.longitude);
      if (_userLocation != null) {
        const dist = Distance();
        if (dist(_userLocation!, next) < 3) return;
      }
      setState(() {
        _userLocation = next;
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
      return false;
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

  void _selectFeature(
    QFieldMapFeature? f, {
    bool expandPanel = false,
    List<FeatureTapHit>? tapHits,
  }) {
    for (final c in _fieldCtrls.values) {
      c.dispose();
    }
    _fieldCtrls.clear();
    if (f != null) {
      final props = _propsFor(f);
      const skip = {'layer', 'package', 'packagePath', 'source', 'kind'};
      final hideFid =
          isCableFeature(f) && cableIdFromProperties(props) != null;
      for (final e in props.entries) {
        if (skip.contains(e.key)) continue;
        if (hideFid && e.key.toLowerCase() == 'fid') continue;
        if (e.value == null) continue;
        final s = e.value.toString();
        if (s == '[binary]') continue;
        _fieldCtrls[e.key] = TextEditingController(text: s);
      }
    }
    var hits = tapHits ?? _locationHits;
    if (f != null) {
      final anchor = featureAnchorPoint(f);
      if (anchor != null) {
        hits = featuresNearPoint(_features, anchor, maxMeters: 12);
      }
    } else if (tapHits != null) {
      hits = tapHits;
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
    _invalidateMapGeometry();
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
      if (hits.length == 1) {
        final picked = hits.first.feature;
        _selectFeature(
          picked,
          expandPanel: true,
          tapHits: hits,
        );
      } else {
        _invalidateMapGeometry();
        setState(() {
          _selectedFeatureId = null;
          _relatedCableIds = const {};
          _locationHits = hits;
        });
        for (final c in _fieldCtrls.values) {
          c.dispose();
        }
        _fieldCtrls.clear();
        try {
          _panelCtrl.animateTo(
            0.45,
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOut,
          );
        } catch (_) {}
      }
      return;
    }
    _clearTapSelection();
    if (widget.canWrite && _addCommentMode) {
      _promptAddMapComment(point);
      return;
    }
    if (widget.canWrite) {
      setState(() => _draftPin = point);
    }
  }

  String _notePreview(String text) {
    final t = text.trim();
    if (t.length <= 72) return t;
    return '${t.substring(0, 72)}…';
  }

  String _formatNoteTime(String iso) {
    try {
      return DateFormat.yMMMd().add_Hm().format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso;
    }
  }

  void _showMapNoteDetails(QFieldMapNote note) {
    final l10n = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF12122A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.paddingOf(ctx).bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
              const SizedBox(height: 16),
              Text(
                l10n.t('qfield_map_comment_detail'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: const Color(0xFF6C63FF).withAlpha(80),
                    child: Text(
                      note.authorLabel.isNotEmpty ? note.authorLabel[0].toUpperCase() : '?',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          note.authorLabel,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          _formatNoteTime(note.createdAt),
                          style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(200),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withAlpha(30)),
                ),
                child: Text(
                  note.note,
                  style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.45),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _promptAddMapComment(LatLng point) async {
    if (!widget.canWrite || widget.ticketId == null) return;
    final l10n = AppLocalizations.of(context);
    final ctrl = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF12122A),
        title: Text(
          l10n.t('qfield_map_comment_dialog_title'),
          style: const TextStyle(color: Colors.white),
        ),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLines: 4,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: l10n.t('qfield_map_comment_dialog_hint'),
            hintStyle: TextStyle(color: Colors.white.withAlpha(100)),
            filled: true,
            fillColor: const Color(0xFF0A0A18),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.t('cancel')),
          ),
          FilledButton(
            onPressed: () {
              final v = ctrl.text.trim();
              if (v.isEmpty) return;
              Navigator.pop(ctx, v);
            },
            child: Text(l10n.t('qfield_map_comment_post')),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (text == null || text.isEmpty || !mounted) return;
    await _postMapComment(point, text);
  }

  Future<void> _postMapComment(LatLng point, String text) async {
    final ticketId = widget.ticketId;
    if (ticketId == null) return;
    setState(() => _postingComment = true);
    final prov = context.read<TicketsProvider>();
    final l10n = AppLocalizations.of(context);
    final res = await prov.postTicketQFieldAction(ticketId, {
      'action': 'add_map_note',
      'projectId': widget.project.id,
      'latitude': point.latitude,
      'longitude': point.longitude,
      'note': text,
    });
    if (!mounted) return;
    setState(() {
      _postingComment = false;
      _addCommentMode = false;
    });
    if (res.ok && res.projects != null) {
      final proj = res.projects!.firstWhere(
        (p) => p.id == widget.project.id,
        orElse: () => res.projects!.first,
      );
      setState(() => _mapNotes = List<QFieldMapNote>.from(proj.mapNotes));
      _invalidateMapGeometry();
      widget.onSaved?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('qfield_map_comment_posted'))),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res.message ?? l10n.t('ticket_failed'))),
      );
    }
  }

  List<Marker> _buildMapNoteMarkers() {
    return [
      for (final note in _mapNotes)
        Marker(
          point: LatLng(note.latitude, note.longitude),
          width: 140,
          height: 72,
          alignment: Alignment.bottomCenter,
          child: QFieldMapNoteBubble(
            authorName: note.authorLabel,
            previewText: _notePreview(note.note),
            onTap: () => _showMapNoteDetails(note),
          ),
        ),
    ];
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
    out.addAll(_buildMapNoteMarkers());
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
    final ticketId = widget.ticketId;
    if (ticketId == null || ticketId.isEmpty) {
      if (!mounted) return;
      setState(() => _saving = false);
      return;
    }
    if (editsPayload.isNotEmpty) {
      final meta = await prov.postTicketQFieldAction(ticketId, {
        'action': 'update_meta',
        'projectId': widget.project.id,
        'fieldEdits': editsPayload,
      });
      ok = meta.ok;
    }

    if (_draftPin != null) {
      final pin = await prov.postTicketQFieldAction(ticketId, {
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
    if (!_loading) _ensureMapGeometryCache();

    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_loading)
            const Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF)))
          else
            RepaintBoundary(
              child: FlutterMap(
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
                    retinaMode: false,
                  ),
                  if (_cachedPolygons.isNotEmpty)
                    PolygonLayer(polygons: _cachedPolygons),
                  if (_cachedPolylines.isNotEmpty)
                    PolylineLayer(polylines: _cachedPolylines),
                  if (_buildUserLocationCircles().isNotEmpty)
                    CircleLayer(circles: _buildUserLocationCircles()),
                  MarkerLayer(
                    markers: [
                      ..._cachedFeatureMarkers,
                      ..._cachedLabelMarkers,
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
                        if (_mapNotes.isNotEmpty)
                          Text(
                            l10n.t('qfield_map_comments_count', {
                              'count': '${_mapNotes.length}',
                            }),
                            style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 10),
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
                  if (widget.canWrite && widget.ticketId != null) ...[
                    const SizedBox(width: 6),
                    _GlassIconButton(
                      icon: Icons.chat_bubble_rounded,
                      onTap: _postingComment
                          ? null
                          : () {
                              setState(() => _addCommentMode = !_addCommentMode);
                              if (_addCommentMode) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(l10n.t('qfield_map_add_comment_hint')),
                                    duration: const Duration(seconds: 3),
                                  ),
                                );
                              }
                            },
                      accent: _addCommentMode,
                    ),
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
            initialChildSize: 0.24,
            minChildSize: 0.12,
            maxChildSize: 0.88,
            snap: true,
            snapSizes: const [0.12, 0.24, 0.5, 0.88],
            builder: (ctx, scroll) => QFieldMapBottomPanel(
              scrollController: scroll,
              l10n: l10n,
              layers: _layers,
              sqlTables: _sqlTables,
              previewStats: _previewStats,
              hiddenKeys: _hiddenLayerKeys,
              selected: _selected,
              layerGroups: _layerGroups,
              tapContext: _tapContext,
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
              onPickTapFeature: (f) {
                if (_selectedFeatureId == f.id) return;
                _selectFeature(f, expandPanel: true);
              },
              onShowAllOnMap: _fitMap,
              onOpenSqlTable: _showSqlTableDetails,
              cableToggles: _cableToggles,
              hiddenCableTypeKeys: _hiddenCableTypeKeys,
              hiddenCableIdKeys: _hiddenCableIdKeys,
              onToggleCable: (toggle) {
                setState(() {
                  if (toggle.isTypeGroup) {
                    if (_hiddenCableTypeKeys.contains(toggle.key)) {
                      _hiddenCableTypeKeys.remove(toggle.key);
                    } else {
                      _hiddenCableTypeKeys.add(toggle.key);
                    }
                  } else {
                    final id = toggle.key.startsWith('cid:')
                        ? toggle.key.substring(4)
                        : toggle.key;
                    if (_hiddenCableIdKeys.contains(id)) {
                      _hiddenCableIdKeys.remove(id);
                    } else {
                      _hiddenCableIdKeys.add(id);
                    }
                  }
                  _syncMapFeatures();
                });
              },
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
