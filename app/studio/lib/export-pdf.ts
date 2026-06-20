'use client';

/**
 * Export the current design to a multi-page PDF:
 *  1. the canvas single-line / floor-plan view,
 *  2. a component & cable schedule with required voltage/current,
 *  3. a validation + quality summary.
 *
 * Report text is rendered in English (jsPDF has no Arabic shaping); the
 * on-screen UI remains fully localized.
 */
import { getCatalogEntry, type CableSpec } from './catalog';
import { CABLES } from './catalog/cables';
import { declarationFor } from './engine/declarations';
import { resolveNodes, type DesignNode, type DesignEdge } from './model';
import { validateDesign } from './engine/validation';
import { computeQuality, computeCompliance } from './engine/quality';
import { buildLoadSchedule, buildCableSchedule } from './engine/reports';
import { buildingTypeLabel, type ProjectInfo } from './project';

export async function exportDesignPdf(opts: {
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  project?: ProjectInfo;
}): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas-pro')).default;

  const el = document.querySelector('.react-flow') as HTMLElement | null;
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

  // ---- Page 1: canvas snapshot ----
  header(opts.designName || 'Untitled design');
  let topY = 24;
  const p = opts.project;
  if (p) {
    const info = [
      p.client && `Client: ${p.client}`,
      p.consultant && `Consultant: ${p.consultant}`,
      `Building: ${buildingTypeLabel(p.buildingType).en}`,
      p.location && `Location: ${p.location}`,
      p.reference && `Ref: ${p.reference}`,
      `Rev: ${p.revision}`,
    ].filter(Boolean) as string[];
    doc.setTextColor(70, 80, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(info.join('   |   '), 12, 23);
    if (p.standards.length) doc.text(`Standards: ${p.standards.join(', ')}`, 12, 27.5);
    topY = 31;
  }
  if (el) {
    const canvas = await html2canvas(el, { backgroundColor: '#0a0a0f', scale: 2, logging: false });
    const img = canvas.toDataURL('image/png');
    const maxW = pageW - 20;
    const maxH = pageH - topY - 6;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    doc.addImage(img, 'PNG', (pageW - w) / 2, topY, w, h);
  }

  // ---- Page 2: component & cable schedule ----
  doc.addPage();
  header('Component & Cable Schedule');
  const resolved = resolveNodes(opts.nodes, getCatalogEntry);
  let y = 28;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const cols = [12, 26, 96, 150, 196, 230, 262];
  const headers = ['#', 'Type', 'Component', 'Model', 'Voltage', 'Current', 'Standards'];
  headers.forEach((hh, i) => doc.text(hh, cols[i]!, y));
  doc.setDrawColor(200);
  doc.line(12, y + 1.5, pageW - 12, y + 1.5);
  y += 6;
  doc.setFont('helvetica', 'normal');
  resolved.forEach((n, idx) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('Component & Cable Schedule (cont.)');
      y = 28;
    }
    const decl = declarationFor(n.spec);
    const row = [
      String(idx + 1),
      n.spec.domain,
      truncate(n.spec.name.en, 36),
      truncate(`${n.spec.manufacturer} ${n.spec.model}`, 26),
      decl ? `${decl.voltage} V` : '-',
      decl && decl.current > 0 ? `${decl.current.toFixed(1)} A` : '-',
      truncate(n.spec.standards.join(', ') || '-', 16),
    ];
    row.forEach((c, i) => doc.text(c, cols[i]!, y));
    y += 5.5;
  });

  // ---- Page 3: validation + quality ----
  doc.addPage();
  header('Validation & Quality Report');
  const { issues } = validateDesign(resolved, opts.edges, CABLES as CableSpec[]);
  const quality = computeQuality(issues, resolved.length);
  y = 30;
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
  const rec = issues.filter((i) => i.severity === 'recommendation');
  doc.setFont('helvetica', 'bold');
  doc.text(`Issues — Critical: ${crit.length}   Warnings: ${warn.length}   Recommendations: ${rec.length}`, 12, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  [...crit, ...warn, ...rec].forEach((i) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('Validation & Quality Report (cont.)');
      y = 28;
    }
    const tag = i.severity === 'critical' ? '[CRIT]' : i.severity === 'warning' ? '[WARN]' : '[REC ]';
    doc.text(`${tag} ${truncate(i.title.en, 50)} — ${truncate(i.detail.en, 90)}`, 12, y);
    y += 5.5;
  });

  // ---- Page 4: formal compliance certificate ----
  doc.addPage();
  header('Standards Compliance Certificate');
  const complianceRows = computeCompliance(issues);
  y = 32;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Deterministic compliance summary (rule-based engine — not LLM estimates)', 12, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  complianceRows.forEach((row) => {
    doc.text(`${row.standard}: ${row.percent}% compliant (${row.violations} open violations)`, 12, y);
    y += 6;
  });
  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Assumptions and missing inputs must be confirmed before tender submission. Calculations reference IEC 60364, IEC 60898, ASHRAE, EN 12464-1 as applicable.',
    12,
    y,
    { maxWidth: pageW - 24 },
  );

  // ---- Page 5: load schedule ----
  doc.addPage();
  header('Electrical Load Schedule');
  const loadSched = buildLoadSchedule(resolved);
  y = 28;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  ['Tag', 'Load', 'kW', 'A', 'Ph'].forEach((h, i) => doc.text(h, 12 + i * 52, y));
  y += 6;
  doc.setFont('helvetica', 'normal');
  loadSched.rows.forEach((row) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('Load Schedule (cont.)');
      y = 28;
    }
    doc.text(truncate(row.tag, 10), 12, y);
    doc.text(truncate(row.name, 22), 64, y);
    doc.text((row.powerW / 1000).toFixed(2), 116, y);
    doc.text(row.current.toFixed(1), 168, y);
    doc.text(String(row.phases), 220, y);
    y += 5;
  });

  // ---- Page 6: cable schedule ----
  doc.addPage();
  header('Cable Schedule');
  const cableSched = buildCableSchedule(resolved, opts.edges);
  y = 28;
  doc.setFont('helvetica', 'bold');
  ['Tag', 'Type', 'CSA', 'Len m', 'Iz A'].forEach((h, i) => doc.text(h, 12 + i * 52, y));
  y += 6;
  doc.setFont('helvetica', 'normal');
  cableSched.forEach((row) => {
    if (y > pageH - 12) {
      doc.addPage();
      header('Cable Schedule (cont.)');
      y = 28;
    }
    doc.text(truncate(row.tag, 10), 12, y);
    doc.text(truncate(row.type, 18), 64, y);
    doc.text(String(row.csa), 116, y);
    doc.text(String(row.lengthM), 168, y);
    doc.text(String(row.ampacity), 220, y);
    y += 5;
  });

  const safe = (opts.designName || 'usmart-studio-design').replace(/[^\w-]+/g, '_');
  doc.save(`${safe}.pdf`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
