import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/qfield_project.dart';
import '../models/ticket.dart';
import '../providers/tickets_provider.dart';
import '../utils/coordinate_transform.dart';
import '../utils/qfield_map_features.dart';
import '../utils/responsive_layout.dart';
import 'qfield_map_symbols.dart';

/// Long server preview lines: split on "Archive listing:" and "Map fields:" for readable rows.
class _PreviewHintText extends StatelessWidget {
  const _PreviewHintText({required this.text});

  final String text;
  static const String _archiveSep = 'Archive listing:';
  static const String _filesSep = '. Files:';
  static const String _mapFieldsSep = 'Tap map features';

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
    final fi = rest.indexOf(_filesSep);
    if (fi > 0) {
      chunks.add(rest.substring(0, fi).trim());
      rest = rest.substring(fi).trim();
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

  static const tileSubdomains = ['a', 'b', 'c', 'd'];
  static const tileUrlTemplate =
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
    this.tableName = '',
  });

  final String key;
  final String label;
  final Color color;
  final int featureCount;
  final List<String> geometryTypes;
  final String tableName;
}

class _QFieldDataTable {
  const _QFieldDataTable({
    required this.name,
    required this.package,
    required this.columns,
    required this.rows,
    required this.rowCount,
    this.packagePath,
    this.hasGeometry = false,
  });

  final String name;
  final String package;
  final String? packagePath;
  final List<String> columns;
  final List<Map<String, dynamic>> rows;
  final int rowCount;
  final bool hasGeometry;

  String get layerKey => '$package|$name';
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
  List<_QFieldDataTable> _dataTables = const [];
  final Set<String> _hiddenLayerKeys = {};
  String? _focusedLayerKey;

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
    var tables = <_QFieldDataTable>[];
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
          final apiCount = (row['featureCount'] as num?)?.toInt() ?? 0;
          metas.add(_QFieldLayerMeta(
            key: key,
            label: pkg.isNotEmpty ? '$pkg › $layer' : layer,
            color: _layerPalette[i % _layerPalette.length],
            featureCount: apiCount,
            geometryTypes: types,
            tableName: layer,
          ));
          i++;
        }
        _hiddenLayerKeys.clear();
      }
      final rawTables = data['dataTables'];
      if (rawTables is List) {
        for (final row in rawTables) {
          if (row is! Map<String, dynamic>) continue;
          final name = row['name']?.toString() ?? '';
          final pkg = row['package']?.toString() ?? '';
          if (name.isEmpty) continue;
          final cols = (row['columns'] as List?)
                  ?.map((e) => e.toString())
                  .where((e) => e.isNotEmpty)
                  .toList() ??
              const <String>[];
          final rawRows = row['rows'];
          final parsedRows = <Map<String, dynamic>>[];
          if (rawRows is List) {
            for (final r in rawRows) {
              if (r is Map) {
                parsedRows.add(Map<String, dynamic>.from(r));
              }
            }
          }
          final rowCount = (row['rowCount'] as num?)?.toInt() ?? parsedRows.length;
          tables.add(_QFieldDataTable(
            name: name,
            package: pkg.isNotEmpty ? pkg : name,
            packagePath: row['packagePath']?.toString(),
            columns: cols.isNotEmpty
                ? cols
                : (parsedRows.isNotEmpty ? parsedRows.first.keys.toList() : const []),
            rows: parsedRows,
            rowCount: rowCount,
            hasGeometry: row['hasGeometry'] == true,
          ));
        }
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
      metas = _layersFromGeoJson(gj);
    }
    metas = _mergeLayerCounts(metas, gj, tables);
    if (metas.isEmpty && tables.isNotEmpty) {
      var i = 0;
      for (final t in tables) {
        metas.add(_QFieldLayerMeta(
          key: t.layerKey,
          label: t.package.isNotEmpty ? '${t.package} › ${t.name}' : t.name,
          color: _layerPalette[i % _layerPalette.length],
            featureCount: t.rowCount > 0 ? t.rowCount : t.rows.length,
          geometryTypes: t.hasGeometry ? const ['SQL'] : const ['Attributes'],
          tableName: t.name,
        ));
        i++;
      }
    }

    setState(() {
      _geojson = gj;
      _boundsApi = b;
      _hint = hint;
      _layers = metas;
      _dataTables = tables;
      _loading = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitMap());
  }

  Map<String, int> _countFeaturesPerLayer(Map<String, dynamic>? fc) {
    final counts = <String, int>{};
    if (fc == null) return counts;
    final feats = fc['features'];
    if (feats is! List) return counts;
    for (final f in feats) {
      if (f is! Map<String, dynamic>) continue;
      final key = _featureLayerKey(f);
      if (key.isEmpty) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  int _bestLayerCount(int a, int b) => a > b ? a : b;

  List<_QFieldLayerMeta> _mergeLayerCounts(
    List<_QFieldLayerMeta> metas,
    Map<String, dynamic>? gj,
    List<_QFieldDataTable> tables,
  ) {
    final counts = _countFeaturesPerLayer(gj);

    for (final t in tables) {
      final n = _bestLayerCount(t.rowCount, t.rows.length);
      if (n > 0) {
        counts[t.layerKey] = _bestLayerCount(counts[t.layerKey] ?? 0, n);
      }
      final altKey = '${t.name}|${t.name}';
      if (t.package != t.name) {
        counts['${t.package}|${t.name}'] = _bestLayerCount(
          counts['${t.package}|${t.name}'] ?? 0,
          n,
        );
      }
      if (counts.containsKey(altKey)) {
        counts[altKey] = _bestLayerCount(counts[altKey] ?? 0, n);
      }
    }

    final byKey = <String, _QFieldLayerMeta>{};
    var palette = 0;
    for (final m in metas) {
      final count = _bestLayerCount(counts[m.key] ?? 0, m.featureCount);
      byKey[m.key] = _QFieldLayerMeta(
        key: m.key,
        label: m.label,
        color: m.color,
        featureCount: count,
        geometryTypes: m.geometryTypes,
        tableName: m.tableName.isNotEmpty ? m.tableName : m.key.split('|').last,
      );
      palette++;
    }

    for (final t in tables) {
      final key = t.layerKey;
      if (byKey.containsKey(key)) {
        final prev = byKey[key]!;
        byKey[key] = _QFieldLayerMeta(
          key: prev.key,
          label: prev.label,
          color: prev.color,
          featureCount: _bestLayerCount(prev.featureCount, counts[key] ?? t.rowCount),
          geometryTypes: prev.geometryTypes.isNotEmpty
              ? prev.geometryTypes
              : (t.hasGeometry ? const ['SQL'] : const ['Attributes']),
          tableName: t.name,
        );
        continue;
      }
      final count = _bestLayerCount(counts[key] ?? 0, t.rowCount);
      byKey[key] = _QFieldLayerMeta(
        key: key,
        label: t.package.isNotEmpty ? '${t.package} › ${t.name}' : t.name,
        color: _layerPalette[palette % _layerPalette.length],
        featureCount: count,
        geometryTypes: t.hasGeometry ? const ['SQL'] : const ['Attributes'],
        tableName: t.name,
      );
      palette++;
    }

    return byKey.values.toList();
  }

  List<_QFieldLayerMeta> _layersFromGeoJson(Map<String, dynamic> fc) {
    final counts = _countFeaturesPerLayer(fc);
    if (counts.isEmpty) return const [];
    final out = <_QFieldLayerMeta>[];
    var i = 0;
    for (final entry in counts.entries) {
      final key = entry.key;
      final parts = key.split('|');
      final pkg = parts.isNotEmpty ? parts.first : '';
      final layer = parts.length > 1 ? parts.sublist(1).join('|') : key;
      final label = pkg.isNotEmpty ? '$pkg › $layer' : layer;
      if (label.isEmpty) continue;
      out.add(_QFieldLayerMeta(
        key: key,
        label: label,
        color: _layerPalette[i % _layerPalette.length],
        featureCount: entry.value,
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

  bool _featureVisible(Map<String, dynamic> f) {
    final key = _featureLayerKey(f);
    if (key.isEmpty) return true;
    if (_hiddenLayerKeys.contains(key)) return false;
    if (_focusedLayerKey != null && _focusedLayerKey != key) return false;
    return true;
  }

  String? _geometryType(Map<String, dynamic> f) {
    final g = f['geometry'];
    if (g is Map<String, dynamic>) return g['type'] as String?;
    return null;
  }

  List<Map<String, dynamic>> _featuresForLayer(String layerKey) {
    final fc = _geojson;
    if (fc == null) return const [];
    final feats = fc['features'];
    if (feats is! List) return const [];
    final out = <Map<String, dynamic>>[];
    for (final f in feats) {
      if (f is! Map<String, dynamic>) continue;
      if (_featureLayerKey(f) == layerKey) out.add(f);
    }
    return out;
  }

  _QFieldDataTable? _dataTableForLayer(String layerKey) {
    for (final t in _dataTables) {
      if (t.layerKey == layerKey) return t;
    }
    final parts = layerKey.split('|');
    if (parts.length >= 2) {
      final layer = parts.last;
      for (final t in _dataTables) {
        if (t.name == layer) return t;
      }
    }
    return null;
  }

  List<Map<String, dynamic>> _sqlRowsForLayer(String layerKey) {
    final table = _dataTableForLayer(layerKey);
    return table?.rows ?? const [];
  }

  void _showLayerDetails(_QFieldLayerMeta meta) {
    final l10n = AppLocalizations.of(context);
    final features = _featuresForLayer(meta.key);
    final sqlRows = _sqlRowsForLayer(meta.key);
    final sqlTable = _dataTableForLayer(meta.key);
    setState(() => _focusedLayerKey = meta.key);

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
          initialChildSize: 0.58,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (_, scroll) {
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
                  padding: EdgeInsets.fromLTRB(
                    RLayout.horizontalPad(ctx),
                    12,
                    RLayout.horizontalPad(ctx) - 4,
                    8,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: meta.color,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white38),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          meta.label,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      MinTouchTarget(
                        onTap: () => Navigator.pop(ctx),
                        child: const Icon(Icons.close_rounded, color: Colors.white70, size: 26),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: RLayout.horizontalPad(ctx)),
                  child: Text(
                    '${features.isNotEmpty ? features.length : sqlRows.length} ${l10n.t('qfield_layer_feature_count')}'
                    '${sqlTable != null ? ' · ${sqlTable.columns.length} ${l10n.t('qfield_sql_columns')}' : ''}'
                    ' · ${meta.geometryTypes.join(', ')}',
                    style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: _buildLayerDetailList(
                    scroll: scroll,
                    l10n: l10n,
                    features: features,
                    sqlRows: sqlRows,
                    sqlColumns: sqlTable?.columns ?? const [],
                  ),
                ),
              ],
            );
          },
        );
      },
    ).whenComplete(() {
      if (mounted) setState(() => _focusedLayerKey = null);
    });
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
      final g = f['geometry'];
      if (g is! Map<String, dynamic>) continue;
      final t = g['type'] as String?;
      final c = g['coordinates'];
      final props = featureProperties(f);
      final layerName = props['layer']?.toString();
      final polySym = QFieldMapSymbols.polygonStyle(layerName);
      if (t == 'Polygon' && c is List && c.isNotEmpty) {
        final ring = c.first;
        if (ring is List) {
          final pts = ringToLatLng(ring, crsProps: props);
          if (pts.length >= 3) {
            out.add(Polygon(
              points: pts,
              color: polySym.fill,
              borderColor: polySym.border,
              borderStrokeWidth: polySym.borderWidth,
            ));
          }
        }
      } else if (t == 'MultiPolygon' && c is List) {
        for (final poly in c) {
          if (poly is! List || poly.isEmpty) continue;
          final ring = poly.first;
          if (ring is List) {
            final pts = ringToLatLng(ring, crsProps: props);
            if (pts.length >= 3) {
              out.add(Polygon(
                points: pts,
                color: polySym.fill,
                borderColor: polySym.border,
                borderStrokeWidth: polySym.borderWidth,
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
      final g = f['geometry'];
      if (g is! Map<String, dynamic>) continue;
      final t = g['type'] as String?;
      final c = g['coordinates'];
      final props = featureProperties(f);
      final lineSym = QFieldMapSymbols.lineStyle(props['layer']?.toString());
      if (t == 'LineString' && c is List) {
        final pts = ringToLatLng(c, crsProps: props);
        if (pts.length >= 2) {
          out.add(Polyline(
            points: pts,
            color: lineSym.color,
            strokeWidth: lineSym.strokeWidth,
            borderColor: lineSym.borderColor ?? lineSym.color.withAlpha(80),
            borderStrokeWidth: lineSym.borderStrokeWidth,
          ));
        }
      } else if (t == 'MultiLineString' && c is List) {
        for (final line in c) {
          if (line is List) {
            final pts = ringToLatLng(line, crsProps: props);
            if (pts.length >= 2) {
              out.add(Polyline(
                points: pts,
                color: lineSym.color,
                strokeWidth: lineSym.strokeWidth,
                borderColor: lineSym.borderColor ?? lineSym.color.withAlpha(70),
                borderStrokeWidth: lineSym.borderStrokeWidth,
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
          final g = f['geometry'];
          if (g is! Map<String, dynamic>) continue;
          final props = featureProperties(f);
          final layerName = props['layer']?.toString();
          final ptStyle = QFieldMapSymbols.pointStyle(layerName);
          if (g['type'] == 'Point') {
            final c = g['coordinates'];
            if (c is List && c.length >= 2) {
              final pt = CoordinateTransform.reprojectXY(
                (c[0] as num).toDouble(),
                (c[1] as num).toDouble(),
                epsg: CoordinateTransform.epsgFromProperties(props),
                crsEpsg: props['crsEpsg']?.toString(),
              );
              if (pt == null) continue;
              out.add(Marker(
                point: pt,
                width: ptStyle.width,
                height: ptStyle.height,
                child: QFieldMapPointIcon(layerName: layerName),
              ));
              if (shouldShowMapLabel(layerName)) {
                final text = mapLabelForFeature(props, layerName);
                if (text != null && text.isNotEmpty) {
                  final closureBox = useClosureBoxMapLabel(layerName);
                  out.add(Marker(
                    point: pt,
                    width: closureBox ? 46 : 50,
                    height: closureBox ? 24 : 22,
                    alignment: Alignment.bottomCenter,
                    child: Transform.translate(
                      offset: Offset(0, closureBox ? -24 : -22),
                      child: QFieldMapPointLabel(
                        text: text,
                        closureBox: closureBox,
                      ),
                    ),
                  ));
                }
              }
            }
          } else if (g['type'] == 'MultiPoint') {
            final c = g['coordinates'];
            if (c is List) {
              for (final p in c) {
                if (p is List && p.length >= 2) {
                  final pt = CoordinateTransform.reprojectXY(
                    (p[0] as num).toDouble(),
                    (p[1] as num).toDouble(),
                    epsg: CoordinateTransform.epsgFromProperties(props),
                    crsEpsg: props['crsEpsg']?.toString(),
                  );
                  if (pt == null) continue;
                  out.add(Marker(
                    point: pt,
                    width: ptStyle.width * 0.9,
                    height: ptStyle.height * 0.9,
                    child: QFieldMapPointIcon(layerName: layerName, small: true),
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

  static const _metaPropertyKeys = {
    'layer',
    'package',
    'packagePath',
    'source',
    'kind',
  };

  Widget _buildLayerDetailList({
    required ScrollController scroll,
    required AppLocalizations l10n,
    required List<Map<String, dynamic>> features,
    required List<Map<String, dynamic>> sqlRows,
    required List<String> sqlColumns,
  }) {
    final itemCount = features.isNotEmpty ? features.length : sqlRows.length;
    if (itemCount == 0) {
      return Center(
        child: Text(
          l10n.t('qfield_layer_no_features'),
          style: TextStyle(color: Colors.white.withAlpha(140)),
        ),
      );
    }

    return ListView.builder(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      itemCount: itemCount,
      itemBuilder: (_, i) {
        Map<String, dynamic> props = {};
        String subtitle = l10n.t('qfield_sql_row');

        if (features.isNotEmpty && i < features.length) {
          final f = features[i];
          props = Map<String, dynamic>.from(
            (f['properties'] as Map<String, dynamic>?) ?? {},
          );
          subtitle = _geometryType(f) ?? 'Feature';
          if (i < sqlRows.length) {
            props.addAll(sqlRows[i]);
          }
        } else if (i < sqlRows.length) {
          props = Map<String, dynamic>.from(sqlRows[i]);
        }

        props.removeWhere((k, _) => _metaPropertyKeys.contains(k));

        final orderedKeys = <String>[
          ...sqlColumns.where(props.containsKey),
          ...props.keys.where((k) => !sqlColumns.contains(k)),
        ];

        return Card(
          color: const Color(0xFF1A1A35),
          margin: const EdgeInsets.only(bottom: 8),
          child: ExpansionTile(
            initiallyExpanded: itemCount <= 3,
            tilePadding: const EdgeInsets.symmetric(horizontal: 12),
            title: Text(
              '${l10n.t('qfield_layer_feature')} ${i + 1}',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
            subtitle: Text(
              subtitle,
              style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
            ),
            children: orderedKeys.isEmpty
                ? [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        l10n.t('qfield_layer_no_attributes'),
                        style: TextStyle(
                          color: Colors.white.withAlpha(130),
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ]
                : orderedKeys.map((key) {
                    return ListTile(
                      dense: true,
                      title: Text(
                        key,
                        style: TextStyle(
                          color: Colors.white.withAlpha(200),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: SelectableText(
                        '${props[key] ?? ''}',
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                      ),
                    );
                  }).toList(),
          ),
        );
      },
    );
  }

  Widget _layerChip(_QFieldLayerMeta meta) {
    final hidden = _hiddenLayerKeys.contains(meta.key);
    final label = meta.label;
    final count = meta.featureCount > 0 ? '${meta.featureCount}' : '…';
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: _focusedLayerKey == meta.key
            ? meta.color.withAlpha(70)
            : Colors.white.withAlpha(18),
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          onTap: () => _showLayerDetails(meta),
          borderRadius: BorderRadius.circular(24),
          child: Container(
            constraints: const BoxConstraints(minHeight: RLayout.minTouchTarget),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: _focusedLayerKey == meta.key
                    ? meta.color
                    : meta.color.withAlpha(140),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  hidden ? Icons.visibility_off_outlined : Icons.layers_outlined,
                  size: 18,
                  color: meta.color,
                ),
                const SizedBox(width: 6),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 200),
                  child: Text(
                    '$label ($count)',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: hidden ? Colors.white54 : Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                MinTouchTarget(
                  onTap: () {
                    setState(() {
                      if (hidden) {
                        _hiddenLayerKeys.remove(meta.key);
                      } else {
                        _hiddenLayerKeys.add(meta.key);
                      }
                    });
                  },
                  child: Icon(
                    hidden ? Icons.visibility_off : Icons.visibility,
                    size: 20,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _layerLegend(AppLocalizations l10n, double horizontalPad) {
    if (_layers.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: EdgeInsets.fromLTRB(horizontalPad, 0, horizontalPad, 8),
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
          const SizedBox(height: 2),
          Text(
            l10n.t('qfield_map_layers_tap_hint'),
            style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: RLayout.minTouchTarget + 4,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [for (final meta in _layers) _layerChip(meta)],
            ),
          ),
        ],
      ),
    );
  }

  void _mapZoomBy(double delta) {
    final cam = _mapController.camera;
    final next = (cam.zoom + delta).clamp(3.0, 19.0);
    _mapController.move(cam.center, next);
  }

  void _mapRecenter() {
    _fitMap();
  }

  Widget _mapFloatingControls() {
    return Positioned(
      right: 8,
      top: 8,
      child: Column(
        children: [
          _MapControlButton(
            icon: Icons.add,
            onTap: () => _mapZoomBy(1),
          ),
          const SizedBox(height: 6),
          _MapControlButton(
            icon: Icons.remove,
            onTap: () => _mapZoomBy(-1),
          ),
          const SizedBox(height: 6),
          _MapControlButton(
            icon: Icons.my_location_rounded,
            onTap: _mapRecenter,
          ),
        ],
      ),
    );
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

  Widget _pinActions(AppLocalizations l10n) {
    final narrow = RLayout.isNarrow(context);
    final saveBtn = SizedBox(
      width: double.infinity,
      height: RLayout.minTouchTarget,
      child: FilledButton.icon(
        onPressed: _draftPin == null ? null : _savePin,
        icon: const Icon(Icons.save_outlined, size: 20),
        label: Text(l10n.t('qfield_map_save_pin')),
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF6C63FF),
          foregroundColor: Colors.white,
        ),
      ),
    );
    final clearBtn = SizedBox(
      width: narrow ? double.infinity : null,
      height: RLayout.minTouchTarget,
      child: OutlinedButton(
        onPressed: (_draftPin == null && _annotation == null) ? null : _clearPin,
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFFF4757),
          side: const BorderSide(color: Color(0x66FF4757)),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        child: Text(l10n.t('qfield_map_clear_pin')),
      ),
    );
    if (narrow) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [saveBtn, const SizedBox(height: 8), clearBtn],
      );
    }
    return Row(
      children: [
        Expanded(child: saveBtn),
        const SizedBox(width: 10),
        clearBtn,
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final siteLat = widget.ticket?.siteLatitude;
    final siteLng = widget.ticket?.siteLongitude;
    final hPad = RLayout.horizontalPad(context);
    final bottomInset = RLayout.viewPadding(context).bottom;

    return LayoutBuilder(
      builder: (context, constraints) {
        final sheetH = constraints.maxHeight.isFinite && constraints.maxHeight > 100
            ? constraints.maxHeight
            : MediaQuery.sizeOf(context).height * 0.9;

        return Container(
          height: sheetH,
          decoration: const BoxDecoration(
            color: Color(0xFF12122A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
          ),
          child: SafeArea(
            top: false,
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 8),
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(40),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(hPad, 10, hPad - 4, 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          l10n.t('qfield_map_title'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: RLayout.isCompact(context) ? 16 : 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      MinTouchTarget(
                        onTap: () => Navigator.of(context).pop(),
                        child: const Icon(Icons.close_rounded, color: Colors.white70, size: 26),
                      ),
                    ],
                  ),
                ),
                if (_hint != null)
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: hPad, vertical: 4),
                    child: _PreviewHintText(text: _hint!),
                  ),
                if (!_loading) _layerLegend(l10n, hPad),
                if (_loading)
                  const Expanded(
                    child: Center(
                      child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
                    ),
                  )
                else
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: hPad),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Stack(
                          children: [
                            FlutterMap(
                              mapController: _mapController,
                              options: MapOptions(
                                initialCenter: _initialCenter(),
                                initialZoom: 13,
                                interactionOptions: const InteractionOptions(
                                  flags: InteractiveFlag.all,
                                ),
                                onTap: widget.canWrite
                                    ? (_, p) => setState(() => _draftPin = p)
                                    : null,
                              ),
                              children: [
                                TileLayer(
                                  urlTemplate: QFieldProjectMapSheet.tileUrlTemplate,
                                  subdomains: QFieldProjectMapSheet.tileSubdomains,
                                  userAgentPackageName: 'usmart_qc',
                                  maxNativeZoom: 19,
                                ),
                                if (_polygons().isNotEmpty)
                                  PolygonLayer(polygons: _polygons()),
                                if (_polylines().isNotEmpty)
                                  PolylineLayer(polylines: _polylines()),
                                MarkerLayer(
                                  markers: [
                                    ..._pointMarkers(),
                                    if (siteLat != null && siteLng != null)
                                      Marker(
                                        point: LatLng(siteLat, siteLng),
                                        width: 40,
                                        height: 40,
                                        child: const Icon(
                                          Icons.place_rounded,
                                          color: Color(0xFFFBBF24),
                                          size: 38,
                                        ),
                                      ),
                                    if (_draftPin != null)
                                      Marker(
                                        point: _draftPin!,
                                        width: 48,
                                        height: 48,
                                        child: const Icon(
                                          Icons.location_on,
                                          color: Color(0xFFFF4757),
                                          size: 46,
                                        ),
                                      ),
                                  ],
                                ),
                                SimpleAttributionWidget(
                                  alignment: Alignment.bottomLeft,
                                  backgroundColor: const Color(0xAA05051A),
                                  source: Text(
                                    l10n.t('site_map_attribution'),
                                    style: const TextStyle(color: Colors.white70, fontSize: 9),
                                  ),
                                ),
                              ],
                            ),
                            _mapFloatingControls(),
                          ],
                        ),
                      ),
                    ),
                  ),
                Flexible(
                  child: SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(hPad, 10, hPad, bottomInset + 12),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
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
                            style: const TextStyle(color: Colors.white, fontSize: 15),
                            minLines: 1,
                            maxLines: 3,
                            textInputAction: TextInputAction.done,
                            decoration: InputDecoration(
                              hintText: l10n.t('qfield_map_note_hint'),
                              hintStyle: TextStyle(color: Colors.white.withAlpha(90)),
                              filled: true,
                              fillColor: const Color(0xFF05051A),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 14,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          _pinActions(l10n),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MapControlButton extends StatelessWidget {
  const _MapControlButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xEE12122A),
      borderRadius: BorderRadius.circular(10),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: RLayout.minTouchTarget,
          height: RLayout.minTouchTarget,
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}

