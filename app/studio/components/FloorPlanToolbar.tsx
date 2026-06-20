'use client';

import { useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { Square, MousePointer2, LayoutTemplate, Trash2, Scan, Grid3x3, Maximize2, Focus, TreePine, DoorOpen, AppWindow } from 'lucide-react';

const ROOM_TEMPLATES = [
  { label: 'Living', zone: 'general' as const, w: 280, h: 200 },
  { label: 'Kitchen', zone: 'kitchen' as const, w: 180, h: 140 },
  { label: 'Bedroom', zone: 'bedroom' as const, w: 200, h: 160 },
  { label: 'Bathroom', zone: 'bathroom' as const, w: 120, h: 100 },
  { label: 'Office', zone: 'office' as const, w: 180, h: 150 },
  { label: 'Corridor', zone: 'corridor' as const, w: 320, h: 80 },
];

export function FloorPlanToolbar() {
  const t = useT();
  const tool = useStudio((s) => s.floorPlanTool);
  const map = useStudio((s) => s.map);
  const setTool = useStudio((s) => s.setFloorPlanTool);
  const addRoomTemplate = useStudio((s) => s.addRoomTemplate);
  const seedDefaultRooms = useStudio((s) => s.seedDefaultRooms);
  const detectRoomsFromMap = useStudio((s) => s.detectRoomsFromMap);
  const createMapFromZero = useStudio((s) => s.createMapFromZero);
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  const removeRoom = useStudio((s) => s.removeRoom);
  const rooms = useStudio((s) => s.rooms);
  const nodes = useStudio((s) => s.nodes);
  const experienceMode = useStudio((s) => s.experienceMode);
  const clientMode = experienceMode === 'client';
  const canvasViewMode = useStudio((s) => s.canvasViewMode);
  const setCanvasViewMode = useStudio((s) => s.setCanvasViewMode);
  const bim = useStudio((s) => s.bim);
  const addGarden = useStudio((s) => s.addGarden);
  const addOpening = useStudio((s) => s.addOpening);
  const [detecting, setDetecting] = useState(false);

  const runDetect = async () => {
    setDetecting(true);
    try {
      await detectRoomsFromMap();
    } finally {
      setDetecting(false);
    }
  };

  const btn = (active: boolean) =>
    `flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
      active ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300' : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
    }`;

  return (
    <div className="absolute top-3 z-10 flex flex-wrap items-center gap-1.5 ltr:left-3 rtl:right-3 max-w-[calc(100%-1.5rem)]">
      <div className="flex items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1 backdrop-blur">
        <button className={btn(tool === 'select')} onClick={() => setTool('select')} title={t('toolSelect')}>
          <MousePointer2 className="h-3.5 w-3.5" />
        </button>
        <button className={btn(tool === 'draw-room')} onClick={() => setTool('draw-room')} title={t('toolDrawRoom')}>
          <Square className="h-3.5 w-3.5" />
        </button>
        {!map && (
          <button className={btn(false)} onClick={createMapFromZero} title={t('createMapFromZero')}>
            <Grid3x3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('createMapFromZero')}</span>
          </button>
        )}
        {!clientMode && (
          <button className={btn(false)} onClick={seedDefaultRooms} title={t('toolLayout')}>
            <LayoutTemplate className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('toolLayout')}</span>
          </button>
        )}
        {!clientMode && map?.src && map.mode !== 'blank' && (
          <button className={btn(false)} onClick={() => void runDetect()} disabled={detecting} title={t('detectRooms')}>
            <Scan className={`h-3.5 w-3.5 ${detecting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{t('detectRooms')}</span>
          </button>
        )}
        {bim && bim.walls.length > 0 && (
          <span className="rounded-lg border border-slate-500/40 px-2 py-1 text-[9px] text-[var(--studio-muted)]">
            {bim.walls.length} {t('wallsDetected')}
            {bim.openings.length > 0 && ` · ${bim.openings.length} ${t('openingsDetected')}`}
            {(bim.gardens?.length ?? 0) > 0 && ` · ${bim.gardens!.length} ${t('gardensDetected')}`}
          </span>
        )}
        {!clientMode && (
          <>
            <button className={btn(false)} onClick={() => addGarden()} title={t('addGarden')}>
              <TreePine className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{t('addGarden')}</span>
            </button>
            <button className={btn(false)} onClick={() => addOpening('door')} title={t('addDoor')}>
              <DoorOpen className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('addDoor')}</span>
            </button>
            <button className={btn(false)} onClick={() => addOpening('window')} title={t('addWindow')}>
              <AppWindow className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">{t('addWindow')}</span>
            </button>
          </>
        )}
        {(map || rooms.length > 0 || nodes.length > 0) && (
          <button
            className={btn(canvasViewMode === 'full')}
            onClick={() => setCanvasViewMode(canvasViewMode === 'full' ? 'content' : 'full')}
            title={canvasViewMode === 'full' ? t('viewFocusPlan') : t('viewAllPlan')}
          >
            {canvasViewMode === 'full' ? <Focus className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{canvasViewMode === 'full' ? t('viewFocusPlan') : t('viewAllPlan')}</span>
          </button>
        )}
      </div>

      <div className="hidden lg:flex items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1 backdrop-blur">
        {ROOM_TEMPLATES.map((tm) => (
          <button
            key={tm.label}
            className="rounded-lg px-2 py-1 text-[9px] font-medium text-[var(--studio-muted)] hover:bg-[var(--studio-hover)] hover:text-[var(--studio-text)]"
            onClick={() => addRoomTemplate(tm.label, tm.zone, tm.w, tm.h)}
          >
            + {tm.label}
          </button>
        ))}
      </div>

      {selectedRoomId && (
        <button
          onClick={() => removeRoom(selectedRoomId)}
          className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px] font-semibold text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('deleteRoom')}
        </button>
      )}

      {rooms.length > 0 && (
        <span className="rounded-lg bg-[var(--studio-panel)]/90 px-2 py-1 text-[10px] text-[var(--studio-muted)] backdrop-blur">
          {rooms.length} {t('rooms')}
        </span>
      )}
    </div>
  );
}
