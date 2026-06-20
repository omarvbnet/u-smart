/**
 * HDL Buspro automation — scenes per HDL specification (curtain, door, garden, lighting).
 */
import { getCatalogEntry } from '../catalog';
import type { LoadSpec, SmartHomeSpec } from '../catalog';
import type { DesignNode } from '../model';
import type { ControlState } from '../controls';

export type HdlSceneId =
  | 'allLightsOn'
  | 'allLightsOff'
  | 'openCurtains'
  | 'closeCurtains'
  | 'openDoors'
  | 'closeDoors'
  | 'gardenLights'
  | 'goodNight';

export type HdlSceneAction = {
  filter: (entry: ReturnType<typeof getCatalogEntry>) => boolean;
  control: keyof ControlState;
  value: boolean | number;
  hdlSceneCode: string;
};

export const HDL_SCENES: Record<HdlSceneId, { label: string; actions: HdlSceneAction[] }> = {
  allLightsOn: {
    label: 'All lights ON',
    actions: [
      {
        filter: (e) => e?.domain === 'load' && e.category === 'LIGHTING',
        control: 'on',
        value: true,
        hdlSceneCode: 'S1',
      },
      {
        filter: (e) => e?.domain === 'load' && e.category === 'LIGHTING',
        control: 'level',
        value: 100,
        hdlSceneCode: 'S1',
      },
    ],
  },
  allLightsOff: {
    label: 'All lights OFF',
    actions: [
      {
        filter: (e) => e?.domain === 'load' && e.category === 'LIGHTING',
        control: 'on',
        value: false,
        hdlSceneCode: 'S2',
      },
    ],
  },
  openCurtains: {
    label: 'Open curtains',
    actions: [
      {
        filter: (e) =>
          e?.domain === 'smarthome' &&
          (e as SmartHomeSpec).protocol === 'HDL' &&
          e.deviceClass.toLowerCase().includes('curtain'),
        control: 'level',
        value: 100,
        hdlSceneCode: 'S3',
      },
    ],
  },
  closeCurtains: {
    label: 'Close curtains',
    actions: [
      {
        filter: (e) =>
          e?.domain === 'smarthome' &&
          (e as SmartHomeSpec).protocol === 'HDL' &&
          e.deviceClass.toLowerCase().includes('curtain'),
        control: 'level',
        value: 0,
        hdlSceneCode: 'S4',
      },
    ],
  },
  openDoors: {
    label: 'Open doors / gate',
    actions: [
      {
        filter: (e) =>
          e?.domain === 'smarthome' &&
          (e as SmartHomeSpec).protocol === 'HDL' &&
          (e.deviceClass.toLowerCase().includes('dry') || e.deviceClass.toLowerCase().includes('relay')),
        control: 'on',
        value: true,
        hdlSceneCode: 'S5',
      },
    ],
  },
  closeDoors: {
    label: 'Close doors / gate',
    actions: [
      {
        filter: (e) =>
          e?.domain === 'smarthome' &&
          (e as SmartHomeSpec).protocol === 'HDL' &&
          (e.deviceClass.toLowerCase().includes('dry') || e.deviceClass.toLowerCase().includes('relay')),
        control: 'on',
        value: false,
        hdlSceneCode: 'S6',
      },
    ],
  },
  gardenLights: {
    label: 'Garden lights',
    actions: [
      {
        filter: (e) => e?.domain === 'load' && e.category === 'LIGHTING' && e.id.includes('garden'),
        control: 'on',
        value: true,
        hdlSceneCode: 'S7',
      },
      {
        filter: (e) =>
          e?.domain === 'load' &&
          e.category === 'LIGHTING' &&
          (e as LoadSpec).lightingType === 'SPOT',
        control: 'on',
        value: true,
        hdlSceneCode: 'S7',
      },
    ],
  },
  goodNight: {
    label: 'Good night',
    actions: [
      {
        filter: (e) => e?.domain === 'load' && e.category === 'LIGHTING',
        control: 'on',
        value: false,
        hdlSceneCode: 'S8',
      },
      {
        filter: (e) =>
          e?.domain === 'smarthome' &&
          e.deviceClass.toLowerCase().includes('curtain'),
        control: 'level',
        value: 0,
        hdlSceneCode: 'S8',
      },
      { filter: (e) => e?.domain === 'hvac', control: 'on', value: false, hdlSceneCode: 'S8' },
    ],
  },
};

export function applyHdlScene(
  sceneId: HdlSceneId,
  nodes: DesignNode[],
  setControl: (id: string, key: keyof ControlState, value: boolean | number) => void,
): number {
  const scene = HDL_SCENES[sceneId];
  let changes = 0;
  for (const n of nodes) {
    const entry = getCatalogEntry(n.catalogId);
    for (const action of scene.actions) {
      if (!entry || !action.filter(entry)) continue;
      setControl(n.id, action.control, action.value);
      changes++;
      break;
    }
  }
  return changes;
}

export function validateHdlTopology(nodes: DesignNode[]): string[] {
  const warnings: string[] = [];
  const hdl = nodes.filter((n) => {
    const e = getCatalogEntry(n.catalogId);
    return e?.domain === 'smarthome' && (e as SmartHomeSpec).protocol === 'HDL';
  });
  const curtains = hdl.filter((n) => (getCatalogEntry(n.catalogId) as SmartHomeSpec | undefined)?.deviceClass.toLowerCase().includes('curtain'));
  const relays = hdl.filter((n) => {
    const dc = (getCatalogEntry(n.catalogId) as SmartHomeSpec | undefined)?.deviceClass.toLowerCase() ?? '';
    return dc.includes('relay') || dc.includes('dry');
  });
  if (curtains.length && !relays.some((r) => nodes.some((n) => Math.hypot(n.x - r.x, n.y - r.y) < 120))) {
    warnings.push('HDL: curtain modules should share a bus segment with a logic module or gateway.');
  }
  if (hdl.length > 64) warnings.push('HDL: subnet 1.1 exceeds 64 devices — add IP router for subnet expansion.');
  return warnings;
}
