/**
 * Smart home topology — HDL / KNX addressing and bus load.
 */
import { getCatalogEntry } from '../catalog';
import type { SensorSpec, SmartHomeSpec } from '../catalog';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import { resolveNodes } from '../model';
import type { ProjectInfo } from '../project';
import { assignAddresses, busHealth } from './bus';
import type { BusAddress } from './bus';

export const BUS_PSU_MA = 640;

export type SmartDeviceRow = {
  nodeId: string;
  label: string;
  protocol: string;
  deviceClass: string;
  address: string;
  busMa: number;
  model: string;
};

export type BusProtocolLoad = {
  protocol: 'HDL' | 'KNX';
  loadMa: number;
  installedPsuMa: number;
  psuRequired: number;
  deficitMa: number;
  ok: boolean;
};

export type BusPowerStatus = {
  ok: boolean;
  totalLoadMa: number;
  installedPsuMa: number;
  psuRequired: number;
  deficitMa: number;
  segments: BusProtocolLoad[];
};

export type SmartTopologyReport = {
  protocol: string;
  devices: SmartDeviceRow[];
  totalBusMa: number;
  psuRequired: number;
  installedPsuMa: number;
  psuDeficitMa: number;
  busPowerOk: boolean;
  busPower: BusPowerStatus;
  gateways: number;
  actuators: number;
  sensors: number;
  panels: number;
  health: ReturnType<typeof busHealth>;
  assumptions: string[];
};

function formatAddress(addr: BusAddress | undefined): string {
  if (!addr) return '—';
  if (addr.protocol === 'KNX') return addr.group;
  return addr.device;
}

export function isBusPsuSpec(spec: SmartHomeSpec): boolean {
  return spec.deviceClass.toLowerCase().includes('bus psu');
}

export function psuSupplyMa(spec: SmartHomeSpec): number {
  if (isBusPsuSpec(spec)) return spec.busSupplyMa ?? BUS_PSU_MA;
  return 0;
}

function protocolsForProject(project: ProjectInfo): ('HDL' | 'KNX')[] {
  if (project.smartProtocol === 'BOTH') return ['HDL', 'KNX'];
  if (project.smartProtocol === 'HDL') return ['HDL'];
  return ['KNX'];
}

export function busPowerStatus(project: ProjectInfo, nodes: DesignNode[]): BusPowerStatus {
  if (!project.smartBuilding) {
    return { ok: true, totalLoadMa: 0, installedPsuMa: 0, psuRequired: 0, deficitMa: 0, segments: [] };
  }

  const segments: BusProtocolLoad[] = protocolsForProject(project).map((protocol) => {
    let loadMa = 0;
    let installedPsuMa = 0;
    for (const n of nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'smarthome') {
        const spec = e as SmartHomeSpec;
        if (spec.protocol !== protocol) continue;
        if (isBusPsuSpec(spec)) installedPsuMa += psuSupplyMa(spec);
        else loadMa += spec.busCurrentMa;
      } else if (e?.domain === 'sensor') {
        const spec = e as SensorSpec;
        if (spec.protocol !== protocol) continue;
        loadMa += spec.currentMa;
      }
    }
    const psuRequired = loadMa > 0 ? Math.max(1, Math.ceil(loadMa / BUS_PSU_MA)) : 0;
    const deficitMa = Math.max(0, loadMa - installedPsuMa);
    return {
      protocol,
      loadMa,
      installedPsuMa,
      psuRequired,
      deficitMa,
      ok: loadMa === 0 || installedPsuMa >= loadMa,
    };
  });

  const totalLoadMa = segments.reduce((s, x) => s + x.loadMa, 0);
  const installedPsuMa = segments.reduce((s, x) => s + x.installedPsuMa, 0);
  const psuRequired = segments.reduce((s, x) => s + x.psuRequired, 0);
  const deficitMa = segments.reduce((s, x) => s + x.deficitMa, 0);

  return {
    ok: segments.every((x) => x.ok),
    totalLoadMa,
    installedPsuMa,
    psuRequired,
    deficitMa,
    segments,
  };
}

export function isBusPowerAdequate(project: ProjectInfo, nodes: DesignNode[]): boolean {
  return busPowerStatus(project, nodes).ok;
}

export function buildSmartTopology(
  project: ProjectInfo,
  nodes: DesignNode[],
  _edges: DesignEdge[],
  rooms: DesignRoom[],
): SmartTopologyReport {
  if (!project.smartBuilding) {
    return {
      protocol: 'None',
      devices: [],
      totalBusMa: 0,
      psuRequired: 0,
      installedPsuMa: 0,
      psuDeficitMa: 0,
      busPowerOk: true,
      busPower: busPowerStatus(project, nodes),
      gateways: 0,
      actuators: 0,
      sensors: 0,
      panels: 0,
      health: busHealth(project, []),
      assumptions: ['Smart building disabled.'],
    };
  }

  const resolved = resolveNodes(nodes, getCatalogEntry);
  const smartNodes = resolved.filter((n) => n.spec.domain === 'smarthome' || n.spec.domain === 'sensor');
  const addresses = assignAddresses(nodes);
  const busPower = busPowerStatus(project, nodes);

  const devices: SmartDeviceRow[] = smartNodes.map((n) => {
    if (n.spec.domain === 'smarthome') {
      const spec = n.spec as SmartHomeSpec;
      return {
        nodeId: n.id,
        label: n.label,
        protocol: spec.protocol,
        deviceClass: spec.deviceClass,
        address: formatAddress(addresses.get(n.id)!),
        busMa: isBusPsuSpec(spec) ? 0 : spec.busCurrentMa,
        model: spec.model,
      };
    }
    const spec = n.spec as SensorSpec;
    return {
      nodeId: n.id,
      label: n.label,
      protocol: spec.protocol,
      deviceClass: spec.sensorType,
      address: formatAddress(addresses.get(n.id)!),
      busMa: spec.currentMa,
      model: spec.model,
    };
  });

  let actuators = 0;
  let sensors = 0;
  let panels = 0;
  let gateways = 0;
  for (const n of smartNodes) {
    if (n.spec.domain === 'sensor') sensors++;
    else {
      const spec = n.spec as SmartHomeSpec;
      const dc = spec.deviceClass.toLowerCase();
      if (isBusPsuSpec(spec)) continue;
      if (dc.includes('gateway') || dc.includes('router')) gateways++;
      else if (dc.includes('panel') || dc.includes('touch')) panels++;
      else if (spec.channelCurrentA != null) actuators++;
    }
  }

  const totalBusMa = devices.reduce((s, d) => s + d.busMa, 0);

  return {
    protocol: project.smartProtocol ?? 'KNX',
    devices,
    totalBusMa,
    psuRequired: busPower.psuRequired,
    installedPsuMa: busPower.installedPsuMa,
    psuDeficitMa: busPower.deficitMa,
    busPowerOk: busPower.ok,
    busPower,
    gateways,
    actuators,
    sensors,
    panels,
    health: busHealth(project, nodes),
    assumptions: [
      `${BUS_PSU_MA} mA bus PSU per segment (HDL BusPro / KNX).`,
      busPower.ok
        ? `${busPower.installedPsuMa} mA PSU installed for ${totalBusMa} mA load.`
        : `Missing ${busPower.deficitMa} mA bus PSU — add Bus PSU modules before control.`,
      devices.length === 0
        ? `Estimate: ${rooms.length} rooms — place gateway, Bus PSU, and actuators.`
        : `${devices.length} devices on bus.`,
    ],
  };
}
