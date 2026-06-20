/**
 * Deterministic NL brief parser — extracts project intent without LLM calculations.
 */
import type { DesignRoom } from '../model';
import type { EnergySourceType, ProjectInfo } from '../project';
import { defaultProject } from '../project';

export type ParsedBrief = {
  project: ProjectInfo;
  rooms: Omit<DesignRoom, 'id'>[];
  designName: string;
  assumptions: string[];
};

function countOf(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  if (!m) return 0;
  const w = m[1]?.toLowerCase();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  return words[w ?? ''] ?? (Number(m[1]) || 0);
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}

function layoutRooms(specs: { label: string; zone: DesignRoom['zone']; w: number; h: number }[]): Omit<DesignRoom, 'id'>[] {
  const cols = 3;
  const gap = 24;
  let x = -280;
  let y = -200;
  let col = 0;
  return specs.map((s) => {
    const room = { label: s.label, zone: s.zone, x, y, width: s.w, height: s.h };
    col++;
    x += s.w + gap;
    if (col >= cols) {
      col = 0;
      x = -280;
      y += s.h + gap;
    }
    return room;
  });
}

export function parseProjectBrief(text: string, base: ProjectInfo = defaultProject()): ParsedBrief {
  const q = text.toLowerCase();
  const assumptions: string[] = [];
  const project: ProjectInfo = { ...base, setupComplete: true };

  if (has(q, 'villa')) project.buildingType = 'villa';
  else if (has(q, 'apartment', 'flat')) project.buildingType = 'apartment';
  else if (has(q, 'hotel')) project.buildingType = 'hotel';
  else if (has(q, 'hospital')) project.buildingType = 'hospital';
  else if (has(q, 'industrial', 'factory')) project.buildingType = 'industrial';
  else if (has(q, 'commercial')) project.buildingType = 'commercial';
  else if (has(q, 'residential building')) project.buildingType = 'residential';
  else if (has(q, 'house')) project.buildingType = 'house';

  const floors = countOf(q, /(\d+|one|two|three|four|five)\s+floors?/);
  if (floors > 1) assumptions.push(`${floors} floors noted — layout shows ground floor; repeat MEP per floor as needed.`);

  const areaM2 = countOf(q, /(\d+)\s*m²/) || countOf(q, /(\d+)\s*sqm/);
  if (areaM2) assumptions.push(`Total area ${areaM2} m² used to scale room sizes.`);

  project.smartBuilding = has(q, 'knx', 'hdl', 'buspro', 'smart', 'automation');
  if (has(q, 'knx')) project.smartProtocol = 'KNX';
  else if (has(q, 'hdl', 'buspro')) project.smartProtocol = 'HDL';
  else if (project.smartBuilding) project.smartProtocol = 'KNX';

  if (has(q, 'vrf')) {
    project.hvacMode = 'manual';
    project.hvacTypes = ['vrf'];
  } else if (has(q, 'chiller')) {
    project.hvacMode = 'manual';
    project.hvacTypes = ['chiller'];
  } else if (has(q, 'split')) {
    project.hvacMode = 'manual';
    project.hvacTypes = ['split'];
  } else project.hvacMode = 'auto';

  const sources: EnergySourceType[] = ['grid'];
  if (has(q, 'generator')) sources.push('generator');
  if (has(q, 'solar', 'pv')) sources.push('solar');
  if (has(q, 'battery', 'batteries')) sources.push('battery');
  if (has(q, 'ups')) sources.push('ups');
  project.energySources = [...new Set(sources)];
  project.floorPlanSource = 'zero';

  const specs: { label: string; zone: DesignRoom['zone']; w: number; h: number }[] = [];
  const beds = countOf(q, /(\d+|one|two|three|four|five|six|seven|eight)\s+bedrooms?/) || (has(q, 'bedroom') ? 1 : 0);
  for (let i = 0; i < Math.max(beds, 0); i++) {
    specs.push({ label: i === 0 && has(q, 'master') ? 'Master Bedroom' : `Bedroom ${i + 1}`, zone: 'bedroom', w: 220, h: 180 });
  }
  const living = countOf(q, /(\d+|two|three)\s+living\s+rooms?/) || (has(q, 'living') ? 1 : 0);
  for (let i = 0; i < living; i++) specs.push({ label: living > 1 ? `Living ${i + 1}` : 'Living Room', zone: 'general', w: 300, h: 220 });
  if (has(q, 'dining')) specs.push({ label: 'Dining Room', zone: 'general', w: 200, h: 180 });
  if (has(q, 'kitchen')) specs.push({ label: 'Kitchen', zone: 'kitchen', w: 240, h: 180 });
  if (has(q, 'maid')) specs.push({ label: 'Maid Room', zone: 'bedroom', w: 140, h: 140 });
  if (has(q, 'garage')) {
    const cars = countOf(q, /(\d+|two|three)\s+cars?/) || 2;
    specs.push({ label: `Garage (${cars} cars)`, zone: 'mechanical', w: 120 + cars * 80, h: 200 });
  }
  if (has(q, 'pool', 'swimming')) specs.push({ label: 'Pool Area', zone: 'general', w: 320, h: 160 });
  if (has(q, 'bathroom', 'bath')) specs.push({ label: 'Bathroom', zone: 'bathroom', w: 120, h: 100 });

  if (specs.length === 0) {
    assumptions.push('Default layout applied — describe rooms in your brief for custom layout.');
    specs.push(
      { label: 'Living Room', zone: 'general', w: 300, h: 220 },
      { label: 'Kitchen', zone: 'kitchen', w: 200, h: 160 },
      { label: 'Bedroom 1', zone: 'bedroom', w: 200, h: 180 },
    );
  }

  if (areaM2 && specs.length) {
    const current = specs.reduce((s, r) => s + (r.w / 50) * (r.h / 50), 0);
    const scale = Math.sqrt(areaM2 / Math.max(current, 1));
    if (scale > 0.5 && scale < 3) specs.forEach((r) => { r.w = Math.round(r.w * scale); r.h = Math.round(r.h * scale); });
  }

  assumptions.push('Engineering calculations use deterministic IEC/ASHRAE engines — not LLM estimates.');

  return {
    project,
    rooms: layoutRooms(specs),
    designName: `${project.buildingType} — Autonomous Design`,
    assumptions,
  };
}

export function isGenerateBriefCommand(text: string): boolean {
  const q = text.toLowerCase();
  return q.startsWith('design ') || q.startsWith('generate ') || q.includes('from scratch') || (q.includes('bedroom') && (q.includes('villa') || q.includes('m²')));
}
