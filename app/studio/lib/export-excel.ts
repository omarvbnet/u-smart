'use client';

/**
 * Export full design data to Excel (.xlsx): BOQ, device register, rooms, loads, cables.
 */
import { getCatalogEntry } from './catalog';
import { resolveNodes } from './model';
import {
  buildBoq,
  buildLoadSchedule,
  buildCableSchedule,
  buildDeviceRegister,
  buildRoomRegister,
} from './engine/reports';
import type { DesignNode, DesignEdge, DesignRoom, DesignFloor } from './model';
import type { ProjectInfo } from './project';
import { buildingTypeLabel } from './project';

export async function exportDesignExcel(opts: {
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms?: DesignRoom[];
  floors?: DesignFloor[];
  project?: ProjectInfo;
}): Promise<void> {
  const XLSX = await import('xlsx');
  const rooms = opts.rooms ?? [];
  const floors = opts.floors ?? [{ id: 'floor_0', label: 'Ground Floor', level: 0, elevationM: 0 }];
  const resolved = resolveNodes(opts.nodes, getCatalogEntry);
  const boq = buildBoq(resolved);
  const loads = buildLoadSchedule(resolved, rooms, floors);
  const cables = buildCableSchedule(resolved, opts.edges, rooms, floors);
  const devices = buildDeviceRegister(resolved, rooms, floors);
  const roomReg = buildRoomRegister(resolved, rooms, floors);

  const wb = XLSX.utils.book_new();

  if (opts.project) {
    const p = opts.project;
    const infoSheet = XLSX.utils.json_to_sheet([
      { Field: 'Design', Value: opts.designName },
      { Field: 'Client', Value: p.client },
      { Field: 'Building', Value: buildingTypeLabel(p.buildingType).en },
      { Field: 'Floors', Value: p.floorCount },
      { Field: 'Bedrooms', Value: p.bedrooms },
      { Field: 'Cooling', Value: p.coolingSystem },
      { Field: 'Heating', Value: p.heatingSystem },
      { Field: 'Smart', Value: p.smartBuilding ? p.smartProtocol : 'No' },
      { Field: 'Solar kW', Value: p.energySources.includes('solar') ? p.solarCapacityKw : '—' },
      { Field: 'Standards', Value: p.standards.join(', ') },
      { Field: 'Total devices', Value: devices.length },
    ]);
    XLSX.utils.book_append_sheet(wb, infoSheet, 'Project');
  }

  const deviceSheet = XLSX.utils.json_to_sheet(
    devices.map((d) => ({
      'Node ID': d.nodeId,
      Label: d.label,
      Floor: d.floor,
      Room: d.room,
      Domain: d.domain,
      Category: d.category,
      Manufacturer: d.manufacturer,
      Model: d.model,
      'Map X': d.mapX,
      'Map Y': d.mapY,
      Voltage: d.voltage,
      Current: d.current,
      Declaration: d.declaration,
      'Cable label': d.cableLabel,
      Conduit: d.conduitType,
      'Length (m)': d.lengthM,
      'On map': d.showOnMap,
      Notes: d.notes,
    })),
  );
  XLSX.utils.book_append_sheet(wb, deviceSheet, 'All devices');

  const roomSheet = XLSX.utils.json_to_sheet(
    roomReg.map((r) => ({
      Floor: r.floor,
      Room: r.room,
      Zone: r.zone,
      'Area (m²)': r.areaM2,
      'Map X': r.mapX,
      'Map Y': r.mapY,
      Width: r.width,
      Height: r.height,
      Devices: r.devices,
      Outlets: r.outlets,
      Cables: r.cables,
    })),
  );
  XLSX.utils.book_append_sheet(wb, roomSheet, 'Rooms');

  const floorSheet = XLSX.utils.json_to_sheet(
    floors.map((f) => ({
      Floor: f.label,
      Level: f.level,
      'Elevation (m)': f.elevationM,
      Devices: devices.filter((d) => d.floor === f.label).length,
      Rooms: roomReg.filter((r) => r.floor === f.label).length,
    })),
  );
  XLSX.utils.book_append_sheet(wb, floorSheet, 'Floors');

  const boqSheet = XLSX.utils.json_to_sheet(
    boq.rows.map((r) => ({
      Component: r.name,
      Model: r.model,
      Manufacturer: r.manufacturer,
      Unit: r.unit,
      Quantity: r.quantity,
      'Unit cost': r.unitCost,
      Total: r.total,
    })),
  );
  XLSX.utils.book_append_sheet(wb, boqSheet, 'BOQ');

  const loadSheet = XLSX.utils.json_to_sheet(
    loads.rows.map((r) => ({
      Tag: r.tag,
      'Node ID': r.nodeId,
      Label: r.label,
      Floor: r.floor,
      Room: r.room,
      Load: r.name,
      'Power (W)': r.powerW,
      Voltage: r.voltage,
      Phases: r.phases,
      PF: r.pf,
      'Current (A)': Number(r.current.toFixed(2)),
    })),
  );
  XLSX.utils.book_append_sheet(wb, loadSheet, 'Load schedule');

  const cableSheet = XLSX.utils.json_to_sheet(
    cables.map((r) => ({
      Tag: r.tag,
      'Node ID': r.nodeId,
      Label: r.label,
      Floor: r.floor,
      Room: r.room,
      'Cable label': r.cableLabel,
      Conduit: r.conduitType,
      Type: r.type,
      'CSA (mm²)': r.csa,
      Cores: r.cores,
      Material: r.material,
      'Length (m)': r.lengthM,
      'Map X': r.mapX,
      'Map Y': r.mapY,
      'Ampacity (A)': r.ampacity,
      'Vdrop (%)': Number(r.vdropPct.toFixed(2)),
    })),
  );
  XLSX.utils.book_append_sheet(wb, cableSheet, 'Cable schedule');

  const safe = (opts.designName || 'usmart-studio').replace(/[^\w-]+/g, '_');
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
