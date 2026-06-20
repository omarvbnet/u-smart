/**
 * Lighting-specific validation — lux compliance, wrong fixture type, overload.
 */
import type { LoadSpec } from '../catalog';
import type { DesignRoom } from '../model';
import type { Issue } from './validation';
import { calculateLightingDesign } from './lighting-design';
import { recommendFixtureType } from './lighting-fixtures';
import type { ResolvedNode } from '../model';

const t = (ar: string, en: string, ku: string, tr: string) => ({ ar, en, ku, tr });

export function validateLightingDesign(
  nodes: ResolvedNode[],
  rooms: DesignRoom[],
): Issue[] {
  const report = calculateLightingDesign(rooms);
  const issues: Issue[] = [];

  for (const row of report.rooms) {
    if (!row.compliant) {
      issues.push({
        id: `light_lux_${row.roomId}`,
        severity: 'warning',
        code: 'LIGHT_LUX_LOW',
        title: t('إضاءة أقل من المطلوب', 'Insufficient illuminance', 'ڕووناکی کەم', 'Yetersiz aydınlatma'),
        detail: t(
          `${row.label}: ${row.achievedLux} lux achieved vs ${row.luxTarget} lux target.`,
          `${row.label}: ${row.achievedLux} lux achieved vs ${row.luxTarget} lux target.`,
          `${row.label}: ${row.achievedLux} lux.`,
          `${row.label}: ${row.achievedLux} lux hedef ${row.luxTarget} altında.`,
        ),
        values: [
          { label: t('المحقق', 'Achieved', 'محقق', 'Gerçekleşen'), value: `${row.achievedLux} lx` },
          { label: t('المطلوب', 'Target', 'ئامانج', 'Hedef'), value: `${row.luxTarget} lx` },
        ],
        standards: ['IEC 60364'],
        recommendation: t(
          `أضف ${row.fixturesRecommended + 1} ${row.fixtureType} أو استبدل بنوع linear.`,
          `Add ${row.fixturesRecommended + 1} ${row.fixtureType} fixtures or switch to linear.`,
          'چرکەی زیاتر زیاد بکە.',
          'Linear veya ek armatür ekleyin.',
        ),
        fix: { kind: 'setParam', nodeId: row.roomId, key: 'luxFix', value: row.fixturesRecommended + 1 },
      });
    }

    const recommended = recommendFixtureType(rooms.find((r) => r.id === row.roomId)!);
    const room = rooms.find((r) => r.id === row.roomId);
    if (!room) continue;

    const placed = nodes.filter((n) => {
      if (n.spec.domain !== 'load' || (n.spec as LoadSpec).category !== 'LIGHTING') return false;
      const cx = n.x + 20;
      const cy = n.y + 20;
      return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
    });

    for (const n of placed) {
      const spec = n.spec as LoadSpec;
      if (spec.lightingType && spec.lightingType !== recommended && n.catalogId !== row.catalogId) {
        issues.push({
          id: `light_type_${n.id}`,
          severity: 'recommendation',
          code: 'LIGHT_WRONG_TYPE',
          nodeId: n.id,
          title: t('نوع إضاءة غير مناسب', 'Suboptimal fixture type', 'جۆری ناگونجاو', 'Uygun olmayan armatür'),
          detail: t(
            `${spec.lightingType} in ${row.label}; ${recommended} recommended for ${room.zone} zone.`,
            `${spec.lightingType} in ${row.label}; ${recommended} recommended.`,
            `${spec.lightingType} لە ${row.label}.`,
            `${row.label} için ${recommended} önerilir.`,
          ),
          values: [],
          standards: ['IEC 60364'],
          recommendation: t('استبدل بنوع الإضاءة الموصى به.', 'Replace with recommended fixture type.', 'بیگۆڕە.', 'Önerilen tipi kullanın.'),
          fix: { kind: 'replaceCatalog', nodeId: n.id, toCatalogId: row.catalogId },
        });
      }
    }
  }

  return issues;
}
