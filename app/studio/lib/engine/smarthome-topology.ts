/**
 * Smart home topology — HDL / KNX addressing and bus load.
 */
import { getCatalogEntry } from '../catalog';
import type { SensorSpec, SmartHomeSpec } from '../catalog';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import { resolveNodes } from '../model';
import type { ProjectInfo } from '../project';
import { assignAddresses, busHealth } from './bus';

export type SmartDeviceRow = {
  nodeId: string;
  label: string;
  protocol: string;
  deviceClass: string;
  address: string;
  busMa: number;
  model: string;
};

export type SmartTopologyReport = {
  protocol: string;
  devices: SmartDeviceRow[];
  totalBusMa: number;
  psuRequired: number;
  gateways: number;
  actuators: number;
  sensors: number;
  panels: number;
  health: ReturnType<typeof busHealth>;
  assumptions: string[];
};

import type { BusAddress } from './bus';

function formatAddress(addr: BusAddress | undefined): string {
  if (!addr) return '—';
  if (addr.protocol === 'KNX') return addr.group;
  return addr.device;
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
      gateways: 0,
      actuators: 0,
      sensors: 0,
      panels: 0,
      health: busHealth([]),
      assumptions: ['Smart building disabled.'],
    };
  }

  const resolved = resolveNodes(nodes, getCatalogEntry);
  const smartNodes = resolved.filter((n) => n.spec.domain === 'smarthome' || n.spec.domain === 'sensor');
  const addresses = assignAddresses(nodes);

  const devices: SmartDeviceRow[] = smartNodes.map((n) => {
    if (n.spec.domain === 'smarthome') {
      const spec = n.spec as SmartHomeSpec;
      return {
        nodeId: n.id,
        label: n.label,
        protocol: spec.protocol,
        deviceClass: spec.deviceClass,
        address: formatAddress(addresses.get(n.id)!),
        busMa: spec.busCurrentMa,
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
      if (dc.includes('gateway') || dc.includes('router')) gateways++;
      else if (dc.includes('panel') || dc.includes('touch')) panels++;
      else if (spec.channelCurrentA != null) actuators++;
    }
  }

  const totalBusMa = devices.reduce((s, d) => s + d.busMa, 0);
  const psuRequired = Math.max(1, Math.ceil(totalBusMa / 512));

  return {
    protocol: project.smartProtocol ?? 'KNX',
    devices,
    totalBusMa,
    psuRequired,
    gateways: Math.max(gateways, 1),
    actuators,
    sensors,
    panels,
    health: busHealth(nodes),
    assumptions: [
      '640 mA bus PSU per segment assumed.',
      devices.length === 0
        ? `Estimate: ${rooms.length} rooms — place gateways and actuators on plan.`
        : `${devices.length} devices addressed on bus.`,
    ],
  };
}
