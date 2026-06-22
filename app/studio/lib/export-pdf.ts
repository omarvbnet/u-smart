'use client';

/**
 * Export the current design to a multi-page PDF with floor-plan snapshots,
 * full device register (all map items), and engineering schedules.
 */
import { getCatalogEntry, type CableSpec } from './catalog';
import { CABLES } from './catalog/cables';
import { validateDesign } from './engine/validation';
import { computeQuality, computeCompliance } from './engine/quality';
import {
  buildLoadSchedule,
  buildCableSchedule,
  buildDeviceRegister,
  buildRoomRegister,
} from './engine/reports';
import { buildingTypeLabel, isManualDesign, type ProjectInfo } from './project';
import { resolveNodes, type DesignNode, type DesignEdge, type DesignRoom, type DesignFloor } from './model';
import type { SourceSpec } from './catalog';
import type { jsPDF } from 'jspdf';

export type FloorMapCapture = { floorId: string; floorLabel: string; dataUrl: string };

export async function exportDesignPdf(opts: {
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms?: DesignRoom[];
  floors?: DesignFloor[];
  project?: ProjectInfo;
  /** One canvas snapshot per floor (all devices visible on each floor plan). */
  floorMaps?: FloorMapCapture[];
}): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas-pro')).default;

  const rooms = opts.rooms ?? [];
  const floors = opts.floors ?? [{ id: 'floor_0', label: 'Ground Floor', level: 0, elevationM: 0 }];
  const resolved = resolveNodes(opts.nodes, getCatalogEntry);
  const devices = buildDeviceRegister(resolved, rooms, floors);
  const roomReg = buildRoomRegister(resolved, rooms, floors);
  const loadSched = buildLoadSchedule(resolved, rooms, floors);
  const cableSched = buildCableSchedule(resolved, opts.edges, rooms, floors);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const header = (subtitle: string) => {
    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(34, 211, 238);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('U Smart Studio', 12, 12);
    doc.setTextColor(180, 190, 210);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageW - 12, 12, { align: 'right' });
  };

  const projectBanner = (topY: number): number => {
    const p = opts.project;
    if (!p) return topY;
    const info = [
      p.client && `Client: ${p.client}`,
      `Building: ${buildingTypeLabel(p.buildingType).en}`,
      `Floors: ${p.floorCount}`,
      p.location && `Location: ${p.location}`,
      `Devices: ${devices.length}`,
    ].filter(Boolean) as string[];
    doc.setTextColor(70, 80, 100);
    doc.setFontSize(9);
    doc.text(info.join('   |   '), 12, topY);
    return topY + 5;
  };

  // ---- Floor plan pages (one per floor or single canvas) ----
  const mapCaptures =
    opts.floorMaps?.length
      ? opts.floorMaps
      : await captureSingleCanvas(html2canvas, floors[0]?.label ?? 'Floor plan');

  for (const cap of mapCaptures) {
    header(`${opts.designName || 'Design'} — ${cap.floorLabel}`);
    let topY = projectBanner(23);
    const img = cap.dataUrl;
    if (img) {
      const imgEl = await loadImage(img);
      const maxW = pageW - 20;
      const maxH = pageH - topY - 8;
      const ratio = Math.min(maxW / imgEl.width, maxH / imgEl.height);
      const w = imgEl.width * ratio;
      const h = imgEl.height * ratio;
      doc.addImage(img, 'PNG', (pageW - w) / 2, topY, w, h);
    }
    if (cap !== mapCaptures[mapCaptures.length - 1]) doc.addPage();
  }

  // ---- Electrical summary (totals + per-item) ----
  doc.addPage();
  header('Electrical Summary');
  const sourceNode = resolved.find((n) => n.spec.domain === 'source');
  const supplyVoltage =
    sourceNode && sourceNode.spec.domain === 'source'
      ? (sourceNode.spec as SourceSpec).voltage
      : loadSched.rows[0]?.voltage ?? 230;
  let sumY = 28;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Project totals', 12, sumY);
  sumY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Supply voltage: ${supplyVoltage} V`, 12, sumY);
  sumY += 6;
  doc.text(`Total connected load: ${loadSched.totalKw.toFixed(2)} kW`, 12, sumY);
  sumY += 6;
  doc.text(`Total design current: ${loadSched.totalA.toFixed(1)} A`, 12, sumY);
  sumY += 6;
  doc.text(`Map devices: ${devices.length}   Load items: ${loadSched.rows.length}   Cables: ${cableSched.length}`, 12, sumY);
  sumY += 10;
  if (opts.project && isManualDesign(opts.project)) {
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 120);
    doc.text('Manual design — devices and connections placed by user.', 12, sumY);
    sumY += 8;
  }
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Per-item electrical data', 12, sumY);
  sumY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const edgeConn = (nodeId: string) =>
    opts.edges.filter((e) => e.source === nodeId || e.target === nodeId).length;
  loadSched.rows.forEach((r) => {
    if (sumY > pageH - 14) {
      doc.addPage();
      header('Electrical Summary (cont.)');
      sumY = 28;
    }
    const conns = edgeConn(r.nodeId);
    doc.text(
      `${truncate(r.label, 18)} · ${truncate(r.name, 22)} · ${(r.powerW / 1000).toFixed(2)} kW · ${r.voltage} V · ${r.current.toFixed(1)} A · ${r.phases}φ · conn ${conns}`,
      12,
      sumY,
    );
    sumY += 5;
  });

  // ---- Room summary ----
  doc.addPage();
  header('Room & Space Register');
  drawTable(doc, pageW, pageH, header, 28, ['Floor', 'Room', 'Zone', 'm²', 'Devices', 'Outlets', 'Cables', 'Map X', 'Map Y'], roomReg.map((r) => [
    truncate(r.floor, 14),
    truncate(r.room, 18),
    r.zone,
    String(r.areaM2),
    String(r.devices),
    String(r.outlets),
    String(r.cables),
    String(r.mapX),
    String(r.mapY),
  ]));

  // ---- Full device register (all map items) ----
  doc.addPage();
  header('Device Register — All Map Items');
  drawTable(
    doc,
    pageW,
    pageH,
    header,
    28,
    ['#', 'Floor', 'Room', 'Label', 'Type', 'Model', 'X', 'Y', 'V', 'A', 'Conn', 'Details'],
    devices.map((d, i) => [
      String(i + 1),
      truncate(d.floor, 10),
      truncate(d.room, 12),
      truncate(d.label, 16),
      truncate(`${d.domain}/${d.category}`, 14),
      truncate(d.model, 12),
      String(d.mapX),
      String(d.mapY),
      d.voltage,
      d.current,
      String(opts.edges.filter((e) => e.source === d.nodeId || e.target === d.nodeId).length),
      truncate(d.cableLabel !== '—' ? d.cableLabel : d.declaration, 20),
    ]),
  );

  // ---- Cable schedule with labels ----
  doc.addPage();
  header('Cable Schedule (labels & routes)');
  drawTable(
    doc,
    pageW,
    pageH,
    header,
    28,
    ['Label', 'Floor', 'Room', 'Conduit', 'CSA', 'Len', 'X', 'Y', 'Iz', 'Vdrop%'],
    cableSched.map((r) => [
      truncate(r.cableLabel, 20),
      truncate(r.floor, 10),
      truncate(r.room, 12),
      truncate(r.conduitType, 10),
      String(r.csa),
      String(r.lengthM),
      String(r.mapX),
      String(r.mapY),
      String(r.ampacity),
      r.vdropPct.toFixed(1),
    ]),
  );

  // ---- Load schedule ----
  doc.addPage();
  header('Electrical Load Schedule');
  doc.setFontSize(9);
  doc.setTextColor(70, 80, 100);
  doc.text(
    `Totals: ${loadSched.totalKw.toFixed(2)} kW · ${loadSched.totalA.toFixed(1)} A · ${supplyVoltage} V supply`,
    12,
    24,
  );
  drawTable(
    doc,
    pageW,
    pageH,
    header,
    28,
    ['Label', 'Floor', 'Room', 'Load', 'kW', 'A', 'Ph', 'Map ref'],
    loadSched.rows.map((r) => [
      truncate(r.label, 16),
      truncate(r.floor, 10),
      truncate(r.room, 12),
      truncate(r.name, 18),
      (r.powerW / 1000).toFixed(2),
      r.current.toFixed(1),
      String(r.phases),
      `${r.nodeId.slice(-8)}`,
    ]),
  );

  // ---- Validation ----
  doc.addPage();
  header('Validation & Quality Report');
  const { issues } = validateDesign(resolved, opts.edges, CABLES as CableSpec[]);
  const quality = computeQuality(issues, resolved.length);
  let y = 30;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`Design Quality Index: ${quality.overall}/100`, 12, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  quality.factors.forEach((f) => {
    doc.text(`${f.label.en}: ${f.score}`, 12, y);
    y += 6;
  });
  y += 4;
  const crit = issues.filter((i) => i.severity === 'critical');
  const warn = issues.filter((i) => i.severity === 'warning');
  doc.setFont('helvetica', 'bold');
  doc.text(`Issues — Critical: ${crit.length}   Warnings: ${warn.length}`, 12, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  [...crit, ...warn].slice(0, 40).forEach((i) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('Validation (cont.)');
      y = 28;
    }
    doc.text(`${i.severity === 'critical' ? '[CRIT]' : '[WARN]'} ${truncate(i.title.en, 90)}`, 12, y);
    y += 5.5;
  });

  // ---- Compliance ----
  doc.addPage();
  header('Standards Compliance Certificate');
  const complianceRows = computeCompliance(issues);
  y = 32;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 20);
  complianceRows.forEach((row) => {
    doc.text(`${row.standard}: ${row.percent}% compliant (${row.violations} violations)`, 12, y);
    y += 6;
  });

  const safe = (opts.designName || 'usmart-studio-design').replace(/[^\w-]+/g, '_');
  doc.save(`${safe}.pdf`);
}

async function captureSingleCanvas(
  html2canvas: (el: HTMLElement, opts?: object) => Promise<HTMLCanvasElement>,
  label: string,
): Promise<FloorMapCapture[]> {
  const el = document.querySelector('.react-flow') as HTMLElement | null;
  if (!el) return [{ floorId: 'floor_0', floorLabel: label, dataUrl: '' }];
  const canvas = await html2canvas(el, { backgroundColor: '#0a0a0f', scale: 2, logging: false });
  return [{ floorId: 'floor_0', floorLabel: label, dataUrl: canvas.toDataURL('image/png') }];
}

function loadImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function drawTable(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  header: (subtitle: string) => void,
  startY: number,
  headers: string[],
  rows: string[][],
) {
  const colW = (pageW - 24) / headers.length;
  let y = startY;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => doc.text(h, 12 + i * colW, y));
  doc.setDrawColor(200);
  doc.line(12, y + 1.5, pageW - 12, y + 1.5);
  y += 5;
  doc.setFont('helvetica', 'normal');
  rows.forEach((row) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('(continued)');
      y = 28;
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => doc.text(h, 12 + i * colW, y));
      y += 5;
      doc.setFont('helvetica', 'normal');
    }
    row.forEach((cell, i) => doc.text(cell, 12 + i * colW, y));
    y += 4.5;
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
