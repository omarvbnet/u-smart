/**
 * U Smart Studio — HDL Buspro & KNX emulator.
 *
 * Assigns bus addresses to automation devices and generates telegrams as the
 * user operates devices during live simulation.
 */
import type { CatalogEntry } from '../catalog';
import type { DesignNode } from '../model';
import { getCatalogEntry } from '../catalog';

export type BusProtocol = 'HDL' | 'KNX' | 'IO';

export type BusAddress = {
  protocol: BusProtocol;
  /** HDL: "subnet.device"; KNX: individual "area.line.device". */
  device: string;
  /** KNX group address "main/middle/sub" (HDL: scene/area code). */
  group: string;
  online: boolean;
};

export type Telegram = {
  id: string;
  t: number;
  protocol: BusProtocol;
  src: string;
  dst: string;
  op: string;
  value: string;
  raw: string;
};

function protocolOf(entry: CatalogEntry): BusProtocol {
  if (entry.domain === 'smarthome') return entry.protocol;
  if (entry.domain === 'sensor') return entry.protocol === 'KNX' ? 'KNX' : entry.protocol === 'HDL' ? 'HDL' : 'IO';
  return 'IO';
}

/** Devices that live on a control bus (and therefore have addresses). */
export function busNodes(nodes: DesignNode[]): DesignNode[] {
  return nodes.filter((n) => {
    const e = getCatalogEntry(n.catalogId);
    return e && (e.domain === 'smarthome' || e.domain === 'sensor');
  });
}

/** Deterministic address map keyed by node id. */
export function assignAddresses(nodes: DesignNode[]): Map<string, BusAddress> {
  const map = new Map<string, BusAddress>();
  let hdl = 1;
  let knx = 1;
  let io = 1;
  for (const n of busNodes(nodes)) {
    const entry = getCatalogEntry(n.catalogId)!;
    const protocol = protocolOf(entry);
    if (protocol === 'HDL') {
      map.set(n.id, { protocol, device: `1.${hdl}`, group: `S${hdl}`, online: true });
      hdl++;
    } else if (protocol === 'KNX') {
      map.set(n.id, { protocol, device: `1.1.${knx}`, group: `1/1/${knx}`, online: true });
      knx++;
    } else {
      map.set(n.id, { protocol, device: `IO-${io}`, group: `DI/${io}`, online: true });
      io++;
    }
  }
  return map;
}

let seq = 0;

export function makeTelegram(
  entry: CatalogEntry,
  addr: BusAddress,
  control: string,
  value: boolean | number,
): Telegram {
  const op = controlToOp(control, value);
  const valStr = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : String(value);
  const dst =
    addr.protocol === 'KNX'
      ? addr.group
      : addr.protocol === 'HDL'
        ? `${addr.group}`
        : addr.group;
  const raw =
    addr.protocol === 'KNX'
      ? `BC ${addr.device} ${dst} ${typeof value === 'number' ? hex(value) : value ? '01' : '00'}`
      : `AA AA ${addr.device.replace('.', ' ')} ${hex(typeof value === 'number' ? value : value ? 1 : 0)}`;
  return {
    id: `tg_${Date.now().toString(36)}_${(seq++).toString(36)}`,
    t: Date.now(),
    protocol: addr.protocol,
    src: addr.device,
    dst,
    op,
    value: valStr,
    raw,
  };
}

function controlToOp(control: string, value: boolean | number): string {
  switch (control) {
    case 'on':
      return value ? 'Switch ON' : 'Switch OFF';
    case 'level':
      return 'Set dimming/position';
    case 'setpoint':
      return 'Set temperature';
    case 'active':
      return value ? 'Trigger / motion' : 'Clear';
    default:
      return 'Write';
  }
}

function hex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

/** Nominal bus health metrics for the diagnostics header. */
export function busHealth(nodes: DesignNode[]): { hdl: number; knx: number; voltageV: number } {
  const addrs = assignAddresses(nodes);
  let hdl = 0;
  let knx = 0;
  addrs.forEach((a) => {
    if (a.protocol === 'HDL') hdl++;
    else if (a.protocol === 'KNX') knx++;
  });
  // Typical KNX bus ~29 V; HDL ~24 V. Drops slightly with device count.
  const voltageV = Math.max(21, 30 - (hdl + knx) * 0.05);
  return { hdl, knx, voltageV: Number(voltageV.toFixed(1)) };
}
