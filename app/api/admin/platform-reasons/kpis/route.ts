import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const KINDS = ['MAINTENANCE', 'EXPENSE'] as const;
const AUDIENCES = ['INDIVIDUAL', 'COMPANY', 'BOTH'] as const;

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return false;
  return true;
}

/**
 * Aggregated KPIs for platform reasons.
 * Filter params: kind (MAINTENANCE|EXPENSE), audience (INDIVIDUAL|COMPANY|BOTH).
 * Returns labels and counters; activation toggling lives on the row itself.
 */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const audience = sp.get('audience');
  const where: any = {};
  if (kind && (KINDS as readonly string[]).includes(kind)) where.kind = kind;
  if (audience && (AUDIENCES as readonly string[]).includes(audience)) where.audience = audience;
  try {
    const rows = await prisma.platformReason.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { label: 'asc' }],
    });
    const totalUsage = rows.reduce((acc: number, r: any) => acc + (r.usageCount ?? 0), 0);
    return NextResponse.json({
      success: true,
      totalUsage,
      reasons: rows.map((r: any) => ({
        id: r.id,
        kind: r.kind,
        audience: r.audience,
        label: r.label,
        active: r.active,
        usageCount: r.usageCount ?? 0,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/platform-reasons/kpis:', err);
    return NextResponse.json(
      { success: true, totalUsage: 0, reasons: [] }
    );
  }
}
