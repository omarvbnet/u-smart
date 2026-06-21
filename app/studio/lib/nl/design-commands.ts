/**
 * Natural-language design adjustments — maps utterances to store mutations.
 */
import { CATALOG, getCatalogEntry } from '../catalog';
import type { DesignRoom } from '../model';
import type { StudioLocale } from '../i18n';

export type CommandResult = { ok: boolean; message: string; changes: number };

type StoreApi = {
  getState: () => {
    nodes: { id: string; catalogId: string; label: string; x: number; y: number; params: Record<string, unknown> }[];
    rooms: DesignRoom[];
    locale: StudioLocale;
    project: { smartProtocol?: string | null };
  };
  addNodeFromCatalog: (catalogId: string, x: number, y: number) => void;
  replaceNodeCatalog: (id: string, catalogId: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  updateProject: (patch: { smartProtocol?: 'HDL' | 'KNX' | 'BOTH' }) => void;
  setControl: (id: string, key: 'on' | 'level' | 'setpoint' | 'active', value: boolean | number) => void;
  applyFix: (fix: import('../engine/validation').Fix) => void;
  applyAllFixes: (fixes: import('../engine/validation').Fix[]) => boolean;
  getIssues: () => import('../engine/validation').Issue[];
  placeEngineeringLayout: () => { ok: boolean; message: string; changes: number };
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function roomsMatching(rooms: DesignRoom[], hint: string): DesignRoom[] {
  const h = norm(hint);
  return rooms.filter((r) => norm(r.label).includes(h) || norm(r.zone).includes(h));
}

function centerOf(room: DesignRoom): { x: number; y: number } {
  return { x: room.x + room.width / 2 - 22, y: room.y + room.height / 2 - 22 };
}

const HDL_TO_KNX: Record<string, string> = {
  'hdl-relay': 'knx-actuator',
  'hdl-dimmer': 'knx-dimmer',
  'hdl-curtain': 'knx-actuator',
  'hdl-touchscreen': 'knx-touch',
  'hdl-gateway': 'knx-gateway',
  'hdl-input': 'knx-input',
  'hdl-dlp': 'knx-touch',
  'hdl-scene': 'knx-touch',
};

export function executeDesignCommand(text: string, store: StoreApi): CommandResult {
  const q = norm(text);
  if (!q) return { ok: false, message: 'Empty command', changes: 0 };

  const s = store.getState();
  let changes = 0;

  // Add N outdoor cameras
  const camMatch = q.match(/add\s+(\d+|two|three|four)\s+(outdoor\s+)?cameras?/);
  if (camMatch) {
    const n = parseCount(camMatch[1] ?? '1');
    const catalogId = 'knx-presence'; // closest presence/sensor; camera SKU can be added later
    for (let i = 0; i < n; i++) {
      store.addNodeFromCatalog(catalogId, 120 + i * 48, -200);
      changes++;
    }
    return { ok: true, message: `Added ${n} sensor/camera device(s) to the plan.`, changes };
  }

  // Move distribution board to garage / room
  const moveDb = q.match(/move\s+(the\s+)?(distribution\s+board|main\s+db|panel)\s+to\s+(the\s+)?(.+)/);
  if (moveDb) {
    const target = moveDb[4] ?? '';
    const rooms = roomsMatching(s.rooms, target);
    const db = s.nodes.find((n) => {
      const e = getCatalogEntry(n.catalogId);
      return e?.domain === 'load' && e.category === 'PANEL' || n.label.toLowerCase().includes('db') || n.label.toLowerCase().includes('panel');
    }) ?? s.nodes.find((n) => getCatalogEntry(n.catalogId)?.domain === 'protection');
    if (!db) return { ok: false, message: 'No distribution board found on the plan.', changes: 0 };
    const room = rooms[0] ?? s.rooms[0];
    if (!room) return { ok: false, message: 'No matching room found.', changes: 0 };
    const pos = centerOf(room);
    store.moveNode(db.id, pos.x, pos.y);
    return { ok: true, message: `Moved ${db.label} to ${room.label}.`, changes: 1 };
  }

  // Replace bedroom switches with touch panels
  if (q.includes('touch panel') && (q.includes('switch') || q.includes('replace'))) {
    const zone = q.includes('bedroom') ? 'bedroom' : q.includes('living') ? 'general' : '';
    const rooms = zone ? roomsMatching(s.rooms, zone) : s.rooms;
    const touchId = CATALOG.find((e) => e.domain === 'smarthome' && e.deviceClass.toLowerCase().includes('touch'))?.id ?? 'knx-touch';
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (!e) continue;
      const inRoom = rooms.some((r) => n.x >= r.x && n.x <= r.x + r.width && n.y >= r.y && n.y <= r.y + r.height);
      if (!inRoom && rooms.length) continue;
      if (e.domain === 'smarthome' && (e.deviceClass.toLowerCase().includes('input') || e.deviceClass.toLowerCase().includes('switch'))) {
        store.replaceNodeCatalog(n.id, touchId);
        changes++;
      }
    }
    return changes
      ? { ok: true, message: `Replaced ${changes} device(s) with touch panels.`, changes }
      : { ok: false, message: 'No matching switches found in the selected zone.', changes: 0 };
  }

  // Change living room lighting to linear
  if (q.includes('linear') && q.includes('light')) {
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'load' && e.category === 'LIGHTING') {
        store.replaceNodeCatalog(n.id, 'load-lighting');
        changes++;
      }
    }
    return { ok: true, message: `Updated ${changes} lighting circuit(s).`, changes };
  }

  // Replace Buspro/HDL with KNX
  if ((q.includes('buspro') || q.includes('hdl')) && q.includes('knx')) {
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain !== 'smarthome' || e.protocol !== 'HDL') continue;
      const knxId = HDL_TO_KNX[e.id] ?? 'knx-gateway';
      if (getCatalogEntry(knxId)) {
        store.replaceNodeCatalog(n.id, knxId);
        changes++;
      }
    }
    store.updateProject({ smartProtocol: 'KNX' });
    return { ok: true, message: `Migrated ${changes} HDL device(s) to KNX equivalents.`, changes };
  }

  // Scene shortcuts
  if (q.includes('all lights on') || q.includes('turn on all lights') || q.includes('شغّل') && q.includes('إضاء')) {
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'load' && e.category === 'LIGHTING') {
        store.setControl(n.id, 'on', true);
        store.setControl(n.id, 'level', 100);
        changes++;
      }
    }
    return { ok: true, message: `Turned on ${changes} lighting load(s).`, changes };
  }

  if (q.includes('all lights off') || q.includes('good night')) {
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'load' && e.category === 'LIGHTING') {
        store.setControl(n.id, 'on', false);
        changes++;
      }
    }
    return { ok: true, message: `Turned off ${changes} lighting load(s).`, changes };
  }

  if (q.includes('fix all') || q.includes('auto fix') || q.includes('fix everything')) {
    const fixes = store.getIssues().filter((i) => i.fix).map((i) => i.fix!);
    store.applyAllFixes(fixes);
    return { ok: true, message: `Applied ${fixes.length} automatic correction(s).`, changes: fixes.length };
  }

  if (q.includes('place fixtures') || q.includes('lighting layout') || q.includes('auto place lights')) {
    const r = store.placeEngineeringLayout();
    return { ok: r.ok, message: r.message, changes: r.changes };
  }

  if (q.includes('start simulation') || q.includes('run simulation')) {
    return { ok: true, message: 'Use the simulation play button in the toolbar to start the digital twin stream.', changes: 0 };
  }

  if (q.includes('reduce cost') || q.match(/cost.*(\d+)%/)) {
    const pct = Number(q.match(/(\d+)%/)?.[1] ?? 15);
    let saved = 0;
    for (const n of s.nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'load' && e.category === 'LIGHTING') {
        store.setControl(n.id, 'level', Math.max(50, 100 - pct));
        saved++;
      }
    }
    return { ok: true, message: `Reduced lighting levels by ~${pct}% on ${saved} circuit(s).`, changes: saved };
  }

  return {
    ok: false,
    message: 'Command not recognized. Try: "Fix all", "Place fixtures", "Add two outdoor cameras", "Move distribution board to garage", "Replace HDL with KNX", "All lights on".',
    changes: 0,
  };
}

function parseCount(w: string): number {
  const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  return map[w] ?? (Number(w) || 1);
}

export const COMMAND_EXAMPLES = [
  'Design a smart villa with 5 bedrooms, VRF HVAC, KNX, solar and batteries, 450 m²',
  'Fix all validation issues',
  'Place fixtures from lighting design',
  'Add two outdoor cameras',
  'Move distribution board to garage',
  'Replace Buspro with KNX',
  'Reduce project cost by 15%',
  'All lights on',
];
