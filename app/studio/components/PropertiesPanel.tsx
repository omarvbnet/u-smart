'use client';

import { useMemo } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { OUTLET_PALETTE, outletsInRoom } from '../lib/engine/outlet-placement';
import { calculateVrfDistribution, vrfAssignmentForRoom, VRF_INDOOR_OPTIONS } from '../lib/engine/vrf-distribution';
import { isResidentialBuilding, bedroomRangeForBuilding } from '../lib/engine/residential-layouts';
import { getCatalogEntry } from '../lib/catalog';
import { controlsForEntry } from '../lib/controls';
import { declarationFor } from '../lib/engine/declarations';
import { specRows, catalogAlternatives } from '../lib/spec-display';
import { physicalSpecFor } from '../lib/catalog/dimensions';
import { CONDUIT_STYLE, type ConduitType } from '../lib/engine/cable-map';
import type { CableSpec } from '../lib/catalog';
import type { SourceSpec } from '../lib/catalog';
import { PORT_COLOR } from './DeviceNode';
import { EntryImage } from './EntryImage';
import { Trash2, Zap, Plug, Copy, BedDouble, DoorOpen, AppWindow, BrickWall } from 'lucide-react';
import { openingOpenPercent } from '../lib/engine/opening-layout';
import { mergeEffectiveWalls, wallLabel, wallLengthM } from '../lib/engine/wall-layout';
import { parseChannelAssignments } from '../lib/engine/smart-channel-layout';
import type { SmartHomeSpec } from '../lib/catalog';
import type { CurtainStyle } from '../lib/model';

export function PropertiesPanel() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  const selectedOpeningId = useStudio((s) => s.selectedOpeningId);
  const selectedWallId = useStudio((s) => s.selectedWallId);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const bim = useStudio((s) => s.bim);
  const opening = useStudio((s) => s.bim?.openings.find((o) => o.id === s.selectedOpeningId));
  const allControls = useStudio((s) => s.controls);
  const room = useStudio((s) => s.rooms.find((r) => r.id === s.selectedRoomId));
  const node = useStudio((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const edges = useStudio((s) => s.edges);
  const updateParam = useStudio((s) => s.updateNodeParam);
  const updateNodeLabel = useStudio((s) => s.updateNodeLabel);
  const replaceNodeCatalog = useStudio((s) => s.replaceNodeCatalog);
  const updateRoom = useStudio((s) => s.updateRoom);
  const removeNode = useStudio((s) => s.removeNode);
  const removeRoom = useStudio((s) => s.removeRoom);
  const rerouteCable = useStudio((s) => s.rerouteCable);
  const setEditingCableRoute = useStudio((s) => s.setEditingCableRoute);
  const editingCableRouteId = useStudio((s) => s.editingCableRouteId);
  const nodes = useStudio((s) => s.nodes);
  const addOutletToRoom = useStudio((s) => s.addOutletToRoom);
  const placeRoomOutlets = useStudio((s) => s.placeRoomOutlets);
  const placeRoomCables = useStudio((s) => s.placeRoomCables);
  const removeOutletsInRoom = useStudio((s) => s.removeOutletsInRoom);
  const assignVrfToRoom = useStudio((s) => s.assignVrfToRoom);
  const setRoomVrfIndoor = useStudio((s) => s.setRoomVrfIndoor);
  const duplicateRoom = useStudio((s) => s.duplicateRoom);
  const addBedroomToLayout = useStudio((s) => s.addBedroomToLayout);
  const project = useStudio((s) => s.project);
  const rooms = useStudio((s) => s.rooms);
  const select = useStudio((s) => s.select);
  const control = useStudio((s) => (s.selectedNodeId ? s.controls[s.selectedNodeId] : undefined));
  const setControl = useStudio((s) => s.setControl);
  const updateOpening = useStudio((s) => s.updateOpening);
  const removeOpening = useStudio((s) => s.removeOpening);
  const setOpeningControl = useStudio((s) => s.setOpeningControl);
  const updateWall = useStudio((s) => s.updateWall);
  const assignOpeningToWall = useStudio((s) => s.assignOpeningToWall);

  const floorWalls = useMemo(
    () => mergeEffectiveWalls(bim, rooms, activeFloorId),
    [bim, rooms, activeFloorId],
  );
  const selectedWall = useMemo(
    () => (selectedWallId ? floorWalls.find((w) => w.id === selectedWallId) : undefined),
    [selectedWallId, floorWalls],
  );

  const vrfReport = useMemo(
    () => calculateVrfDistribution(rooms, project, nodes),
    [rooms, project, nodes],
  );
  const roomVrf = selectedRoomId ? vrfAssignmentForRoom(vrfReport, selectedRoomId) : undefined;

  if (selectedWallId && selectedWall) {
    const input =
      'w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400';
    const lenM = wallLengthM(selectedWall);
    return (
      <div className="flex h-full flex-col p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--studio-text)]">
          <BrickWall className={`h-4 w-4 ${selectedWall.outdoor ? 'text-emerald-400' : 'text-slate-400'}`} />
          {t('wallProperties')}
        </h3>
        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="rounded-lg border border-[var(--studio-border)] px-3 py-2 text-xs">
            <div className="font-semibold text-[var(--studio-text)]">{wallLabel(selectedWall, rooms)}</div>
            {selectedWall.outdoor && (
              <span className="mt-1 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                {t('outdoorWall')}
              </span>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('wallLength')}</span>
            <input
              className={input}
              type="number"
              step={0.1}
              min={0.5}
              value={Number(lenM.toFixed(2))}
              onChange={(e) => updateWall(selectedWall.id, { lengthM: Number(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('wallThickness')}</span>
              <input
                className={input}
                type="number"
                min={2}
                value={Math.round(selectedWall.thickness)}
                onChange={(e) => updateWall(selectedWall.id, { thickness: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('wallHeight')}</span>
              <input
                className={input}
                type="number"
                step={0.1}
                min={2}
                value={selectedWall.heightM ?? 2.8}
                onChange={(e) => updateWall(selectedWall.id, { heightM: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="text-[10px] text-[var(--studio-muted)]">{t('wallEditHint')}</p>
        </div>
      </div>
    );
  }

  if (selectedOpeningId && opening) {
    const input =
      'w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400';
    const openPct = openingOpenPercent(opening, allControls);
    return (
      <div className="flex h-full flex-col p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--studio-text)]">
          {opening.kind === 'door' ? <DoorOpen className="h-4 w-4 text-amber-400" /> : <AppWindow className="h-4 w-4 text-sky-400" />}
          {t('openingProperties')}
        </h3>
        <div className="flex-1 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('openingKind')}</span>
            <select
              className={input}
              value={opening.kind}
              onChange={(e) => updateOpening(opening.id, { kind: e.target.value as 'door' | 'window' })}
            >
              <option value="door">{t('addDoor')}</option>
              <option value="window">{t('addWindow')}</option>
            </select>
          </label>
          {opening.kind === 'window' && (
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('curtainStyle')}</span>
              <select
                className={input}
                value={opening.curtainStyle ?? 'none'}
                onChange={(e) => updateOpening(opening.id, { curtainStyle: e.target.value as CurtainStyle, smartEnabled: e.target.value !== 'none' || opening.smartEnabled })}
              >
                <option value="none">{t('curtainNone')}</option>
                <option value="roll">{t('curtainRoll')}</option>
                <option value="single">{t('curtainSingle')}</option>
                <option value="double">{t('curtainDouble')}</option>
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--studio-muted)]">W</span>
              <input className={input} type="number" value={Math.round(opening.width)} onChange={(e) => updateOpening(opening.id, { width: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--studio-muted)]">H</span>
              <input className={input} type="number" value={Math.round(opening.height)} onChange={(e) => updateOpening(opening.id, { height: Number(e.target.value) })} />
            </label>
          </div>
          {floorWalls.length > 0 && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('mountOnWall')}</span>
                <select
                  className={input}
                  value={opening.wallId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) updateOpening(opening.id, { wallId: undefined, along: undefined });
                    else assignOpeningToWall(opening.id, v, opening.along ?? 0.5);
                  }}
                >
                  <option value="">{t('noWall')}</option>
                  {floorWalls.map((w) => (
                    <option key={w.id} value={w.id}>
                      {wallLabel(w, rooms)}{w.outdoor ? ` (${t('outdoorWall')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {opening.wallId && (
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-[var(--studio-muted)]">
                    <span>{t('positionOnWall')}</span>
                    <span className="font-semibold text-cyan-300">{Math.round((opening.along ?? 0.5) * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={Math.round((opening.along ?? 0.5) * 100)}
                    className="w-full accent-cyan-400"
                    onChange={(e) => assignOpeningToWall(opening.id, opening.wallId!, Number(e.target.value) / 100)}
                  />
                </label>
              )}
              <p className="text-[10px] text-[var(--studio-muted)]">{t('dragOpeningHint')}</p>
            </>
          )}
          <label className="flex items-center justify-between rounded-lg border border-[var(--studio-border)] px-3 py-2">
            <span className="text-xs text-[var(--studio-text)]">{t('smartOpening')}</span>
            <input
              type="checkbox"
              checked={!!opening.smartEnabled}
              onChange={(e) => updateOpening(opening.id, { smartEnabled: e.target.checked })}
            />
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-[var(--studio-muted)]">
              <span>{opening.kind === 'door' ? t('doorOpen') : t('curtainOpen')}</span>
              <span className="font-semibold text-cyan-300">{Math.round(openPct)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={openPct}
              className="w-full accent-cyan-400"
              onChange={(e) => setOpeningControl(opening.id, Number(e.target.value))}
            />
            <div className="mt-2 flex gap-2">
              <button type="button" className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 py-1.5 text-[10px] font-semibold text-emerald-200" onClick={() => setOpeningControl(opening.id, 100)}>
                {t('openActuator')}
              </button>
              <button type="button" className="flex-1 rounded-lg border border-[var(--studio-border)] py-1.5 text-[10px] font-semibold" onClick={() => setOpeningControl(opening.id, 0)}>
                {t('closeActuator')}
              </button>
            </div>
          </div>
          {opening.linkedNodeId && (
            <button type="button" className="text-[10px] text-cyan-400 underline" onClick={() => select(opening.linkedNodeId!)}>
              {t('selectActuator')}
            </button>
          )}
        </div>
        <button onClick={() => removeOpening(opening.id)} className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm text-red-400">
          <Trash2 className="h-4 w-4" /> {t('deleteOpening')}
        </button>
      </div>
    );
  }

  if (selectedRoomId && room) {
    const areaM2 = ((room.width / 50) * (room.height / 50)).toFixed(1);
    const isOutlet = (id: string) => {
      const e = getCatalogEntry(id);
      return e?.category === 'SOCKET' || e?.category === 'APPLIANCE';
    };
    const roomOutlets = outletsInRoom(nodes, room, isOutlet);
    const vrf = roomVrf;
    const canAddBedroom =
      isResidentialBuilding(project.buildingType) &&
      project.bedrooms < bedroomRangeForBuilding(project.buildingType).max;
    const input =
      'w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400';
    const chip =
      'rounded-lg border border-[var(--studio-border)] px-2 py-1 text-[9px] font-semibold text-[var(--studio-muted)] hover:border-cyan-400 hover:text-cyan-300';
    return (
      <div className="flex h-full flex-col p-4">
        <h3 className="mb-3 text-sm font-bold text-[var(--studio-text)]">{t('roomProperties')}</h3>
        <div className="space-y-3 flex-1 overflow-y-auto">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('roomLabel')}</span>
            <input className={input} value={room.label} onChange={(e) => updateRoom(room.id, { label: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('roomZone')}</span>
            <select className={input} value={room.zone} onChange={(e) => updateRoom(room.id, { zone: e.target.value as typeof room.zone })}>
              {['general', 'bedroom', 'kitchen', 'bathroom', 'office', 'corridor', 'mechanical'].map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[var(--studio-border)] p-2">
              <div className="text-[var(--studio-muted)]">W × H</div>
              <div className="font-semibold">{Math.round(room.width)} × {Math.round(room.height)} px</div>
            </div>
            <div className="rounded-lg border border-[var(--studio-border)] p-2">
              <div className="text-[var(--studio-muted)]">{t('roomArea')}</div>
              <div className="font-semibold">{areaM2} m²</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('roomOutlets')}</h4>
              <span className="text-[10px] text-cyan-400">{roomOutlets.length}</span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {OUTLET_PALETTE.map((o) => (
                <button key={o.id} type="button" className={chip} onClick={() => addOutletToRoom(room.id, o.id)}>
                  + {o.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-amber-400/40 bg-amber-500/10 py-2 text-[10px] font-semibold text-amber-200"
                onClick={() => placeRoomOutlets(room.id)}
              >
                {t('autoPlaceOutlets')}
              </button>
              {roomOutlets.length > 0 && (
                <button
                  type="button"
                  className="rounded-lg border border-red-500/30 px-2 py-2 text-[10px] text-red-400"
                  onClick={() => removeOutletsInRoom(room.id)}
                >
                  {t('clearOutlets')}
                </button>
              )}
            </div>
            {roomOutlets.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {roomOutlets.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-[var(--studio-border)] px-2 py-1.5 text-left text-[10px] hover:border-cyan-400"
                      onClick={() => select(n.id)}
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('roomCables')}</h4>
            <button
              type="button"
              className="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/10 py-2 text-[10px] font-semibold text-cyan-200"
              onClick={() => placeRoomCables(room.id)}
            >
              {t('autoPlaceCables')}
            </button>
          </div>

          {(vrfReport.active || vrf) && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">{t('vrfDistribution')}</h4>
                {!vrf && (
                  <button type="button" className={chip} onClick={() => assignVrfToRoom(room.id)}>
                    {t('assignVrf')}
                  </button>
                )}
              </div>
              {vrf ? (
                <div className="space-y-2 text-[10px]">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-[var(--studio-border)] p-2">
                      <div className="text-[var(--studio-muted)]">{t('coolingLoad')}</div>
                      <div className="font-semibold text-sky-200">{vrf.coolingKw} kW · {vrf.btu} BTU</div>
                    </div>
                    <div className="rounded border border-[var(--studio-border)] p-2">
                      <div className="text-[var(--studio-muted)]">{t('heatingLoad')}</div>
                      <div className="font-semibold">{vrf.heatingKw} kW</div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[var(--studio-muted)]">{t('vrfIndoorUnits')}</div>
                    {vrf.indoorUnits.map((u, i) => (
                      <div key={i} className="mb-1 rounded border border-[var(--studio-border)] px-2 py-1">
                        {u.qty}× {u.model} · {u.style} · {u.coolingKw} kW
                      </div>
                    ))}
                    {vrf.nodeIds.length > 0 && (
                      <button
                        type="button"
                        className="mt-1 text-cyan-400 underline"
                        onClick={() => select(vrf.nodeIds[0]!)}
                      >
                        {t('selectOnMap')}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-[var(--studio-border)] p-2">
                      <div className="text-[var(--studio-muted)]">{t('vrfOutdoorUnit')}</div>
                      <div className="font-semibold">{vrf.outdoorLabel}</div>
                      <div className="text-[var(--studio-muted)]">{vrf.outdoorCapacityKw} kW ODU</div>
                    </div>
                    <div className="rounded border border-[var(--studio-border)] p-2">
                      <div className="text-[var(--studio-muted)]">{t('vrfBranch')}</div>
                      <div className="font-semibold">{vrf.branchAddress}</div>
                      <div className="text-[var(--studio-muted)]">{vrf.refrigerantRunM} m {t('refrigerantRun')}</div>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[var(--studio-muted)]">{t('changeIndoorUnit')}</span>
                    <select
                      className={input}
                      value={vrf.indoorUnits[0]?.catalogId ?? ''}
                      onChange={(e) => setRoomVrfIndoor(room.id, e.target.value)}
                    >
                      {VRF_INDOOR_OPTIONS.map((id) => {
                        const e = getCatalogEntry(id);
                        return (
                          <option key={id} value={id}>
                            {e?.model} · {(e as { coolingKw?: number })?.coolingKw} kW
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--studio-muted)]">{t('vrfNotAssigned')}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => duplicateRoom(room.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--studio-border)] py-2 text-[10px] font-semibold text-[var(--studio-text)] hover:border-cyan-400"
          >
            <Copy className="h-3.5 w-3.5" /> {t('duplicateRoom')}
          </button>
          {canAddBedroom && (
            <button
              type="button"
              onClick={() => addBedroomToLayout(room.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 py-2 text-[10px] font-semibold text-emerald-200"
            >
              <BedDouble className="h-3.5 w-3.5" /> {t('addBedroom')}
            </button>
          )}
        </div>
        <button
          onClick={() => removeRoom(room.id)}
          className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm text-red-400"
        >
          <Trash2 className="h-4 w-4" /> {t('deleteRoom')}
        </button>
      </div>
    );
  }

  if (!selectedId || !node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--studio-muted)]">
        {t('noSelection')}
      </div>
    );
  }

  const entry = getCatalogEntry(node.catalogId);
  if (!entry) return null;

  const declaration = declarationFor(entry);
  const controls = controlsForEntry(entry);
  const alternatives = catalogAlternatives(entry);
  const connected = edges.filter((e) => e.source === node.id || e.target === node.id);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--studio-border)] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
            <EntryImage entry={entry} className="h-11 w-11" />
          </span>
          <div className="min-w-0 flex-1">
            <input
              className="w-full truncate rounded border border-transparent bg-transparent text-sm font-bold text-[var(--studio-text)] outline-none focus:border-cyan-400 px-1"
              value={node.label}
              onChange={(e) => updateNodeLabel(node.id, e.target.value)}
            />
            <div className="truncate text-xs text-[var(--studio-muted)]">{entry.manufacturer} · {entry.model}</div>
          </div>
        </div>
        {declaration && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold tracking-wide text-amber-500">{declaration.text}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {controls.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('controls')}</h3>
            <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] p-3">
              {controls.map((c) => {
                if (c.kind === 'toggle') {
                  const on = (control?.[c.key as 'on'] ?? (c.default as boolean)) === true;
                  return (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-[var(--studio-text)]">{c.label[locale]}</span>
                      <button
                        onClick={() => setControl(node.id, c.key, !on)}
                        className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--studio-border)]'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  );
                }
                if (c.kind === 'trigger') {
                  const active = (control?.[c.key as 'active'] ?? false) === true;
                  return (
                    <button
                      key={c.key}
                      onMouseDown={() => setControl(node.id, c.key, true)}
                      onMouseUp={() => setControl(node.id, c.key, false)}
                      onMouseLeave={() => active && setControl(node.id, c.key, false)}
                      className={`w-full rounded-lg py-2 text-xs font-semibold transition ${active ? 'bg-cyan-500 text-white' : 'bg-[var(--studio-hover)] text-[var(--studio-text)]'}`}
                    >
                      {c.label[locale]}
                    </button>
                  );
                }
                const val = Number(control?.[c.key as 'level' | 'setpoint'] ?? (c.default as number));
                return (
                  <div key={c.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--studio-text)]">{c.label[locale]}</span>
                      <span className="font-semibold text-cyan-400">{val}{c.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      value={val}
                      onChange={(e) => setControl(node.id, c.key, Number(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {entry.domain === 'smarthome' && (entry as SmartHomeSpec).channels > 1 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('channelControl')}</h3>
            <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] p-3">
              {parseChannelAssignments(node).length > 0
                ? parseChannelAssignments(node).map((a) => {
                    const on = control?.channels?.[a.channel - 1] ?? false;
                    return (
                      <div key={a.channel} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-[var(--studio-text)]">
                          {t('channelLabel')}{a.channel} · {a.targetLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setControl(node.id, 'on', !on, a.channel - 1)}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--studio-border)]'}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    );
                  })
                : Array.from({ length: (entry as SmartHomeSpec).channels }, (_, i) => {
                    const on = control?.channels?.[i] ?? false;
                    return (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--studio-text)]">{t('channelLabel')}{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setControl(node.id, 'on', !on, i)}
                          className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--studio-border)]'}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
            </div>
          </div>
        )}

        {entry.domain === 'source' && (entry as SourceSpec).sourceType === 'SOLAR_PV' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('solarCapacity')}</span>
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={Number(node.params.ratedKva ?? node.params.capacityKw ?? (entry as SourceSpec).ratedKva)}
              onChange={(e) => {
                const kw = Number(e.target.value);
                useStudio.setState((s) => ({
                  nodes: s.nodes.map((n) =>
                    n.id === node.id
                      ? { ...n, label: `Solar ${kw} kW`, params: { ...n.params, ratedKva: kw, capacityKw: kw } }
                      : n,
                  ),
                }));
              }}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 text-center text-xs font-semibold text-amber-400">
              {Number(node.params.ratedKva ?? (entry as SourceSpec).ratedKva)} kW
            </div>
          </label>
        )}

        {entry.domain === 'cable' && (
          <>
            {(() => {
              const cableEntry = entry as CableSpec;
              const conduitType =
                (node.params.conduitType as ConduitType | undefined) ??
                (cableEntry.category === 'BUS' ? 'bus' : cableEntry.category === 'DATA' ? 'data' : 'conduit');
              const hint = node.params.cableLabel
                ? String(node.params.cableLabel)
                : `${cableEntry.category}${cableEntry.csaMm2 ? ` · ${cableEntry.csaMm2} mm²` : ''} · ${CONDUIT_STYLE[conduitType]?.label ?? conduitType}`;
              return (
                <p className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-[10px] text-[var(--studio-muted)]">
                  <span className="font-semibold text-[var(--studio-text)]">{t('cableTypeHint')}: </span>
                  {hint}
                </p>
              );
            })()}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('length')}</span>
              <input
                type="number"
                min={1}
                value={Number(node.params.lengthM ?? 20)}
                onChange={(e) => updateParam(node.id, 'lengthM', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('conduitType')}</span>
              <select
                className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)]"
                value={(node.params.conduitType as string) ?? 'conduit'}
                onChange={(e) => updateParam(node.id, 'conduitType', e.target.value)}
              >
                {(Object.keys(CONDUIT_STYLE) as ConduitType[]).map((k) => (
                  <option key={k} value={k}>{CONDUIT_STYLE[k].label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-xs">
              <span className="text-[var(--studio-text)]">{t('showOnMap')}</span>
              <input
                type="checkbox"
                checked={node.params.showOnMap !== false}
                onChange={(e) => updateParam(node.id, 'showOnMap', e.target.checked)}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => rerouteCable(node.id)}
                className="flex-1 rounded-lg border border-amber-400/40 bg-amber-500/10 py-2 text-xs font-semibold text-amber-200"
              >
                {t('rerouteCable')}
              </button>
              <button
                type="button"
                onClick={() => setEditingCableRoute(editingCableRouteId === node.id ? null : node.id)}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                  editingCableRouteId === node.id ? 'bg-cyan-500 text-white' : 'border border-[var(--studio-border)] text-[var(--studio-muted)]'
                }`}
              >
                {t('editRouteOnMap')}
              </button>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">Rotation</span>
              <div className="flex gap-1">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => updateParam(node.id, 'rotation', deg)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition
                      ${Number(node.params.rotation ?? 0) === deg ? 'bg-cyan-500 text-white' : 'bg-[var(--studio-hover)] text-[var(--studio-muted)]'}`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {entry.domain === 'load' && (entry.category === 'SOCKET' || entry.category === 'APPLIANCE') && (
          <label className="flex items-center justify-between rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-xs">
            <span className="text-[var(--studio-text)]">{t('showOnMap')}</span>
            <input
              type="checkbox"
              checked={node.params.showOnMap !== false}
              onChange={(e) => updateParam(node.id, 'showOnMap', e.target.checked)}
            />
          </label>
        )}

        {entry.domain === 'load' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('powerW')}</span>
            <input
              type="number"
              min={1}
              value={Number(node.params.powerW ?? (entry.domain === 'load' ? entry.powerW : 0))}
              onChange={(e) => updateParam(node.id, 'powerW', Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
            />
          </label>
        )}

        {entry.ports.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">
              <Plug className="h-3.5 w-3.5" /> {t('ports')}
            </h3>
            <div className="space-y-1.5">
              {entry.ports.map((p) => {
                const linked = connected.filter((e) =>
                  (e.source === node.id && e.sourceHandle === p.id) || (e.target === node.id && e.targetHandle === p.id),
                );
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2.5 py-1.5 text-[10px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PORT_COLOR[p.kind] }} />
                    <span className="font-semibold text-[var(--studio-text)]">{p.label[locale] ?? p.label.en}</span>
                    <span className="text-[var(--studio-muted)]">({p.kind} · {p.direction})</span>
                    <span className="ms-auto text-cyan-400">{linked.length ? `${linked.length} ${t('connected')}` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {alternatives.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('replaceModel')}</h3>
            <select
              className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-2 text-xs text-[var(--studio-text)]"
              value={entry.id}
              onChange={(e) => replaceNodeCatalog(node.id, e.target.value)}
            >
              <option value={entry.id}>{entry.model}</option>
              {alternatives.map((a) => (
                <option key={a.id} value={a.id}>{a.manufacturer} {a.model}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('properties')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const phys = physicalSpecFor(entry);
              const install = [
                { label: 'W×H×D', value: `${phys.widthMm}×${phys.heightMm}×${phys.depthMm} mm` },
                { label: 'Mount', value: phys.mount },
                { label: 'Clearance', value: `${phys.clearanceFrontMm} mm front` },
                ...(phys.listPriceUsd ? [{ label: 'Est. price', value: `$${phys.listPriceUsd}` }] : []),
              ];
              return [...install, ...specRows(entry)].map((row) => (
              <div key={row.label} className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2.5 py-1.5">
                <div className="text-[10px] text-[var(--studio-muted)]">{row.label}</div>
                <div className="text-xs font-semibold text-[var(--studio-text)]">{row.value}</div>
              </div>
            ));
            })()}
          </div>
        </div>

        {entry.standards.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('standards')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {entry.standards.map((s) => (
                <span key={s} className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--studio-border)] p-3">
        <button
          onClick={() => removeNode(node.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          {t('delete')}
        </button>
      </div>
    </div>
  );
}
