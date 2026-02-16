import { KPIStatus } from '@prisma/client';

/**
 * Compute KPI status from target vs actual. Optional threshold for "at risk" (default 80% of target).
 */
export function computeKPIStatus(
  actualValue: number,
  targetValue: number,
  riskThresholdRatio: number = 0.8
): KPIStatus {
  if (targetValue <= 0) return actualValue >= 0 ? KPIStatus.ON_TRACK : KPIStatus.FAILED;
  const ratio = actualValue / targetValue;
  if (ratio >= 1) return KPIStatus.ON_TRACK;
  if (ratio >= riskThresholdRatio) return KPIStatus.AT_RISK;
  return KPIStatus.FAILED;
}
