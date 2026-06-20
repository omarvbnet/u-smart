/**
 * Physical placement checks — clearances, room fit, maintenance access.
 */
import type { CatalogEntry } from '../catalog';
import { footprintPx, physicalSpecFor, PX_PER_M } from '../catalog/dimensions';
import type { DesignNode, DesignRoom } from '../model';
import type { LocalizedText } from '../catalog';
import type { Issue } from './validation';
import { suggestPlacementFix } from './autofix';

const t = (ar: string, en: string, ku: string, tr: string): LocalizedText => ({ ar, en, ku, tr });

function roomAt(rooms: DesignRoom[], x: number, y: number): DesignRoom | null {
  for (const r of rooms) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r;
  }
  return null;
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function validatePlacement(
  nodes: DesignNode[],
  rooms: DesignRoom[],
  getEntry: (id: string) => CatalogEntry | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const boxes: { id: string; x: number; y: number; w: number; h: number; clearance: number }[] = [];

  for (const n of nodes) {
    const entry = getEntry(n.catalogId);
    if (!entry) continue;
    const phys = physicalSpecFor(entry);
    const fp = footprintPx(phys);
    const clearancePx = (phys.clearanceFrontMm / 1000) * PX_PER_M;
    const box = { id: n.id, x: n.x, y: n.y, w: fp.w, h: fp.h, clearance: clearancePx };
    boxes.push(box);

    const cx = n.x + fp.w / 2;
    const cy = n.y + fp.h / 2;
    const room = roomAt(rooms, cx, cy);

    if (rooms.length > 0 && !room && phys.mount !== 'inline') {
      issues.push({
        id: `place_outside_${n.id}`,
        severity: 'warning',
        code: 'PLACE_OUTSIDE_ROOM',
        nodeId: n.id,
        title: t('خارج الغرفة', 'Outside room zone', 'دەرەوەی ژوور', 'Oda dışında'),
        detail: t(
          `${n.label} موضوع خارج حدود أي غرفة على المخطط.`,
          `${n.label} is placed outside any defined room on the floor plan.`,
          `${n.label} لە دەرەوەی هەر ژوورێکە.`,
          `${n.label} tanımlı bir oda dışında.`,
        ),
        values: [],
        standards: ['IEC 60364'],
        recommendation: t('انقل الجهاز داخل الغرفة المناسبة.', 'Move the device into the correct room.', 'بگوازەرەوە بۆ ژووری گونجاو.', 'Cihazı doğru odaya taşıyın.'),
        fix: suggestPlacementFix(n.id, nodes, rooms, 'PLACE_OUTSIDE_ROOM'),
      });
    }

    if (room && phys.mount === 'panel') {
      const reqW = ((phys.widthMm + phys.clearanceFrontMm) / 1000) * PX_PER_M;
      const reqH = ((phys.heightMm + phys.clearanceSideMm * 2) / 1000) * PX_PER_M;
      if (reqW > room.width || reqH > room.height) {
        issues.push({
          id: `place_fit_${n.id}`,
          severity: 'critical',
          code: 'PLACE_NO_FIT',
          nodeId: n.id,
          title: t('لا يتسع في الغرفة', 'Does not fit in room', 'لە ژووردا ناگونجێت', 'Odaya sığmıyor'),
          detail: t(
            'مساحة اللوحة + مساحة الصيانة أكبر من الغرفة.',
            'Panel footprint plus maintenance clearance exceeds room size.',
            'پانتایی تابلۆ + بۆشایی چاککردنەوە گەورەترە لە ژوور.',
            'Pano ayak izi + bakım mesafesi oda boyutunu aşıyor.',
          ),
          values: [
            { label: t('المطلوب', 'Required', 'پێویست', 'Gerekli'), value: `${Math.round(reqW)}×${Math.round(reqH)} px` },
            { label: t('الغرفة', 'Room', 'ژوور', 'Oda'), value: `${Math.round(room.width)}×${Math.round(room.height)} px` },
          ],
          standards: ['IEC 60364'],
          recommendation: t('اختر غرفة أكبر أو لوحة أصغر.', 'Use a larger room or smaller panel.', 'ژوورێکی گەورەتر یان تابلۆی بچووکتر.', 'Daha büyük oda veya küçük pano.'),
          fix: suggestPlacementFix(n.id, nodes, rooms, 'PLACE_NO_FIT'),
        });
      }
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const aClear = { x: a.x - a.clearance, y: a.y - a.clearance, w: a.w + a.clearance * 2, h: a.h + a.clearance * 2 };
      if (overlaps(aClear, b)) {
        issues.push({
          id: `place_clear_${a.id}_${b.id}`,
          severity: 'recommendation',
          code: 'PLACE_CLEARANCE',
          nodeId: a.id,
          title: t('تداخل مساحة صيانة', 'Maintenance clearance overlap', 'تێکەڵبوونی بۆشایی چاککردنەوە', 'Bakım mesafesi çakışması'),
          detail: t('مساحة الصيانة الأمامية تتقاطع مع جهاز آخر.', 'Front maintenance zone overlaps another device.', 'بۆشایی چاککردنەوە لەگەڵ ئامێرێکی تر تێکەڵ دەبێت.', 'Bakım alanı başka cihazla çakışıyor.'),
          values: [],
          standards: ['IEC 60364'],
          recommendation: t('أعد توزيع الأجهزة.', 'Redistribute devices on the plan.', 'ئامێرەکان دووبارە دابەش بکە.', 'Cihazları yeniden yerleştirin.'),
          fix: suggestPlacementFix(a.id, nodes, rooms, 'PLACE_CLEARANCE'),
        });
      }
    }
  }

  return issues;
}
