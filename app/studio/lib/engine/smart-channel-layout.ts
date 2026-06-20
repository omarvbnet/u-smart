/**
 * HDL / KNX actuator modules — channel planning, placement, and per-device alignment.
 */
import { getCatalogEntry, type SmartHomeSpec } from '../catalog';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { ProjectInfo, SmartChannelCounts, SmartProtocol } from '../project';
import type { StudioLocale } from '../i18n';
import type { ControlState } from '../controls';
import { defaultControlState } from '../controls';

export type ChannelAssignment = {
  channel: number;
  targetId: string;
  targetLabel: string;
  controlType: 'relay' | 'dimmer' | 'curtain' | 'dryContact';
};

type ActuatorKind = keyof SmartChannelCounts;

const HDL_MODULES: Record<ActuatorKind, { catalogId: string; channelsPerModule: number }> = {
  relay: { catalogId: 'hdl-relay', channelsPerModule: 12 },
  dimmer: { catalogId: 'hdl-dimmer', channelsPerModule: 6 },
  curtain: { catalogId: 'hdl-curtain', channelsPerModule: 4 },
  dryContact: { catalogId: 'hdl-drycontact', channelsPerModule: 8 },
};

const KNX_MODULES: Record<ActuatorKind, { catalogId: string; channelsPerModule: number }> = {
  relay: { catalogId: 'knx-actuator', channelsPerModule: 8 },
  dimmer: { catalogId: 'knx-dimmer', channelsPerModule: 4 },
  curtain: { catalogId: 'knx-actuator', channelsPerModule: 8 },
  dryContact: { catalogId: 'knx-actuator', channelsPerModule: 8 },
};

function modulesForProtocol(protocol: SmartProtocol): typeof HDL_MODULES {
  return protocol === 'KNX' ? KNX_MODULES : HDL_MODULES;
}

function protos(project: ProjectInfo): SmartProtocol[] {
  if (!project.smartProtocol) return ['HDL'];
  return project.smartProtocol === 'BOTH' ? ['HDL', 'KNX'] : [project.smartProtocol];
}

function nodeInRoom(n: DesignNode, room: DesignRoom): boolean {
  if (n.params.roomId === room.id) return true;
  const cx = n.x + 21;
  const cy = n.y + 21;
  return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
}

export function collectChannelTargets(nodes: DesignNode[], rooms: DesignRoom[]): {
  relay: DesignNode[];
  dimmer: DesignNode[];
  curtain: DesignNode[];
  dryContact: DesignNode[];
} {
  const relay: DesignNode[] = [];
  const dimmer: DesignNode[] = [];
  const curtain: DesignNode[] = [];
  const dryContact: DesignNode[] = [];

  for (const n of nodes) {
    const e = getCatalogEntry(n.catalogId);
    if (!e) continue;
    if (e.domain === 'smarthome') continue;
    if (n.params.openingId) {
      const openingId = String(n.params.openingId);
      if (openingId.startsWith('win_')) curtain.push(n);
      else if (openingId.startsWith('door_')) dryContact.push(n);
      continue;
    }
    if (e.domain === 'load') {
      if (e.category === 'LIGHTING' || String(n.params.lightingType ?? '').length > 0) dimmer.push(n);
      else relay.push(n);
    } else if (e.category === 'SOCKET' || e.category === 'APPLIANCE') {
      relay.push(n);
    } else if (e.domain === 'hvac') {
      relay.push(n);
    }
  }

  if (!dimmer.length && !relay.length) {
    for (const room of rooms) {
      const loads = nodes.filter(
        (n) =>
          getCatalogEntry(n.catalogId)?.domain === 'load' &&
          nodeInRoom(n, room) &&
          !n.id.startsWith('mcb_'),
      );
      loads.forEach((l, i) => (i % 2 === 0 ? dimmer : relay).push(l));
    }
  }

  return { relay, dimmer, curtain, dryContact };
}

function modulesNeeded(totalChannels: number, perModule: number): number {
  if (totalChannels <= 0) return 0;
  return Math.ceil(totalChannels / perModule);
}

function assignChannels(
  targets: DesignNode[],
  channelCount: number,
  controlType: ChannelAssignment['controlType'],
): ChannelAssignment[] {
  const out: ChannelAssignment[] = [];
  for (let i = 0; i < channelCount; i++) {
    const target = targets[i];
    if (!target) break;
    out.push({
      channel: (i % targets.length) + 1,
      targetId: target.id,
      targetLabel: target.label,
      controlType,
    });
  }
  return out;
}

function placeModulesForKind(
  protocol: SmartProtocol,
  kind: ActuatorKind,
  channelCount: number,
  targets: DesignNode[],
  align: boolean,
  baseX: number,
  baseY: number,
  moduleIndexStart: number,
  locale: StudioLocale,
): { nodes: DesignNode[]; moduleIndex: number } {
  const mod = modulesForProtocol(protocol)[kind];
  const entry = getCatalogEntry(mod.catalogId) as SmartHomeSpec | undefined;
  if (!entry || channelCount <= 0) return { nodes: [], moduleIndex: moduleIndexStart };

  const count = modulesNeeded(channelCount, mod.channelsPerModule);
  const nodes: DesignNode[] = [];
  let moduleIndex = moduleIndexStart;

  for (let m = 0; m < count; m++) {
    const id = `smart_${protocol.toLowerCase()}_${kind}_${moduleIndex}`;
    const chStart = m * mod.channelsPerModule;
    const chEnd = Math.min(channelCount, chStart + mod.channelsPerModule);
    const slice = align ? targets.slice(chStart, chEnd) : [];
    const assignments: ChannelAssignment[] = align
      ? slice.map((t, i) => ({
          channel: i + 1,
          targetId: t.id,
          targetLabel: t.label,
          controlType: kind === 'dryContact' ? 'dryContact' : kind === 'curtain' ? 'curtain' : kind === 'dimmer' ? 'dimmer' : 'relay',
        }))
      : [];

    nodes.push({
      id,
      catalogId: mod.catalogId,
      label: `${entry.name[locale] ?? entry.name.en} ${moduleIndex + 1}`,
      x: baseX + (moduleIndex % 3) * 52,
      y: baseY + Math.floor(moduleIndex / 3) * 48,
      params: {
        showOnMap: true,
        moduleKind: kind,
        moduleIndex,
        channelAssignments: JSON.stringify(assignments),
      },
    });
    moduleIndex++;
  }

  return { nodes, moduleIndex };
}

export function placeSmartChannelSystem(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
  locale: StudioLocale,
): { nodes: DesignNode[]; edges: DesignEdge[]; controls: Record<string, ControlState> } {
  if (!project.smartBuilding || !project.smartProtocol) {
    return { nodes, edges, controls: {} };
  }

  const targets = collectChannelTargets(nodes, rooms);
  const plan = project.smartChannels;
  const align = project.smartAlignChannels;

  const anchor = rooms.find((r) => r.zone === 'mechanical') ?? rooms[0];
  const baseX = anchor ? anchor.x + 12 : 80;
  const baseY = anchor ? anchor.y + anchor.height + 24 : 560;

  let nextNodes = nodes.filter((n) => !n.id.startsWith('smart_hdl_') && !n.id.startsWith('smart_knx_'));
  let nextEdges = [...edges];
  const controls: Record<string, ControlState> = {};
  let moduleIdx = 0;

  for (const protocol of protos(project)) {
    const kinds: ActuatorKind[] = ['relay', 'dimmer', 'curtain', 'dryContact'];
    for (const kind of kinds) {
      const channelCount = plan[kind];
      const targetList = targets[kind];
      const { nodes: placed, moduleIndex } = placeModulesForKind(
        protocol,
        kind,
        channelCount,
        targetList,
        align,
        baseX,
        baseY + (protocol === 'KNX' ? 120 : 0),
        moduleIdx,
        locale,
      );
      nextNodes = [...nextNodes, ...placed];
      moduleIdx = moduleIndex;

      for (const act of placed) {
        const entry = getCatalogEntry(act.catalogId);
        if (entry) {
          const spec = entry as SmartHomeSpec;
          controls[act.id] = {
            ...defaultControlState(entry),
            channels: Array(spec.channels).fill(false),
          };
        }
        const gw = nextNodes.find((n) => n.id === `gw_${protocol}`);
        if (gw) {
          nextEdges.push({
            id: `e_${gw.id}_${act.id}`,
            source: gw.id,
            sourceHandle: 'bus',
            target: act.id,
            targetHandle: 'bus',
          });
        }
      }
    }
  }

  if (align) {
    nextNodes = nextNodes.map((n) => {
      const raw = n.params.channelAssignments;
      if (typeof raw !== 'string') return n;
      try {
        const assignments = JSON.parse(raw) as ChannelAssignment[];
        const mine = assignments.find((a) => a.targetId === n.id);
        if (mine) return { ...n, params: { ...n.params, smartChannel: mine.channel, smartActuatorKind: mine.controlType } };
      } catch {
        /* ignore */
      }
      return n;
    });
  }

  return { nodes: nextNodes, edges: nextEdges, controls };
}

export function parseChannelAssignments(node: DesignNode): ChannelAssignment[] {
  const raw = node.params.channelAssignments;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as ChannelAssignment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
