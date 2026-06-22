/**
 * U Smart Studio — Smart validation engine.
 *
 * Traverses the design graph, builds per-load circuits, and produces
 * engineering issues (critical errors, warnings, recommendations) with
 * calculated values, applicable standards, and an optional auto-fix.
 */
import type {
  CatalogEntry,
  CableSpec,
  ProtectionSpec,
  SourceSpec,
  LoadSpec,
  HvacSpec,
  LocalizedText,
  StandardCode,
} from '../catalog';
import type { DesignEdge, ResolvedNode } from '../model';
import {
  loadCurrent,
  voltageDropPercent,
  prospectiveScKa,
  apparentKva,
} from './electrical';
import {
  suggestHvacFix,
  suggestConnectToSource,
  suggestProtectionFix,
  suggestCoordinationFix,
  suggestShortCircuitFix,
  suggestPhaseFix,
  suggestPanelOverloadFix,
} from './autofix';

export type Severity = 'critical' | 'warning' | 'recommendation';

export type IssueValue = { label: LocalizedText; value: string };

export type Fix =
  | { kind: 'replaceBreaker'; nodeId: string; toRating: number }
  | { kind: 'resizeCable'; nodeId: string; toCatalogId: string }
  | { kind: 'setParam'; nodeId: string; key: string; value: number }
  | { kind: 'addGrounding' }
  | { kind: 'moveNode'; nodeId: string; x: number; y: number }
  | { kind: 'replaceCatalog'; nodeId: string; toCatalogId: string }
  | { kind: 'addPsu'; count: number }
  | { kind: 'addCircuit'; loadNodeId: string; panelNodeId: string }
  | { kind: 'ensureBackbone'; sourceCatalogId?: string }
  | { kind: 'addSource'; catalogId: string }
  | { kind: 'upgradeBreaker'; nodeId: string; toCatalogId: string }
  | { kind: 'addRoomLighting'; roomId: string; catalogId: string; count: number };

export type Issue = {
  id: string;
  severity: Severity;
  code: string;
  nodeId?: string;
  edgeId?: string;
  title: LocalizedText;
  detail: LocalizedText;
  values: IssueValue[];
  standards: StandardCode[];
  recommendation: LocalizedText;
  fix?: Fix;
};

const t = (ar: string, en: string, ku: string, tr: string): LocalizedText => ({ ar, en, ku, tr });

type Circuit = {
  load: ResolvedNode;
  current: number;
  voltage: number;
  phases: 1 | 3;
  pf: number;
  cables: ResolvedNode[];
  breakers: ResolvedNode[];
  source: ResolvedNode | null;
};

function buildAdjacency(edges: DesignEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return adj;
}

/** Demand current/voltage/phases for a consuming node (respects instance overrides). */
function loadElectricals(node: ResolvedNode): { p: number; v: number; ph: 1 | 3; pf: number } | null {
  if (node.spec.domain === 'load') {
    const l = node.spec as LoadSpec;
    const p = Number(node.params.powerW) || l.powerW;
    return { p, v: l.voltage, ph: l.phases, pf: l.powerFactor };
  }
  if (node.spec.domain === 'hvac') {
    const h = node.spec as HvacSpec;
    return { p: h.inputKw * 1000, v: h.voltage, ph: h.phases, pf: 0.9 };
  }
  return null;
}

/** BFS from a load node, collecting cables/breakers and the nearest source. */
function traceCircuit(
  load: ResolvedNode,
  byId: Map<string, ResolvedNode>,
  adj: Map<string, Set<string>>,
): Circuit | null {
  const el = loadElectricals(load);
  if (!el) return null;

  const cables: ResolvedNode[] = [];
  const breakers: ResolvedNode[] = [];
  let source: ResolvedNode | null = null;

  const seen = new Set<string>([load.id]);
  const queue = [load.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const node = byId.get(next);
      if (!node) continue;
      if (node.spec.domain === 'cable') cables.push(node);
      else if (node.spec.domain === 'protection') breakers.push(node);
      else if (node.spec.domain === 'source' && !source) source = node;
      queue.push(next);
    }
  }

  return {
    load,
    current: loadCurrent(el.p, el.v, el.ph, el.pf),
    voltage: el.v,
    phases: el.ph,
    pf: el.pf,
    cables,
    breakers,
    source,
  };
}

export type ValidationResult = {
  issues: Issue[];
  circuits: Circuit[];
};

export function validateDesign(
  nodes: ResolvedNode[],
  edges: DesignEdge[],
  cableCatalog: CableSpec[],
): ValidationResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = buildAdjacency(edges);
  const issues: Issue[] = [];

  const sources = nodes.filter((n) => n.spec.domain === 'source');
  const loads = nodes.filter((n) => n.spec.domain === 'load' || n.spec.domain === 'hvac');
  const circuits: Circuit[] = [];

  // ---- Per-circuit checks ----
  for (const load of loads) {
    if (load.spec.domain === 'load' && (load.spec as LoadSpec).category === 'PANEL') continue;
    const circuit = traceCircuit(load, byId, adj);
    if (!circuit) continue;
    circuits.push(circuit);
    const Ib = circuit.current;

    const noSource = !circuit.source;
    const noProtection = circuit.breakers.length === 0;
    if (noSource && noProtection) {
      issues.push({
        id: `${load.id}-no-circuit`,
        severity: 'critical',
        code: 'NO_CIRCUIT',
        nodeId: load.id,
        title: t('لا يوجد مصدر طاقة', 'No power source', 'هیچ سەرچاوەی وزە نییە', 'Güç kaynağı yok'),
        detail: t(
          'هذا الحمل غير موصول بلوحة التوزيع والمصدر عبر قاطع وكابل.',
          'This load is not wired to a distribution board and source via breaker and cable.',
          'ئەم بارە بە تابلۆ و سەرچاوە و برەیکەر و کێبڵ نەبەستراوەتەوە.',
          'Bu yük dağıtım panosu ve kaynağa kesici ve kablo ile bağlı değil.',
        ),
        values: [{ label: t('التيار', 'Current', 'کارەبا', 'Akım'), value: `${Ib.toFixed(1)} A` }],
        standards: ['IEC 60364', 'IEC 60898'],
        recommendation: t(
          'وصّل الحمل بلوحة التوزيع والمصدر عبر قاطع وكابل.',
          'Wire the load to the DB and source via a breaker and cable.',
          'بار ببەستەرەوە بە تابلۆ و سەرچاوە.',
          'Yükü pano ve kaynağa kesici ve kablo ile bağlayın.',
        ),
        fix: suggestConnectToSource(load.id, nodes, edges),
      });
    } else if (noSource) {
      issues.push({
        id: `${load.id}-no-source`,
        severity: 'critical',
        code: 'NO_SOURCE',
        nodeId: load.id,
        title: t('لا يوجد مصدر طاقة', 'No power source', 'هیچ سەرچاوەی وزە نییە', 'Güç kaynağı yok'),
        detail: t(
          'اللوحة أو الحمل غير موصول بمصدر الطاقة.',
          'The distribution path is not connected to a power source.',
          'ڕێڕەوەکە بە سەرچاوەی وزە نەبەستراوەتەوە.',
          'Dağıtım yolu güç kaynağına bağlı değil.',
        ),
        values: [{ label: t('التيار', 'Current', 'کارەبا', 'Akım'), value: `${Ib.toFixed(1)} A` }],
        standards: ['IEC 60364'],
        recommendation: t('وصّل لوحة التوزيع بالمصدر.', 'Connect the DB to the utility source.', 'تابلۆ بە سەرچاوە ببەستە.', 'Panoyu kaynağa bağlayın.'),
        fix: suggestConnectToSource(load.id, nodes, edges),
      });
    } else if (noProtection) {
      issues.push({
        id: `${load.id}-no-protection`,
        severity: 'critical',
        code: 'NO_PROTECTION',
        nodeId: load.id,
        title: t('لا توجد حماية', 'No protection device', 'هیچ ئامێری پاراستن نییە', 'Koruma cihazı yok'),
        detail: t(
          'لا يوجد قاطع لحماية هذه الدائرة.',
          'No circuit breaker protects this circuit.',
          'هیچ برەیکەرێک ئەم سوڕە ناپارێزێت.',
          'Bu devreyi koruyan bir kesici yok.',
        ),
        values: [{ label: t('التيار التصميمي', 'Design current', 'کارەبای دیزاین', 'Tasarım akımı'), value: `${Ib.toFixed(1)} A` }],
        standards: ['IEC 60364', 'IEC 60898'],
        recommendation: t('أضف قاطعاً مناسباً للتيار التصميمي.', 'Add a breaker sized for the design current.', 'برەیکەرێک زیاد بکە بۆ کارەبای دیزاین.', 'Tasarım akımına uygun bir kesici ekleyin.'),
        fix: suggestProtectionFix(load.id, nodes, edges),
      });
    }

    // Cable sizing & voltage drop.
    for (const cableNode of circuit.cables) {
      const cable = cableNode.spec as CableSpec;
      if (cable.category !== 'LV') continue;
      const lengthM = Number(cableNode.params.lengthM ?? 20);

      if (cable.ampacityA < Ib) {
        const replacement = cableCatalog
          .filter((c) => c.category === 'LV' && c.conductorMaterial === cable.conductorMaterial)
          .sort((a, b) => a.csaMm2 - b.csaMm2)
          .find((c) => c.ampacityA >= Ib);
        issues.push({
          id: `${cableNode.id}-undersized`,
          severity: 'critical',
          code: 'CABLE_UNDERSIZED',
          nodeId: cableNode.id,
          title: t('الكابل أقل من اللازم', 'Cable undersized', 'کێبڵ بچووکترە', 'Kablo yetersiz'),
          detail: t(
            `سعة الكابل ${cable.ampacityA}A أقل من تيار الحمل ${Ib.toFixed(1)}A.`,
            `Cable ampacity ${cable.ampacityA}A is below the load current ${Ib.toFixed(1)}A.`,
            `توانای کێبڵ ${cable.ampacityA}A کەمترە لە کارەبای بار ${Ib.toFixed(1)}A.`,
            `Kablo akım kapasitesi ${cable.ampacityA}A, yük akımı ${Ib.toFixed(1)}A altında.`,
          ),
          values: [
            { label: t('سعة الكابل', 'Ampacity', 'توانا', 'Kapasite'), value: `${cable.ampacityA} A` },
            { label: t('التيار', 'Current', 'کارەبا', 'Akım'), value: `${Ib.toFixed(1)} A` },
            { label: t('المقطع', 'CSA', 'پانتایی', 'Kesit'), value: `${cable.csaMm2} mm²` },
          ],
          standards: ['IEC 60364', 'IEC 60287'],
          recommendation: replacement
            ? t(`استبدل بمقطع ${replacement.csaMm2} مم².`, `Replace with ${replacement.csaMm2} mm².`, `بیگۆڕە بۆ ${replacement.csaMm2} mm².`, `${replacement.csaMm2} mm² ile değiştirin.`)
            : t('اختر مقطعاً أكبر.', 'Choose a larger CSA.', 'پانتاییەکی گەورەتر هەڵبژێرە.', 'Daha büyük kesit seçin.'),
          fix: replacement ? { kind: 'resizeCable', nodeId: cableNode.id, toCatalogId: replacement.id } : undefined,
        });
      } else {
        const vd = voltageDropPercent(cable, Ib, lengthM, circuit.voltage, circuit.phases, circuit.pf);
        const limit = circuit.load.spec.domain === 'load' && (circuit.load.spec as LoadSpec).category === 'LIGHTING' ? 3 : 5;
        if (vd > limit) {
          const replacement = cableCatalog
            .filter((c) => c.category === 'LV' && c.conductorMaterial === cable.conductorMaterial && c.csaMm2 > cable.csaMm2)
            .sort((a, b) => a.csaMm2 - b.csaMm2)
            .find((c) => voltageDropPercent(c, Ib, lengthM, circuit.voltage, circuit.phases, circuit.pf) <= limit);
          issues.push({
            id: `${cableNode.id}-vdrop`,
            severity: 'warning',
            code: 'VOLTAGE_DROP',
            nodeId: cableNode.id,
            title: t('هبوط جهد زائد', 'Excessive voltage drop', 'دابەزینی ڤۆڵتی زیاد', 'Aşırı gerilim düşümü'),
            detail: t(
              `هبوط الجهد ${vd.toFixed(1)}% يتجاوز الحد ${limit}%.`,
              `Voltage drop ${vd.toFixed(1)}% exceeds the ${limit}% limit.`,
              `دابەزینی ڤۆڵت ${vd.toFixed(1)}% لە سنووری ${limit}% تێدەپەڕێت.`,
              `Gerilim düşümü ${vd.toFixed(1)}%, ${limit}% sınırını aşıyor.`,
            ),
            values: [
              { label: t('هبوط الجهد', 'Voltage drop', 'دابەزینی ڤۆڵت', 'Gerilim düşümü'), value: `${vd.toFixed(2)} %` },
              { label: t('الطول', 'Length', 'درێژی', 'Uzunluk'), value: `${lengthM} m` },
            ],
            standards: ['IEC 60364'],
            recommendation: replacement
              ? t(`كبّر المقطع إلى ${replacement.csaMm2} مم² أو قلّل الطول.`, `Increase CSA to ${replacement.csaMm2} mm² or reduce length.`, `پانتایی زیاد بکە بۆ ${replacement.csaMm2} mm².`, `Kesiti ${replacement.csaMm2} mm² yapın veya uzunluğu azaltın.`)
              : t('قلّل طول الكابل.', 'Reduce cable length.', 'درێژی کێبڵ کەم بکەرەوە.', 'Kablo uzunluğunu azaltın.'),
            fix: replacement ? { kind: 'resizeCable', nodeId: cableNode.id, toCatalogId: replacement.id } : undefined,
          });
        }
      }
    }

    // Breaker sizing & coordination.
    for (const brNode of circuit.breakers) {
      const br = brNode.spec as ProtectionSpec;
      if (br.protectionType === 'SPD' || br.protectionType === 'RCCB') continue;

      // Undersized: In < Ib.
      if (br.ratedCurrentA < Ib) {
        const toRating = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 250, 400, 630].find((r) => r >= Ib) ?? null;
        issues.push({
          id: `${brNode.id}-undersized`,
          severity: 'critical',
          code: 'BREAKER_UNDERSIZED',
          nodeId: brNode.id,
          title: t('القاطع أقل من اللازم', 'Breaker undersized', 'برەیکەر بچووکترە', 'Kesici yetersiz'),
          detail: t(
            `تيار القاطع ${br.ratedCurrentA}A أقل من تيار الحمل ${Ib.toFixed(1)}A.`,
            `Breaker rating ${br.ratedCurrentA}A is below the load current ${Ib.toFixed(1)}A.`,
            `کارەبای برەیکەر ${br.ratedCurrentA}A کەمترە لە بار ${Ib.toFixed(1)}A.`,
            `Kesici anma akımı ${br.ratedCurrentA}A, yük akımı ${Ib.toFixed(1)}A altında.`,
          ),
          values: [
            { label: t('تيار القاطع', 'Rating In', 'In', 'Anma akımı'), value: `${br.ratedCurrentA} A` },
            { label: t('التيار', 'Current', 'کارەبا', 'Akım'), value: `${Ib.toFixed(1)} A` },
          ],
          standards: ['IEC 60898', 'IEC 60947'],
          recommendation: toRating
            ? t(`ارفع القاطع إلى ${toRating}A.`, `Increase breaker to ${toRating}A.`, `برەیکەر بەرز بکەرەوە بۆ ${toRating}A.`, `Kesiciyi ${toRating}A yapın.`)
            : t('اختر قاطعاً أكبر.', 'Choose a larger breaker.', 'برەیکەرێکی گەورەتر هەڵبژێرە.', 'Daha büyük kesici seçin.'),
          fix: toRating ? { kind: 'replaceBreaker', nodeId: brNode.id, toRating } : undefined,
        });
      }

      // Coordination with cable: In must be ≤ cable Iz.
      for (const cableNode of circuit.cables) {
        const cable = cableNode.spec as CableSpec;
        if (cable.category !== 'LV') continue;
        if (br.ratedCurrentA > cable.ampacityA) {
          issues.push({
            id: `${brNode.id}-${cableNode.id}-coord`,
            severity: 'critical',
            code: 'COORDINATION',
            nodeId: brNode.id,
            title: t('عدم تناسق حماية', 'Protection mismatch', 'ناتەبایی پاراستن', 'Koruma uyumsuzluğu'),
            detail: t(
              `تيار القاطع ${br.ratedCurrentA}A يتجاوز سعة الكابل ${cable.ampacityA}A — الكابل غير محمي.`,
              `Breaker ${br.ratedCurrentA}A exceeds cable ampacity ${cable.ampacityA}A — cable unprotected.`,
              `برەیکەر ${br.ratedCurrentA}A لە توانای کێبڵ ${cable.ampacityA}A تێدەپەڕێت.`,
              `Kesici ${br.ratedCurrentA}A, kablo kapasitesi ${cable.ampacityA}A aşıyor.`,
            ),
            values: [
              { label: t('In', 'In', 'In', 'In'), value: `${br.ratedCurrentA} A` },
              { label: t('Iz', 'Iz', 'Iz', 'Iz'), value: `${cable.ampacityA} A` },
            ],
            standards: ['IEC 60364'],
            recommendation: t('كبّر الكابل أو صغّر القاطع.', 'Increase cable or reduce breaker.', 'کێبڵ گەورە بکە یان برەیکەر بچووک بکە.', 'Kabloyu büyütün veya kesiciyi küçültün.'),
            fix: suggestCoordinationFix(brNode.id, nodes, edges),
          });
        }
      }

      // Breaking capacity vs prospective short circuit.
      const scKa = prospectiveScKa(sources.map((s) => s.spec as SourceSpec));
      if (br.breakingCapacityKA > 0 && scKa > br.breakingCapacityKA) {
        issues.push({
          id: `${brNode.id}-icu`,
          severity: 'critical',
          code: 'SHORT_CIRCUIT',
          nodeId: brNode.id,
          title: t('قدرة قطع غير كافية', 'Insufficient breaking capacity', 'توانای پچڕانی نەگونجاو', 'Yetersiz kesme kapasitesi'),
          detail: t(
            `تيار القصر المتوقع ${scKa.toFixed(1)}kA يتجاوز قدرة القطع ${br.breakingCapacityKA}kA.`,
            `Prospective Isc ${scKa.toFixed(1)}kA exceeds Icu ${br.breakingCapacityKA}kA.`,
            `Isc ${scKa.toFixed(1)}kA لە Icu ${br.breakingCapacityKA}kA تێدەپەڕێت.`,
            `Beklenen Isc ${scKa.toFixed(1)}kA, Icu ${br.breakingCapacityKA}kA aşıyor.`,
          ),
          values: [
            { label: t('Isc', 'Isc', 'Isc', 'Isc'), value: `${scKa.toFixed(1)} kA` },
            { label: t('Icu', 'Icu', 'Icu', 'Icu'), value: `${br.breakingCapacityKA} kA` },
          ],
          standards: ['IEC 60947'],
          recommendation: t('اختر قاطعاً بقدرة قطع أعلى.', 'Select a breaker with higher Icu.', 'برەیکەرێک بە Icu بەرزتر هەڵبژێرە.', 'Daha yüksek Icu’lu kesici seçin.'),
          fix: suggestShortCircuitFix(brNode.id),
        });
      }

      // Phase mismatch.
      if (br.poles === 1 && circuit.phases === 3) {
        issues.push({
          id: `${brNode.id}-phase`,
          severity: 'critical',
          code: 'PHASE_MISMATCH',
          nodeId: brNode.id,
          title: t('عدم تطابق الأطوار', 'Phase mismatch', 'ناتەبایی فاز', 'Faz uyumsuzluğu'),
          detail: t('قاطع أحادي الطور يغذي حملاً ثلاثي الأطوار.', 'A single-pole breaker feeds a three-phase load.', 'برەیکەری تەک فاز باری سێ فاز پێدەدات.', 'Tek kutuplu kesici üç fazlı yükü besliyor.'),
          values: [{ label: t('الأقطاب', 'Poles', 'جووتەکان', 'Kutuplar'), value: `${br.poles}P` }],
          standards: ['IEC 60364'],
          recommendation: t('استخدم قاطعاً 3 أو 4 أقطاب.', 'Use a 3- or 4-pole breaker.', 'برەیکەری 3 یان 4 جووت بەکاربهێنە.', '3 veya 4 kutuplu kesici kullanın.'),
          fix: suggestPhaseFix(brNode.id),
        });
      }
    }
  }

  // ---- System-level checks ----
  // Grounding / surge protection presence.
  const hasSpd = nodes.some((n) => n.spec.domain === 'protection' && (n.spec as ProtectionSpec).protectionType === 'SPD');
  if (sources.length > 0 && !hasSpd) {
    issues.push({
      id: 'system-no-grounding',
      severity: 'critical',
      code: 'MISSING_GROUNDING',
      title: t('حماية أرضي/صواعق مفقودة', 'Missing earthing / surge protection', 'پاراستنی ئەرز/برووسکە نییە', 'Topraklama / parafudr eksik'),
      detail: t(
        'لا يوجد جهاز حماية من الصواعق (SPD) في التصميم.',
        'No surge protection device (SPD) present in the design.',
        'هیچ ئامێری پاراستنی برووسکە (SPD) لە دیزایندا نییە.',
        'Tasarımda parafudr (SPD) bulunmuyor.',
      ),
      values: [],
      standards: ['IEC 60364', 'NFPA 70'],
      recommendation: t('أضف جهاز SPD نوع 2 عند اللوحة الرئيسية.', 'Add a Type 2 SPD at the main board.', 'SPD جۆری 2 لە تابلۆی سەرەکی زیاد بکە.', 'Ana panoya Tip 2 SPD ekleyin.'),
      fix: { kind: 'addGrounding' },
    });
  }

  // Source capacity vs total connected demand.
  if (sources.length > 0) {
    const totalKva = sources.reduce((s, n) => s + (n.spec as SourceSpec).ratedKva, 0);
    let demandKva = 0;
    for (const c of circuits) {
      const el = loadElectricals(c.load);
      if (!el) continue;
      const df = c.load.spec.domain === 'load' ? (c.load.spec as LoadSpec).demandFactor : 1;
      demandKva += apparentKva(el.p * df, el.pf);
    }
    if (demandKva > totalKva && totalKva > 0) {
      issues.push({
        id: 'system-overload',
        severity: 'critical',
        code: 'PANEL_OVERLOAD',
        title: t('تحميل زائد على المصدر', 'Source overloaded', 'بارگرانی سەرچاوە', 'Kaynak aşırı yüklü'),
        detail: t(
          `الطلب ${demandKva.toFixed(1)}kVA يتجاوز قدرة المصادر ${totalKva.toFixed(1)}kVA.`,
          `Demand ${demandKva.toFixed(1)}kVA exceeds source capacity ${totalKva.toFixed(1)}kVA.`,
          `داواکاری ${demandKva.toFixed(1)}kVA لە توانای سەرچاوە ${totalKva.toFixed(1)}kVA تێدەپەڕێت.`,
          `Talep ${demandKva.toFixed(1)}kVA, kaynak kapasitesi ${totalKva.toFixed(1)}kVA aşıyor.`,
        ),
        values: [
          { label: t('الطلب', 'Demand', 'داواکاری', 'Talep'), value: `${demandKva.toFixed(1)} kVA` },
          { label: t('القدرة', 'Capacity', 'توانا', 'Kapasite'), value: `${totalKva.toFixed(1)} kVA` },
        ],
        standards: ['IEC 60364'],
        recommendation: t('زد قدرة المصدر أو وزّع الأحمال.', 'Increase source capacity or split loads.', 'توانای سەرچاوە زیاد بکە یان بارەکان دابەش بکە.', 'Kaynak kapasitesini artırın veya yükleri bölün.'),
        fix: suggestPanelOverloadFix(),
      });
    } else if (demandKva > totalKva * 0.8 && totalKva > 0) {
      issues.push({
        id: 'system-reserve',
        severity: 'warning',
        code: 'LOW_RESERVE',
        title: t('احتياطي طاقة منخفض', 'Low power reserve', 'یەدەگی وزە نزم', 'Düşük güç rezervi'),
        detail: t('المصدر يعمل فوق 80% من قدرته.', 'Source is loaded above 80% of capacity.', 'سەرچاوە لە سەرووی ٪٨٠ی تواناییەوەیە.', 'Kaynak kapasitesinin %80 üzerinde yüklü.'),
        values: [
          { label: t('النسبة', 'Utilisation', 'ڕێژە', 'Kullanım'), value: `${((demandKva / totalKva) * 100).toFixed(0)} %` },
        ],
        standards: ['IEC 60364'],
        recommendation: t('احتفظ باحتياطي 20% على الأقل.', 'Keep at least 20% reserve.', 'لانیکەم ٪٢٠ یەدەگ بهێڵەرەوە.', 'En az %20 rezerv bırakın.'),
      });
    }
  }

  // ---- Recommendations: HVAC efficiency ----
  for (const n of nodes) {
    if (n.spec.domain === 'hvac') {
      const h = n.spec as HvacSpec;
      if (h.eer > 0 && h.eer < 3.2) {
        issues.push({
          id: `${n.id}-eer`,
          severity: 'recommendation',
          code: 'HVAC_EFFICIENCY',
          nodeId: n.id,
          title: t('كفاءة تكييف منخفضة', 'Low HVAC efficiency', 'کارایی نزمی HVAC', 'Düşük HVAC verimi'),
          detail: t(
            `معامل الكفاءة EER=${h.eer} منخفض.`,
            `Efficiency EER=${h.eer} is low.`,
            `کارایی EER=${h.eer} نزمە.`,
            `Verimlilik EER=${h.eer} düşük.`,
          ),
          values: [{ label: t('EER', 'EER', 'EER', 'EER'), value: `${h.eer}` }],
          standards: ['ASHRAE'],
          recommendation: t('اختر وحدة بكفاءة EER ≥ 3.5 لتوفير الطاقة.', 'Choose a unit with EER ≥ 3.5 to save energy.', 'یەکەیەک بە EER ≥ 3.5 هەڵبژێرە.', 'Enerji tasarrufu için EER ≥ 3.5 seçin.'),
          fix: suggestHvacFix(n.id, nodes),
        });
      }
    }
  }

  return { issues, circuits };
}
