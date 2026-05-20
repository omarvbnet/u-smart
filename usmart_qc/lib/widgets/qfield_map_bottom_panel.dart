import 'dart:io' show Platform;

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../utils/qfield_map_features.dart';
import '../utils/qfield_map_tap_context.dart';

/// Layer visibility chip in the map panel.
class QFieldLayerChip {
  QFieldLayerChip({
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

/// SQL attribute table row bundle for the map panel.
class QFieldSqlTableData {
  const QFieldSqlTableData({
    required this.name,
    required this.package,
    required this.layerKey,
    required this.columns,
    required this.rows,
    required this.rowCount,
    required this.hasGeometry,
  });

  final String name;
  final String package;
  final String layerKey;
  final List<String> columns;
  final List<Map<String, dynamic>> rows;
  final int rowCount;
  final bool hasGeometry;
}

/// Bottom sheet for QField map — [CustomScrollView] + sheet controller fixes vertical scroll.
class QFieldMapBottomPanel extends StatelessWidget {
  const QFieldMapBottomPanel({
    super.key,
    required this.scrollController,
    required this.l10n,
    required this.layers,
    required this.sqlTables,
    this.previewStats,
    required this.hiddenKeys,
    required this.selected,
    required this.layerGroups,
    this.tapContext,
    required this.canWrite,
    this.hint,
    required this.noteCtrl,
    required this.fieldCtrls,
    required this.userLocationLabel,
    required this.onToggleLayer,
    required this.onFieldChanged,
    required this.onClearSelection,
    required this.onPickTapFeature,
    required this.onShowAllOnMap,
    required this.onOpenSqlTable,
    required this.cableToggles,
    required this.hiddenCableTypeKeys,
    required this.hiddenCableIdKeys,
    required this.onToggleCable,
  });

  final ScrollController scrollController;
  final AppLocalizations l10n;
  final List<QFieldLayerChip> layers;
  final List<QFieldSqlTableData> sqlTables;
  final Map<String, dynamic>? previewStats;
  final Set<String> hiddenKeys;
  final QFieldMapFeature? selected;
  final List<LayerHitGroup> layerGroups;
  final QFieldTapContext? tapContext;
  final bool canWrite;
  final String? hint;
  final TextEditingController noteCtrl;
  final Map<String, TextEditingController> fieldCtrls;
  final String? userLocationLabel;
  final void Function(String key) onToggleLayer;
  final void Function(String featureId, String key, String value) onFieldChanged;
  final VoidCallback onClearSelection;
  final void Function(QFieldMapFeature feature) onPickTapFeature;
  final VoidCallback onShowAllOnMap;
  final void Function(QFieldSqlTableData table) onOpenSqlTable;
  final List<CableMapToggle> cableToggles;
  final Set<String> hiddenCableTypeKeys;
  final Set<String> hiddenCableIdKeys;
  final void Function(CableMapToggle toggle) onToggleCable;

  static const _accent = Color(0xFF6C63FF);
  static const _mint = Color(0xFF00D4AA);

  @override
  Widget build(BuildContext context) {
    final hasInfo = layerGroups.isNotEmpty;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF12122A),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(
            top: BorderSide(color: Colors.white.withAlpha(45)),
            left: BorderSide(color: Colors.white.withAlpha(20)),
            right: BorderSide(color: Colors.white.withAlpha(20)),
          ),
        ),
        child: Scrollbar(
          controller: scrollController,
          thumbVisibility: true,
          radius: const Radius.circular(8),
          interactive: true,
          child: CustomScrollView(
            controller: scrollController,
            primary: false,
            physics: QFieldPanelScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(
                parent: Platform.isIOS
                    ? const BouncingScrollPhysics()
                    : const ClampingScrollPhysics(),
              ),
            ),
            cacheExtent: 640,
            slivers: [
              const SliverToBoxAdapter(child: _PanelDragHandle()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _panelToolbar(l10n),
                    const SizedBox(height: 12),
                    _MapControlsCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (previewStats != null) ...[
                            _PreviewStatsBanner(l10n: l10n, stats: previewStats!),
                            const SizedBox(height: 12),
                          ],
                          if (hint != null && hint!.isNotEmpty) ...[
                            _ArchiveHintText(hint: hint!),
                            const SizedBox(height: 12),
                          ],
                          _SectionLabel(
                            icon: Icons.layers_rounded,
                            title: l10n.t('qfield_map_layers'),
                            color: _accent,
                          ),
                          const SizedBox(height: 8),
                          _HorizontalChipRow(
                            height: 42,
                            children: [
                              for (final l in layers)
                                _MapFilterChip(
                                  label: '${l.label} (${l.count})',
                                  color: l.color,
                                  selected: !hiddenKeys.contains(l.key),
                                  onTap: () => onToggleLayer(l.key),
                                ),
                            ],
                          ),
                          if (cableToggles.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            _SectionLabel(
                              icon: Icons.cable_rounded,
                              title: l10n.t('qfield_map_cable_types'),
                              color: _mint,
                            ),
                            const SizedBox(height: 8),
                            _HorizontalChipRow(
                              height: 38,
                              children: [
                                for (final t in cableToggles.where((x) => x.isTypeGroup))
                                  _MapFilterChip(
                                    label: '${t.label} (${t.count})',
                                    color: t.color,
                                    selected: !hiddenCableTypeKeys.contains(t.key),
                                    onTap: () => onToggleCable(t),
                                    compact: true,
                                  ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            _SectionLabel(
                              icon: Icons.tag_rounded,
                              title: l10n.t('qfield_map_cable_ids'),
                              color: _mint,
                            ),
                            const SizedBox(height: 8),
                            _HorizontalChipRow(
                              height: 38,
                              children: [
                                for (final t in cableToggles.where((x) => !x.isTypeGroup))
                                  _MapFilterChip(
                                    label: t.label,
                                    color: t.color,
                                    selected: !hiddenCableIdKeys.contains(
                                      t.key.startsWith('cid:')
                                          ? t.key.substring(4)
                                          : t.key,
                                    ),
                                    onTap: () => onToggleCable(t),
                                    compact: true,
                                  ),
                              ],
                            ),
                          ],
                          if (sqlTables.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            _SectionLabel(
                              icon: Icons.table_chart_rounded,
                              title: l10n.t('qfield_map_sql_tables', {
                                'count': '${sqlTables.length}',
                              }),
                              color: const Color(0xFF38BDF8),
                            ),
                            const SizedBox(height: 8),
                            ...sqlTables.map(
                              (t) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _SqlTableTile(
                                  table: t,
                                  l10n: l10n,
                                  onTap: () => onOpenSqlTable(t),
                                ),
                              ),
                            ),
                          ],
                          if (userLocationLabel != null) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                const Icon(Icons.my_location, color: Color(0xFF2196F3), size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    userLocationLabel!,
                                    style: TextStyle(
                                      color: Colors.white.withAlpha(180),
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ]),
                ),
              ),
              if (hasInfo) ...[
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      children: [
                        Expanded(child: Container(height: 1, color: Colors.white.withAlpha(30))),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            l10n.t('qfield_map_feature_data'),
                            style: TextStyle(
                              color: Colors.white.withAlpha(140),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                        Expanded(child: Container(height: 1, color: Colors.white.withAlpha(30))),
                      ],
                    ),
                  ),
                ),
                ..._infoSectionSlivers(context),
              ],
              const SliverPadding(padding: EdgeInsets.only(bottom: 40)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _panelToolbar(AppLocalizations l10n) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _accent.withAlpha(50),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.map_rounded, color: _accent, size: 22),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            l10n.t('qfield_map_layers'),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 17,
              letterSpacing: -0.3,
            ),
          ),
        ),
        if (layerGroups.isNotEmpty && selected != null)
          IconButton(
            onPressed: onClearSelection,
            icon: const Icon(Icons.close_rounded, color: Colors.white54),
            tooltip: l10n.t('qfield_map_tap_pick_element'),
          ),
        TextButton.icon(
          onPressed: onShowAllOnMap,
          icon: const Icon(Icons.fit_screen_rounded, size: 18, color: _mint),
          label: Text(
            l10n.t('qfield_map_fit_all'),
            style: const TextStyle(color: _mint, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  static const _infoPad = EdgeInsets.fromLTRB(16, 12, 16, 0);

  String _attributeLabel(String propertyKey) => holeIdDisplayLabel(
        propertyKey,
        fallback: l10n.t('qfield_map_hole_id'),
      );

  List<Widget> _infoSectionSlivers(BuildContext context) {
    final builders = _infoSectionBuilders(context);
    if (builders.isEmpty) return const [];
    return [
      SliverPadding(
        padding: _infoPad,
        sliver: SliverList(
          delegate: SliverChildBuilderDelegate(
            (context, index) {
              if (index > 0) {
                return Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: RepaintBoundary(child: builders[index]()),
                );
              }
              return RepaintBoundary(child: builders[index]());
            },
            childCount: builders.length,
            addAutomaticKeepAlives: false,
            addRepaintBoundaries: false,
          ),
        ),
      ),
    ];
  }

  List<Widget Function()> _infoSectionBuilders(BuildContext context) {
    if (selected == null && layerGroups.isNotEmpty) {
      return [
        () => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.t('qfield_map_tap_pick_element'),
              style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 13),
            ),
            const SizedBox(height: 10),
            for (final group in layerGroups) ...[
              _LayerGroupHeader(group: group),
              for (final h in group.hits)
                _TapElementTile(
                  hit: h,
                  selected: selected,
                  onPick: onPickTapFeature,
                ),
            ],
          ],
        ),
      ];
    }

    if (tapContext == null) {
      return [
        () => Text(
          l10n.t('qfield_map_tap_feature'),
          style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 13),
        ),
      ];
    }

    if (tapContext!.isRouteSelection) {
      return _routeInfoSectionBuilders();
    }

    return _fatInfoSectionBuilders();
  }

  List<Widget Function()> _routeInfoSectionBuilders() {
    final ctx = tapContext!;
    final sections = <Widget Function()>[
      () => _SelectedElementHeader(
        title: ctx.routeId ?? featureTapListTitle(ctx.selected),
        subtitle: _tapHeaderSubtitle(l10n, ctx),
        icon: Icons.route_rounded,
      ),
    ];
    if (ctx.routeSiteInfo.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_route_site_info'),
          icon: Icons.construction_rounded,
          accent: _mint,
          children: ctx.routeSiteInfo.entries
              .map((e) => _FeatureDataRow(label: _attributeLabel(e.key), value: e.value, accent: true))
              .toList(),
        ),
      );
    }
    sections.add(
      () => _InfoSectionCard(
        title: l10n.t('qfield_map_cables_in_route'),
        icon: Icons.cable_rounded,
        accent: _accent,
        children: [
          if (ctx.routeCablesByType.isEmpty)
            Text(
              l10n.t('qfield_map_no_cables_on_route'),
              style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
            )
          else
            for (final entry in ctx.routeCablesByType.entries) ...[
              _CableTypeHeader(label: entry.key),
              for (final h in entry.value)
                _FeatureDataRow(
                  label: cableIdPropertyKey(h.feature.properties) ??
                      l10n.t('qfield_map_cable_id'),
                  value: cableIdFromProperties(h.feature.properties) ??
                      featureTapListTitle(h.feature),
                  accent: true,
                ),
            ],
        ],
      ),
    );
    sections.add(
      () => _InfoSectionCard(
        title: l10n.t('qfield_map_feature_data'),
        icon: Icons.info_outline_rounded,
        children: displayPropsForFeature(ctx.selected)
            .entries
            .map((e) => _FeatureDataRow(label: _attributeLabel(e.key), value: '${e.value ?? ''}'))
            .toList(),
      ),
    );
    return sections;
  }

  Widget _fatHeaderSection(QFieldTapContext ctx) {
    final headerChildren = <Widget>[
      _SelectedElementHeader(
        title: featureTapListTitle(ctx.selected),
        subtitle: _tapHeaderSubtitle(l10n, ctx),
        icon: Icons.place_rounded,
      ),
    ];
    final closureId = ctx.selectedClosureOrOdfId ?? ctx.fatClosuresId;
    final closureKey = ctx.selectedClosurePropertyKey ?? ctx.fatClosuresPropertyKey;
    if (closureId != null && closureId.isNotEmpty) {
      headerChildren.addAll([
        const SizedBox(height: 10),
        _FeatureDataRow(
          label: closureKey ?? l10n.t('qfield_map_closure_odf_id'),
          value: closureId,
          accent: true,
        ),
      ]);
    }
    if (ctx.selectedHoleId != null && ctx.selectedHoleId!.isNotEmpty) {
      headerChildren.addAll([
        const SizedBox(height: 10),
        _FeatureDataRow(
          label: holeIdDisplayLabel(
            ctx.selectedHolePropertyKey,
            fallback: l10n.t('qfield_map_hole_id'),
          ),
          value: ctx.selectedHoleId!,
          accent: true,
        ),
      ]);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: headerChildren,
    );
  }

  Widget _handholeBundleCard(HandholeTapBundle bundle) {
    return _InfoSectionCard(
      title: handholeIdFromProperties(bundle.handhole.feature.properties) ??
          featureTapListTitle(bundle.handhole.feature),
      icon: Icons.grid_on_rounded,
      accent: const Color(0xFFE53935),
      children: [
        _TapElementTile(
          hit: bundle.handhole,
          selected: selected,
          onPick: onPickTapFeature,
        ),
        if (bundle.holeId != null && bundle.holeId!.isNotEmpty)
          _FeatureDataRow(
            label: holeIdDisplayLabel(
              bundle.holePropertyKey,
              fallback: l10n.t('qfield_map_hole_id'),
            ),
            value: bundle.holeId!,
            accent: true,
          ),
        if (bundle.closureOrOdfId != null && bundle.closureOrOdfId!.isNotEmpty)
          _FeatureDataRow(
            label: bundle.closurePropertyKey ?? l10n.t('qfield_map_closure_odf_id'),
            value: bundle.closureOrOdfId!,
            accent: true,
          ),
        ...displayPropsForFeature(bundle.handhole.feature)
            .entries
            .where(
              (e) =>
                  (bundle.closurePropertyKey == null ||
                      e.key != bundle.closurePropertyKey) &&
                  !isHoleIdPropertyKey(e.key),
            )
            .map((e) => _FeatureDataRow(label: _attributeLabel(e.key), value: '${e.value ?? ''}')),
        for (final entry in bundle.cablesByType.entries) ...[
          _CableTypeHeader(label: entry.key),
          for (final h in entry.value)
            _TapElementTile(
              hit: h,
              selected: selected,
              onPick: onPickTapFeature,
              isCable: true,
            ),
        ],
      ],
    );
  }

  List<Widget Function()> _fatInfoSectionBuilders() {
    final ctx = tapContext!;
    final sections = <Widget Function()>[() => _fatHeaderSection(ctx)];

    sections.add(
      () => _InfoSectionCard(
        title: l10n.t('qfield_map_feature_data'),
        icon: Icons.info_outline_rounded,
        children: [
          ...displayPropsForFeature(ctx.selected)
              .entries
              .where(
                (e) =>
                    ctx.selectedHoleId == null ||
                    !isHoleIdPropertyKey(e.key),
              )
              .map(
                (e) => _FeatureDataRow(label: _attributeLabel(e.key), value: '${e.value ?? ''}'),
              ),
          if (ctx.primaryProps.isEmpty)
            Text(
              l10n.t('qfield_layer_no_attributes'),
              style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 12),
            ),
        ],
      ),
    );

    if (ctx.fatSummary.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_fat_site_info'),
          icon: Icons.business_rounded,
          accent: _mint,
          children: ctx.fatSummary.entries
              .map((e) => _FeatureDataRow(label: _attributeLabel(e.key), value: e.value, accent: true))
              .toList(),
        ),
      );
    }

    if (ctx.handholes.isNotEmpty) {
      sections.add(
        () => _SectionLabel(
          icon: Icons.grid_on_rounded,
          title: l10n.t('qfield_map_handholes_for_fat'),
          color: const Color(0xFFE53935),
        ),
      );
      for (final bundle in ctx.handholes) {
        sections.add(() => _handholeBundleCard(bundle));
      }
    }

    if (ctx.excavations.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_excavation_for_fat'),
          icon: Icons.landscape_rounded,
          children: [
            for (final h in ctx.excavations) ...[
              _TapElementTile(hit: h, selected: selected, onPick: onPickTapFeature),
              ...displayPropsForFeature(h.feature).entries.map(
                    (e) => _FeatureDataRow(label: _attributeLabel(e.key), value: '${e.value ?? ''}'),
                  ),
            ],
          ],
        ),
      );
    }

    if (ctx.fatCablesByType.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_cables_at_location'),
          icon: Icons.cable_rounded,
          children: [
            for (final entry in ctx.fatCablesByType.entries) ...[
              _CableTypeHeader(label: entry.key),
              for (final h in entry.value)
                _TapElementTile(
                  hit: h,
                  selected: selected,
                  onPick: onPickTapFeature,
                  isCable: true,
                ),
            ],
          ],
        ),
      );
    }

    if (ctx.otherLayerGroups.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_other_layers_at_location'),
          icon: Icons.more_horiz_rounded,
          children: [
            for (final group in ctx.otherLayerGroups) ...[
              _LayerGroupHeader(group: group),
              for (final h in group.hits)
                _TapElementTile(hit: h, selected: selected, onPick: onPickTapFeature),
            ],
          ],
        ),
      );
    }

    if (canWrite && fieldCtrls.isNotEmpty) {
      sections.add(
        () => _InfoSectionCard(
          title: l10n.t('qfield_map_edit_fields'),
          icon: Icons.edit_rounded,
          children: fieldCtrls.entries
              .map(
                (e) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextField(
                    controller: e.value,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    onChanged: (v) => onFieldChanged(selected!.id, e.key, v),
                    decoration: InputDecoration(
                      labelText: e.key,
                      labelStyle: TextStyle(color: Colors.white.withAlpha(160)),
                      filled: true,
                      fillColor: const Color(0xFF0A0A18),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.white.withAlpha(30)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _accent, width: 1.5),
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      );
    }

    if (canWrite) {
      sections.add(
        () => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
                fillColor: const Color(0xFF0A0A18),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ],
        ),
      );
    }

    return sections;
  }
}

String _tapHeaderSubtitle(AppLocalizations l10n, QFieldTapContext ctx) {
  final sel = ctx.selected;
  final layer = sel.properties['layer']?.toString();
  final parts = <String>[];
  if (ctx.isRouteSelection) {
    return layer?.trim().isNotEmpty == true ? layer! : l10n.t('qfield_map_route_label');
  }
  if (ctx.fatId != null) {
    parts.add('${l10n.t('qfield_map_fat_label')} ${ctx.fatId}');
  }
  if (isHandholeLayerName(layer)) {
    final holeId = holeIdFromProperties(sel.properties);
    if (holeId != null && holeId.isNotEmpty) {
      parts.add('${l10n.t('qfield_map_hole_id')}: $holeId');
    }
    if (handholeContainsClosure(sel.properties)) {
      final closureId = closureOrOdfIdFromProperties(sel.properties);
      if (closureId != null && closureId.isNotEmpty) {
        parts.add('${l10n.t('qfield_map_closure_odf_id')}: $closureId');
      }
    }
  }
  if (parts.isNotEmpty) return parts.join(' · ');
  return featureTapListSubtitle(sel);
}

// ——— Scroll-safe horizontal chips (avoids fighting vertical sheet drag) ———

class _HorizontalChipRow extends StatelessWidget {
  const _HorizontalChipRow({required this.height, required this.children});

  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return SizedBox(height: height);
    return SizedBox(
      height: height,
      child: NotificationListener<ScrollNotification>(
        onNotification: (ScrollNotification n) {
          if (n.metrics.axis == Axis.horizontal) return true;
          return false;
        },
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          physics: const ClampingScrollPhysics(),
          child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              children[i],
            ],
          ],
        ),
        ),
      ),
    );
  }
}

class _PanelDragHandle extends StatelessWidget {
  const _PanelDragHandle();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 6),
      child: Center(
        child: Container(
          width: 44,
          height: 5,
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(90),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
      ),
    );
  }
}

class _MapControlsCard extends StatelessWidget {
  const _MapControlsCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF16162E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(22)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(60),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.icon,
    required this.title,
    required this.color,
  });

  final IconData icon;
  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(
            color: Colors.white.withAlpha(220),
            fontWeight: FontWeight.w700,
            fontSize: 12,
            letterSpacing: 0.2,
          ),
        ),
      ],
    );
  }
}

class _MapFilterChip extends StatelessWidget {
  const _MapFilterChip({
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
    this.compact = false,
  });

  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? color.withAlpha(55) : Colors.white.withAlpha(14),
      borderRadius: BorderRadius.circular(compact ? 10 : 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(compact ? 10 : 12),
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 10 : 12,
            vertical: compact ? 6 : 8,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compact ? 10 : 12),
            border: Border.all(
              color: selected ? color.withAlpha(200) : Colors.white.withAlpha(35),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Icon(Icons.check_rounded, size: 14, color: color),
                ),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : Colors.white.withAlpha(170),
                  fontSize: compact ? 10 : 11,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoSectionCard extends StatelessWidget {
  const _InfoSectionCard({
    required this.title,
    required this.icon,
    required this.children,
    this.accent,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final c = accent ?? const Color(0xFF6C63FF);
    return RepaintBoundary(
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF12122A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.withAlpha(50)),
        ),
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: c.withAlpha(35),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: c),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      color: Colors.white.withAlpha(240),
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ],
        ),
      ),
    );
  }
}

class _CableTypeHeader extends StatelessWidget {
  const _CableTypeHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = cableTypeColorForLabel(label);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 6),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 4,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withAlpha(210),
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _SqlTableTile extends StatelessWidget {
  const _SqlTableTile({
    required this.table,
    required this.l10n,
    required this.onTap,
  });

  final QFieldSqlTableData table;
  final AppLocalizations l10n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final subtitle = table.rows.length < table.rowCount
        ? l10n.t('qfield_sql_rows_shown', {
            'shown': '${table.rows.length}',
            'total': '${table.rowCount}',
          })
        : '${table.rowCount} ${l10n.t('qfield_layer_feature_count')}';

    return Material(
      color: const Color(0xFF1A1A35),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Icon(
                table.hasGeometry ? Icons.polyline_rounded : Icons.table_rows_rounded,
                color: const Color(0xFF38BDF8),
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      table.package.isNotEmpty
                          ? '${table.package} › ${table.name}'
                          : table.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Colors.white38),
            ],
          ),
        ),
      ),
    );
  }
}

// Shared with screen — keep public for screen file widgets

class _PreviewStatsBanner extends StatelessWidget {
  const _PreviewStatsBanner({required this.l10n, required this.stats});

  final AppLocalizations l10n;
  final Map<String, dynamic> stats;

  @override
  Widget build(BuildContext context) {
    final count = (stats['featureCount'] as num?)?.toInt() ?? 0;
    final cap = (stats['featureCap'] as num?)?.toInt() ?? 800;
    final truncated = stats['featuresTruncated'] == true;
    final tables = (stats['dataTableCount'] as num?)?.toInt() ?? 0;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF00D4AA).withAlpha(28),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF00D4AA).withAlpha(80)),
      ),
      child: Row(
        children: [
          Icon(
            truncated ? Icons.warning_amber_rounded : Icons.check_circle_outline_rounded,
            color: truncated ? const Color(0xFFFBBF24) : const Color(0xFF00D4AA),
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              truncated
                  ? l10n.t('qfield_map_preview_truncated', {'count': '$count', 'cap': '$cap'})
                  : l10n.t('qfield_map_preview_features', {'count': '$count'}),
              style: TextStyle(
                color: Colors.white.withAlpha(220),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (tables > 0)
            Text(
              '$tables SQL',
              style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11),
            ),
        ],
      ),
    );
  }
}

class _ArchiveHintText extends StatelessWidget {
  const _ArchiveHintText({required this.hint});

  final String hint;

  @override
  Widget build(BuildContext context) {
    final lines = hint
        .split(RegExp(r'\.\s+(?=[\d"A-Z•])'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (lines.length <= 1) {
      return Text(
        hint,
        style: TextStyle(color: Colors.white.withAlpha(140), fontSize: 11, height: 1.35),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: lines
          .map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ', style: TextStyle(color: Colors.white.withAlpha(120), fontSize: 11)),
                  Expanded(
                    child: Text(
                      line.endsWith('.') ? line : '$line.',
                      style: TextStyle(
                        color: Colors.white.withAlpha(140),
                        fontSize: 11,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

class _SelectedElementHeader extends StatelessWidget {
  const _SelectedElementHeader({
    required this.title,
    required this.subtitle,
    this.icon = Icons.place_rounded,
  });

  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF6C63FF).withAlpha(90),
            const Color(0xFF3D3A8F).withAlpha(120),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF6C63FF).withAlpha(120)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withAlpha(40),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(25),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                ),
              ],
            ),
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
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: isSel ? const Color(0xFF6C63FF).withAlpha(70) : const Color(0xFF1A1A35),
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
                    width: 4,
                    height: 28,
                    decoration: BoxDecoration(
                      color: cableDisplayColor(f),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  )
                else
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: Icon(
                      Icons.place_rounded,
                      color: isSel ? const Color(0xFF00D4AA) : Colors.white54,
                      size: 20,
                    ),
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
                  const Icon(Icons.check_circle_rounded, color: Color(0xFF00D4AA), size: 22),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureDataRow extends StatelessWidget {
  const _FeatureDataRow({
    required this.label,
    required this.value,
    this.accent = false,
  });

  final String label;
  final String value;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent ? const Color(0xFF6C63FF).withAlpha(28) : Colors.white.withAlpha(10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: accent ? const Color(0xFF6C63FF).withAlpha(70) : Colors.white.withAlpha(18),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: TextStyle(
                color: accent ? const Color(0xFF00D4AA) : Colors.white.withAlpha(150),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: Text(
              value.isEmpty ? '—' : value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                height: 1.35,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Snappier vertical scroll inside [DraggableScrollableSheet] info panels.
class QFieldPanelScrollPhysics extends ScrollPhysics {
  const QFieldPanelScrollPhysics({super.parent});

  static const _dragGain = 1.22;
  static const _flingGain = 1.45;

  @override
  QFieldPanelScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return QFieldPanelScrollPhysics(parent: buildParent(ancestor));
  }

  @override
  double applyPhysicsToUserOffset(ScrollMetrics position, double offset) {
    return super.applyPhysicsToUserOffset(position, offset * _dragGain);
  }

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    return super.createBallisticSimulation(position, velocity * _flingGain);
  }
}
