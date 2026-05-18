import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';

/// Long server preview lines: split on "Archive listing:" and "Map fields:" for readable rows.
class _PreviewHintText extends StatelessWidget {
  const _PreviewHintText({required this.text});

  final String text;
  static const String _archiveSep = 'Archive listing:';
  static const String _mapFieldsSep = 'Map fields:';

  @override
  Widget build(BuildContext context) {
    final baseStyle = TextStyle(color: Colors.white.withAlpha(160), fontSize: 12, height: 1.35);
    final subStyle = baseStyle.copyWith(fontSize: 11, color: Colors.white.withAlpha(200));

    final chunks = <String>[];
    var rest = text.trim();
    final ai = rest.indexOf(_archiveSep);
    if (ai > 0) {
      chunks.add(rest.substring(0, ai).trim());
      rest = rest.substring(ai).trim();
    }
    final mi = rest.indexOf(_mapFieldsSep);
    if (mi > 0) {
      chunks.add(rest.substring(0, mi).trim());
      rest = rest.substring(mi).trim();
    }
    if (rest.isNotEmpty) chunks.add(rest);

    if (chunks.length <= 1) {
      return Text(text, style: baseStyle);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var j = 0; j < chunks.length; j++) ...[
          if (j > 0) const SizedBox(height: 4),
          Text(chunks[j], style: j == 0 ? baseStyle : subStyle),
        ],
      ],
    );
  }
}

/// Bottom-sheet map: GeoJSON preview from server + ticket site + editable field pin.
class QFieldProjectMapSheet extends StatefulWidget {
  const QFieldProjectMapSheet({
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

  static const _tileSubdomains = ['a', 'b', 'c', 'd'];
  static const _tileUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

  @override
  State<QFieldProjectMapSheet> createState() => _QFieldProjectMapSheetState();
}

class _QFieldLayerMeta {
  const _QFieldLayerMeta({
    required this.key,
    required this.label,
    required this.color,
    this.featureCount = 0,
    this.geometryTypes = const [],
  });

  final String key;
  final String label;
  final Color color;
  final int featureCount;
  final List<String> geometryTypes;
}

class _QFieldProjectMapSheetState extends State<QFieldProjectMapSheet> {
  final MapController _mapController = MapController();
  final TextEditingController _noteCtrl = TextEditingController();

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
  List<_QFieldLayerMeta> _layers = const [];
  final Set<String> _hiddenLayerKeys = {};

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
    _loadPreview();
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
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
    var metas = <_QFieldLayerMeta>[];
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
        metas = <_QFieldLayerMeta>[];
        var i = 0;
        for (final row in rawLayers) {
          if (row is! Map<String, dynamic>) continue;
          final layer = row['layer']?.toString() ?? '';
          final pkg = row['package']?.toString() ?? '';
          if (layer.isEmpty && pkg.isEmpty) continue;
          final key = '$pkg|$layer';
          final types = (row['geometryTypes'] as List?)
                  ?.map((e) => e.toString())
                  .where((e) => e.isNotEmpty)
                  .toList() ??
              const <String>[];
          metas.add(_QFieldLayerMeta(
            key: key,
            label: pkg.isNotEmpty ? '$pkg › $layer' : layer,
            color: _layerPalette[i % _layerPalette.length],
            featureCount: (row['featureCount'] as num?)?.toInt() ?? 0,
            geometryTypes: types,
          ));
          i++;
        }
        _hiddenLayerKeys.clear();
      }
      final ma = data['mapAnnotation'];
      if (ma is Map<String, dynamic>) {
        final lat = (ma['latitude'] as num?)?.toDouble();
        final lng = (ma['longitude'] as num?)?.toDouble();
        if (lat != null && lng != null) {
          _annotation = QFieldMapAnnotation.fromJson(ma);
          _draftPin ??= LatLng(lat, lng);
        }
      }
    }
    if (metas.isEmpty && gj != null) {
      metas.addAll(_layersFromGeoJson(gj));
    }

    setState(() {
      _geojson = gj;
      _boundsApi = b;
      _hint = hint;
      _layers = metas;
      _loading = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitMap());
  }

  List<_QFieldLayerMeta> _layersFromGeoJson(Map<String, dynamic> fc) {
    final feats = fc['features'];
    if (feats is! List) return const [];
    final seen = <String>{};
    final out = <_QFieldLayerMeta>[];
    var i = 0;
    for (final f in feats) {
      if (f is! Map<String, dynamic>) continue;
      final key = _featureLayerKey(f);
      if (key.isEmpty || !seen.add(key)) continue;
      final props = f['properties'] as Map<String, dynamic>? ?? {};
      final pkg = props['package']?.toString() ?? '';
      final layer = props['layer']?.toString() ?? '';
      final label = pkg.isNotEmpty ? '$pkg › $layer' : layer;
      if (label.isEmpty) continue;
      out.add(_QFieldLayerMeta(
        key: key,
        label: label,
        color: _layerPalette[i % _layerPalette.length],
      ));
      i++;
    }
    return out;
  }

  void _fitMap() {
    final pts = <LatLng>[];
    void addFromGeoJson(Map<String, dynamic>? fc) {
      if (fc == null) return;
      final feats = fc['features'];
      if (feats is! List) return;
      for (final f in feats) {
        if (f is! Map<String, dynamic>) continue;
        final g = f['geometry'];
        if (g is! Map<String, dynamic>) continue;
        _collectCoords(g, pts);
      }
    }

    addFromGeoJson(_geojson);

    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;
    if (siteLat != null && siteLng != null) {
      pts.add(LatLng(siteLat, siteLng));
    }
    if (_draftPin != null) pts.add(_draftPin!);

    if (_boundsApi != null) {
      final b = _boundsApi!;
      pts.add(LatLng(b['south']!, b['west']!));
      pts.add(LatLng(b['north']!, b['east']!));
    }

    if (pts.isEmpty) return;

    double minLat = pts.first.latitude;
    double maxLat = pts.first.latitude;
    double minLng = pts.first.longitude;
    double maxLng = pts.first.longitude;
    for (final p in pts) {
      minLat = minLat < p.latitude ? minLat : p.latitude;
      maxLat = maxLat > p.latitude ? maxLat : p.latitude;
      minLng = minLng < p.longitude ? minLng : p.longitude;
      maxLng = maxLng > p.longitude ? maxLng : p.longitude;
    }
    final center = LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    final latSpan = (maxLat - minLat).abs();
    final lngSpan = (maxLng - minLng).abs();
    final span = latSpan > lngSpan ? latSpan : lngSpan;
    double zoom = 13;
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

  static void _collectCoords(Map<String, dynamic> g, List<LatLng> out) {
    final t = g['type'] as String?;
    final c = g['coordinates'];
    if (t == null || c == null) return;
    if (t == 'Point' && c is List && c.length >= 2) {
      out.add(LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()));
      return;
    }
    if (t == 'LineString' && c is List) {
      for (final p in c) {
        if (p is List && p.length >= 2) {
          out.add(LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble()));
        }
      }
      return;
    }
    if (t == 'Polygon' && c is List && c.isNotEmpty) {
      final ring = c.first;
      if (ring is List) {
        for (final p in ring) {
          if (p is List && p.length >= 2) {
            out.add(LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble()));
          }
        }
      }
      return;
    }
    if ((t == 'MultiPolygon' || t == 'MultiLineString' || t == 'MultiPoint') && c is List) {
      for (final part in c) {
        if (part is List) {
          if (t == 'MultiPoint') {
            for (final p in part) {
              if (p is List && p.length >= 2) {
                out.add(LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble()));
              }
            }
          } else {
            _walkCoordArray(part, out);
          }
        }
      }
    }
  }

  static void _walkCoordArray(dynamic node, List<LatLng> out) {
    if (node is List) {
      if (node.isNotEmpty &&
          node[0] is num &&
          node.length >= 2 &&
          node[1] is num) {
        out.add(LatLng((node[1] as num).toDouble(), (node[0] as num).toDouble()));
        return;
      }
      for (final e in node) {
        _walkCoordArray(e, out);
      }
    }
  }

  String _featureLayerKey(Map<String, dynamic> f) {
    final props = f['properties'];
    if (props is! Map<String, dynamic>) return '';
    final pkg = props['package']?.toString() ?? '';
    final layer = props['layer']?.toString() ?? '';
    if (props['kind'] == 'qgis_project_extent') return 'extent|${props['projectFile'] ?? ''}';
    return '$pkg|$layer';
  }

  Color _colorForFeature(Map<String, dynamic> f) {
    final key = _featureLayerKey(f);
    for (final m in _layers) {
      if (m.key == key) return m.color;
    }
    return _layerPalette[key.hashCode.abs() % _layerPalette.length];
  }

  bool _featureVisible(Map<String, dynamic> f) {
    final key = _featureLayerKey(f);
    if (key.isEmpty) return true;
    return !_hiddenLayerKeys.contains(key);
  }

  List<Polygon> _polygons() {
    final out = <Polygon>[];
    final fc = _geojson;
    if (fc == null) return out;
    final feats = fc['features'];
    if (feats is! List) return out;
    for (final f in feats) {
      if (f is! Map<String, dynamic>) continue;
      if (!_featureVisible(f)) continue;
      final color = _colorForFeature(f);
      final g = f['geometry'];
      if (g is! Map<String, dynamic>) continue;
      final t = g['type'] as String?;
      final c = g['coordinates'];
      if (t == 'Polygon' && c is List && c.isNotEmpty) {
        final ring = c.first;
        if (ring is List) {
          final pts = _ringToLatLng(ring);
          if (pts.length >= 3) {
            out.add(Polygon(
              points: pts,
              color: color.withAlpha(55),
              borderColor: color,
              borderStrokeWidth: 2,
            ));
          }
        }
      } else if (t == 'MultiPolygon' && c is List) {
        for (final poly in c) {
          if (poly is! List || poly.isEmpty) continue;
          final ring = poly.first;
          if (ring is List) {
            final pts = _ringToLatLng(ring);
            if (pts.length >= 3) {
              out.add(Polygon(
                points: pts,
                color: color.withAlpha(45),
                borderColor: color,
                borderStrokeWidth: 2,
              ));
            }
          }
        }
      }
    }
    return out;
  }

  List<Polyline> _polylines() {
    final out = <Polyline>[];
    final fc = _geojson;
    if (fc == null) return out;
    final feats = fc['features'];
    if (feats is! List) return out;
    for (final f in feats) {
      if (f is! Map<String, dynamic>) continue;
      if (!_featureVisible(f)) continue;
      final color = _colorForFeature(f);
      final g = f['geometry'];
      if (g is! Map<String, dynamic>) continue;
      final t = g['type'] as String?;
      final c = g['coordinates'];
      if (t == 'LineString' && c is List) {
        final pts = _ringToLatLng(c);
        if (pts.length >= 2) {
          out.add(Polyline(
            points: pts,
            color: color,
            strokeWidth: 3,
          ));
        }
      } else if (t == 'MultiLineString' && c is List) {
        for (final line in c) {
          if (line is List) {
            final pts = _ringToLatLng(line);
            if (pts.length >= 2) {
              out.add(Polyline(
                points: pts,
                color: color,
                strokeWidth: 2,
              ));
            }
          }
        }
      }
    }
    return out;
  }

  List<Marker> _pointMarkers() {
    final out = <Marker>[];
    final fc = _geojson;
    if (fc != null) {
      final feats = fc['features'];
      if (feats is List) {
        for (final f in feats) {
          if (f is! Map<String, dynamic>) continue;
          if (!_featureVisible(f)) continue;
          final color = _colorForFeature(f);
          final g = f['geometry'];
          if (g is! Map<String, dynamic>) continue;
          if (g['type'] == 'Point') {
            final c = g['coordinates'];
            if (c is List && c.length >= 2) {
              final pt = LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble());
              out.add(Marker(
                point: pt,
                width: 28,
                height: 28,
                child: Icon(Icons.circle, color: color, size: 18),
              ));
            }
          } else if (g['type'] == 'MultiPoint') {
            final c = g['coordinates'];
            if (c is List) {
              for (final p in c) {
                if (p is List && p.length >= 2) {
                  final pt = LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble());
                  out.add(Marker(
                    point: pt,
                    width: 22,
                    height: 22,
                    child: const Icon(Icons.circle, color: Color(0xFF6C63FF), size: 14),
                  ));
                }
              }
            }
          }
        }
      }
    }
    return out;
  }

  Widget _layerLegend(AppLocalizations l10n) {
    if (_layers.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.t('qfield_map_layers'),
            style: TextStyle(
              color: Colors.white.withAlpha(200),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final meta in _layers)
                FilterChip(
                  label: Text(
                    meta.label,
                    style: TextStyle(
                      color: _hiddenLayerKeys.contains(meta.key)
                          ? Colors.white54
                          : Colors.white,
                      fontSize: 11,
                    ),
                  ),
                  selected: !_hiddenLayerKeys.contains(meta.key),
                  onSelected: (on) {
                    setState(() {
                      if (on) {
                        _hiddenLayerKeys.remove(meta.key);
                      } else {
                        _hiddenLayerKeys.add(meta.key);
                      }
                    });
                  },
                  selectedColor: meta.color.withAlpha(60),
                  backgroundColor: Colors.white.withAlpha(18),
                  checkmarkColor: meta.color,
                  side: BorderSide(color: meta.color.withAlpha(140)),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
            ],
          ),
        ],
      ),
    );
  }

  static List<LatLng> _ringToLatLng(List<dynamic> ring) {
    final pts = <LatLng>[];
    for (final p in ring) {
      if (p is List && p.length >= 2 && p[0] is num && p[1] is num) {
        pts.add(LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble()));
      }
    }
    return pts;
  }

  LatLng _initialCenter() {
    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;
    if (siteLat != null && siteLng != null) return LatLng(siteLat, siteLng);
    if (_draftPin != null) return _draftPin!;
    if (_boundsApi != null) {
      final b = _boundsApi!;
      return LatLng((b['south']! + b['north']!) / 2, (b['west']! + b['east']!) / 2);
    }
    return const LatLng(33.3152, 44.3661);
  }

  Future<void> _savePin() async {
    if (_draftPin == null) return;
    final prov = context.read<TicketsProvider>();
    final res = await prov.postTicketQFieldAction(widget.ticketId, {
      'action': 'set_map_annotation',
      'projectId': widget.project.id,
      'latitude': _draftPin!.latitude,
      'longitude': _draftPin!.longitude,
      if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
    });
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    if (res.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('qfield_map_pin_saved'))),
      );
      widget.onSaved?.call();
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res.message ?? l10n.t('ticket_failed'))),
      );
    }
  }

  Future<void> _clearPin() async {
    if (_annotation == null) {
      setState(() {
        _draftPin = null;
        _noteCtrl.clear();
      });
      return;
    }
    final prov = context.read<TicketsProvider>();
    final res = await prov.postTicketQFieldAction(widget.ticketId, {
      'action': 'set_map_annotation',
      'projectId': widget.project.id,
      'clear': true,
    });
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    if (res.ok) {
      setState(() {
        _draftPin = null;
        _annotation = null;
        _noteCtrl.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.t('qfield_map_pin_cleared'))),
      );
      widget.onSaved?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF12122A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(40),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.t('qfield_map_title'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                  ),
                ],
              ),
            ),
            if (_hint != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: _PreviewHintText(text: _hint!),
              ),
            if (!_loading) _layerLegend(l10n),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: Color(0xFF6C63FF))),
              )
            else
              SizedBox(
                height: MediaQuery.of(context).size.height * 0.52,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: _initialCenter(),
                      initialZoom: 13,
                      onTap: widget.canWrite
                          ? (_, p) => setState(() => _draftPin = p)
                          : null,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: QFieldProjectMapSheet._tileUrlTemplate,
                        subdomains: QFieldProjectMapSheet._tileSubdomains,
                        userAgentPackageName: 'usmart_qc',
                        maxNativeZoom: 19,
                      ),
                      if (_polygons().isNotEmpty) PolygonLayer(polygons: _polygons()),
                      if (_polylines().isNotEmpty) PolylineLayer(polylines: _polylines()),
                      MarkerLayer(markers: [
                        ..._pointMarkers(),
                        if (siteLat != null && siteLng != null)
                          Marker(
                            point: LatLng(siteLat, siteLng),
                            width: 36,
                            height: 36,
                            child: const Icon(Icons.place_rounded, color: Color(0xFFFBBF24), size: 36),
                          ),
                        if (_draftPin != null)
                          Marker(
                            point: _draftPin!,
                            width: 44,
                            height: 44,
                            child: const Icon(Icons.location_on, color: Color(0xFFFF4757), size: 44),
                          ),
                      ]),
                      SimpleAttributionWidget(
                        alignment: Alignment.bottomRight,
                        backgroundColor: const Color(0xAA05051A),
                        source: Text(
                          l10n.t('site_map_attribution'),
                          style: const TextStyle(color: Colors.white70, fontSize: 10),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_geojson == null && _hint == null)
                    Text(
                      l10n.t('qfield_map_no_preview'),
                      style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 13),
                    ),
                  if (widget.canWrite) ...[
                    Text(
                      l10n.t('qfield_map_tap_place_pin'),
                      style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _noteCtrl,
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
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: _draftPin == null ? null : _savePin,
                            icon: const Icon(Icons.save_outlined, size: 20),
                            label: Text(l10n.t('qfield_map_save_pin')),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF6C63FF),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        OutlinedButton(
                          onPressed: (_draftPin == null && _annotation == null) ? null : _clearPin,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFFF4757),
                            side: const BorderSide(color: Color(0x66FF4757)),
                            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                          ),
                          child: Text(l10n.t('qfield_map_clear_pin')),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
