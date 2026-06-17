'use client';

/**
 * Export BOQ, load schedule, and cable schedule to Excel (.xlsx).
 */
import { getCatalogEntry } from './catalog';
import { resolveNodes } from './model';
import { buildBoq, buildLoadSchedule, buildCableSchedule } from './engine/reports';
import type { DesignNode, DesignEdge } from './model';

export async function exportDesignExcel(opts: {
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
}): Promise<void> {
  const XLSX = await import('xlsx');
  const resolved = resolveNodes(opts.nodes, getCatalogEntry);
  const boq = buildBoq(resolved);
  const loads = buildLoadSchedule(resolved);
  const cables = buildCableSchedule(resolved, opts.edges);

  const wb = XLSX.utils.book_new();

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
      Type: r.type,
      'CSA (mm²)': r.csa,
      Cores: r.cores,
      Material: r.material,
      'Length (m)': r.lengthM,
      'Ampacity (A)': r.ampacity,
      'Vdrop (%)': Number(r.vdropPct.toFixed(2)),
    })),
  );
  XLSX.utils.book_append_sheet(wb, cableSheet, 'Cable schedule');

  const safe = (opts.designName || 'usmart-studio').replace(/[^\w-]+/g, '_');
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
