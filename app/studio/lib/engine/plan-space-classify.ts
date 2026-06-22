/**
 * Semantic space classification from detected floor-plan regions (PDF / image import).
 * Maps architectural labels (garage, WC, hall, dining, …) to engineering zones.
 */
import type { DesignRoom, RoomSpaceKind } from '../model';

export const SPACE_KIND_LABELS: Record<RoomSpaceKind, string> = {
  living: 'Living Room',
  dining: 'Dining Room',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  wc: 'WC',
  hall: 'Hall',
  corridor: 'Corridor',
  garage: 'Garage',
  utility: 'Utility Room',
  laundry: 'Laundry',
  office: 'Office',
  storage: 'Storage',
  mechanical: 'MEP Room',
  lightwell: 'Light Well',
  other: 'Space',
};

export function zoneForSpaceKind(kind: RoomSpaceKind): DesignRoom['zone'] {
  switch (kind) {
    case 'kitchen':
      return 'kitchen';
    case 'bedroom':
      return 'bedroom';
    case 'bathroom':
    case 'wc':
      return 'bathroom';
    case 'hall':
    case 'corridor':
      return 'corridor';
    case 'garage':
    case 'utility':
    case 'laundry':
    case 'mechanical':
    case 'storage':
      return 'mechanical';
    case 'office':
      return 'office';
    default:
      return 'general';
  }
}

export type DetectedRegionMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelArea: number;
  areaM2: number;
  aspect: number;
  edgeProx: number;
  rank: number;
};

function edgeProximity(
  x: number,
  y: number,
  w: number,
  h: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
): number {
  const cx = (x + w / 2 - mapX) / Math.max(1, mapW);
  const cy = (y + h / 2 - mapY) / Math.max(1, mapH);
  return Math.min(cx, 1 - cx, cy, 1 - cy);
}

function areaM2FromPx(width: number, height: number): number {
  return (width / 50) * (height / 50);
}

/** WC-sized toilet room — not furniture symbols (chairs, beds, small tables). */
function looksLikeWc(m: DetectedRegionMetrics): boolean {
  return m.areaM2 >= 0.95 && m.areaM2 <= 2.65 && m.aspect >= 0.55 && m.aspect <= 1.65;
}

function maxWcCount(roomCount: number): number {
  return Math.min(4, Math.max(1, Math.ceil(roomCount * 0.12)));
}

/** Classify all detected regions — garages, WC, halls, dining, living, etc. */
export function classifyDetectedSpaces(
  regions: { x: number; y: number; width: number; height: number; area: number }[],
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
): { label: string; zone: DesignRoom['zone']; spaceKind: RoomSpaceKind }[] {
  const ranked = [...regions].sort((a, b) => b.area - a.area);
  const metrics: DetectedRegionMetrics[] = ranked.map((r, rank) => {
    const aspect = r.width / Math.max(1, r.height);
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      pixelArea: r.area,
      areaM2: areaM2FromPx(r.width, r.height),
      aspect,
      edgeProx: edgeProximity(r.x, r.y, r.width, r.height, mapX, mapY, mapWidth, mapHeight),
      rank,
    };
  });

  const kinds: RoomSpaceKind[] = metrics.map(() => 'other');
  const used = new Set<RoomSpaceKind>();
  let bedroomN = 0;
  let wcN = 0;
  let bathN = 0;
  const wcCap = maxWcCount(metrics.length);

  const claim = (i: number, kind: RoomSpaceKind, unique = false) => {
    if (unique && used.has(kind)) return false;
    kinds[i] = kind;
    used.add(kind);
    return true;
  };

  // Pass 1 — strong shape signals
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]!;
    if (m.aspect > 3.4 || m.aspect < 0.28) {
      claim(i, m.areaM2 > 10 ? 'hall' : 'corridor');
      continue;
    }
    if (m.aspect > 2.2 && m.areaM2 >= 8) {
      claim(i, 'hall');
      continue;
    }
    if (looksLikeWc(m) && wcN < wcCap) {
      wcN++;
      claim(i, 'wc');
      continue;
    }
    if (m.areaM2 >= 2.8 && m.areaM2 < 6.5 && m.aspect < 1.75) {
      bathN++;
      claim(i, 'bathroom');
      continue;
    }
    if (m.areaM2 >= 6.5 && m.areaM2 < 11 && m.aspect < 1.55) {
      bathN++;
      claim(i, 'bathroom');
      continue;
    }
    if (m.areaM2 >= 18 && m.edgeProx < 0.14 && m.aspect >= 0.75 && m.aspect <= 2.4) {
      claim(i, 'garage', true);
    }
  }

  // Pass 2 — largest open areas
  const livingIdx = metrics.findIndex((m, i) => kinds[i] === 'other' && m.areaM2 >= 14 && m.aspect < 2.2);
  if (livingIdx >= 0) claim(livingIdx, 'living', true);

  const garageIdx = metrics.findIndex(
    (m, i) => kinds[i] === 'other' && m.areaM2 >= 16 && m.edgeProx < 0.22 && m.rank <= 4,
  );
  if (garageIdx >= 0) claim(garageIdx, 'garage', true);

  const kitchenIdx = metrics.findIndex(
    (m, i) => kinds[i] === 'other' && m.areaM2 >= 7 && m.areaM2 <= 18 && m.rank >= 1 && m.rank <= 5,
  );
  if (kitchenIdx >= 0) claim(kitchenIdx, 'kitchen', true);

  const diningIdx = metrics.findIndex(
    (m, i) =>
      kinds[i] === 'other' &&
      m.areaM2 >= 9 &&
      m.areaM2 <= 22 &&
      m.aspect >= 0.75 &&
      m.aspect <= 1.45 &&
      m.rank >= 1 &&
      m.rank <= 6,
  );
  if (diningIdx >= 0) claim(diningIdx, 'dining', true);

  // Pass 3 — remaining by size rank
  for (let i = 0; i < metrics.length; i++) {
    if (kinds[i] !== 'other') continue;
    const m = metrics[i]!;

    if (m.rank === 0 && m.areaM2 >= 10) {
      claim(i, used.has('living') ? 'dining' : 'living');
      continue;
    }
    if (m.areaM2 >= 12 && m.aspect > 1.9) {
      claim(i, 'hall');
      continue;
    }
    if (m.areaM2 >= 9 && m.areaM2 <= 20 && m.aspect < 1.5) {
      bedroomN++;
      kinds[i] = 'bedroom';
      continue;
    }
    if (m.areaM2 >= 5 && m.areaM2 < 9) {
      kinds[i] = m.aspect > 1.6 ? 'corridor' : used.has('laundry') ? 'utility' : 'laundry';
      used.add(kinds[i]!);
      continue;
    }
    if (m.areaM2 >= 3 && m.areaM2 < 5) {
      kinds[i] = 'storage';
      continue;
    }
    if (m.areaM2 < 3) {
      kinds[i] = 'other';
      continue;
    }
    kinds[i] = m.rank % 4 === 3 ? 'office' : 'other';
  }

  return metrics.map((m, i) => {
    const spaceKind = kinds[i]!;
    const zone = zoneForSpaceKind(spaceKind);
    let label = SPACE_KIND_LABELS[spaceKind];
    if (spaceKind === 'bedroom') {
      const n = metrics.slice(0, i + 1).filter((_, j) => kinds[j] === 'bedroom').length;
      label = n > 1 ? `Bedroom ${n}` : 'Bedroom';
    }
    if (spaceKind === 'bathroom' && bathN > 1) {
      const n = metrics.slice(0, i + 1).filter((_, j) => kinds[j] === 'bathroom').length;
      if (n > 1) label = `Bathroom ${n}`;
    }
    if (spaceKind === 'wc' && wcN > 1) {
      const n = metrics.slice(0, i + 1).filter((_, j) => kinds[j] === 'wc').length;
      if (n > 1) label = `WC ${n}`;
    }
    if (spaceKind === 'hall' && metrics.filter((_, j) => kinds[j] === 'hall').length > 1) {
      const n = metrics.slice(0, i + 1).filter((_, j) => kinds[j] === 'hall').length;
      if (n > 1) label = `Hall ${n}`;
    }
    return { label, zone, spaceKind };
  });
}
