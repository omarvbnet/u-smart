import { NextResponse } from 'next/server';

export type ParsePeriodResult =
  | { ok: true; from: Date; to: Date }
  | { ok: false; message: string };

/**
 * Parse optional `from` + `to` (YYYY-MM-DD, inclusive) or fall back to rolling `days` window ending now.
 */
export function parseAnalyticsPeriod(url: URL): ParsePeriodResult {
  const fromParam = url.searchParams.get('from')?.trim() || null;
  const toParam = url.searchParams.get('to')?.trim() || null;
  const daysRaw = Number(url.searchParams.get('days') ?? '90');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 730) : 90;

  if (fromParam && toParam) {
    const fromNorm = fromParam.includes('T') ? fromParam : `${fromParam}T00:00:00.000Z`;
    const toNorm = toParam.includes('T') ? toParam : `${toParam}T23:59:59.999Z`;
    const from = new Date(fromNorm);
    const to = new Date(toNorm);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      return { ok: false, message: 'Invalid from or to date.' };
    }
    if (from > to) {
      return { ok: false, message: 'from must be before or equal to to.' };
    }
    const spanDays = (to.getTime() - from.getTime()) / 86400000;
    if (spanDays > 370) {
      return { ok: false, message: 'Date range cannot exceed 370 days.' };
    }
    return { ok: true, from, to };
  }

  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  return { ok: true, from, to };
}

export function analyticsPeriodBadRequest(message: string): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive calendar-day count between UTC date parts of [from] and [to]. */
export function inclusiveUtcDayCount(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86400000) + 1;
}
