/**
 * U Smart Studio — Design Quality Index & standards compliance.
 */
import type { StandardCode, LocalizedText } from '../catalog';
import type { Issue } from './validation';

export type QualityFactor = {
  key: 'safety' | 'compliance' | 'energy' | 'cost' | 'maintainability';
  label: LocalizedText;
  score: number; // 0..100
};

export type QualityReport = {
  overall: number; // 0..100
  factors: QualityFactor[];
};

const t = (ar: string, en: string, ku: string, tr: string): LocalizedText => ({ ar, en, ku, tr });

export function computeQuality(issues: Issue[], nodeCount: number): QualityReport {
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const recs = issues.filter((i) => i.severity === 'recommendation').length;

  const safety = clamp(100 - critical * 18 - warnings * 4);
  const compliance = clamp(100 - critical * 12 - warnings * 6);
  const energy = clamp(100 - recs * 8 - warnings * 3);
  const cost = clamp(100 - recs * 5 - critical * 4);
  const maintainability = clamp(nodeCount === 0 ? 100 : 100 - warnings * 3 - critical * 5);

  const factors: QualityFactor[] = [
    { key: 'safety', label: t('السلامة', 'Safety', 'سەلامەتی', 'Güvenlik'), score: safety },
    { key: 'compliance', label: t('المطابقة', 'Compliance', 'گونجان', 'Uyumluluk'), score: compliance },
    { key: 'energy', label: t('كفاءة الطاقة', 'Energy efficiency', 'کارایی وزە', 'Enerji verimi'), score: energy },
    { key: 'cost', label: t('فعالية التكلفة', 'Cost effectiveness', 'کاریگەری تێچوو', 'Maliyet etkinliği'), score: cost },
    { key: 'maintainability', label: t('قابلية الصيانة', 'Maintainability', 'پاراستن', 'Bakım kolaylığı'), score: maintainability },
  ];

  // Weighted overall: safety & compliance dominate.
  const weights: Record<QualityFactor['key'], number> = {
    safety: 0.3,
    compliance: 0.3,
    energy: 0.15,
    cost: 0.1,
    maintainability: 0.15,
  };
  const overall = Math.round(factors.reduce((sum, f) => sum + f.score * weights[f.key], 0));

  return { overall, factors };
}

export type ComplianceRow = {
  standard: StandardCode;
  label: LocalizedText;
  percent: number;
  violations: number;
};

const STANDARD_LABELS: Record<StandardCode, LocalizedText> = {
  'IEC 60364': t('IEC 60364 — التركيبات الكهربائية', 'IEC 60364 — LV installations', 'IEC 60364', 'IEC 60364'),
  'IEC 60947': t('IEC 60947 — أجهزة القطع', 'IEC 60947 — Switchgear', 'IEC 60947', 'IEC 60947'),
  'IEC 60898': t('IEC 60898 — القواطع المنزلية', 'IEC 60898 — MCBs', 'IEC 60898', 'IEC 60898'),
  'IEC 60287': t('IEC 60287 — تصنيف الكابلات', 'IEC 60287 — Cable ratings', 'IEC 60287', 'IEC 60287'),
  'IEC 60332': t('IEC 60332 — مقاومة الحريق', 'IEC 60332 — Fire performance', 'IEC 60332', 'IEC 60332'),
  'NEC 2023': t('NEC 2023', 'NEC 2023', 'NEC 2023', 'NEC 2023'),
  'NFPA 70': t('NFPA 70', 'NFPA 70', 'NFPA 70', 'NFPA 70'),
  ASHRAE: t('ASHRAE — التكييف', 'ASHRAE — HVAC', 'ASHRAE', 'ASHRAE'),
  KNX: t('KNX — الأتمتة', 'KNX — Automation', 'KNX', 'KNX'),
};

const TRACKED: StandardCode[] = ['IEC 60364', 'IEC 60947', 'IEC 60898', 'IEC 60287', 'IEC 60332', 'ASHRAE', 'KNX'];

export function computeCompliance(issues: Issue[]): ComplianceRow[] {
  return TRACKED.map((standard) => {
    const violations = issues.filter(
      (i) => i.severity !== 'recommendation' && i.standards.includes(standard),
    ).length;
    const percent = clamp(100 - violations * 15);
    return { standard, label: STANDARD_LABELS[standard], percent, violations };
  });
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
