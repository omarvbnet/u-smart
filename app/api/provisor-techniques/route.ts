import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  DEFAULT_INSPECTION_TECHNIQUES,
  DEFAULT_MAINTENANCE_TECHNIQUES,
} from '@/lib/provisor-technique-defaults';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type Row = {
  id: string;
  category: string;
  slug: string;
  labelAr: string;
  labelEn: string | null;
  sortOrder: number;
  active: boolean;
};

function toPayload(rows: Row[]) {
  const inspection = rows
    .filter((r) => r.category === 'INSPECTION_QC' && r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      labelAr: r.labelAr,
      labelEn: r.labelEn,
      sortOrder: r.sortOrder,
    }));
  const maintenance = rows
    .filter((r) => r.category === 'MAINTENANCE' && r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      labelAr: r.labelAr,
      labelEn: r.labelEn,
      sortOrder: r.sortOrder,
    }));
  return { inspection, maintenance };
}

function defaultPayload() {
  return {
    inspection: DEFAULT_INSPECTION_TECHNIQUES.map((t, i) => ({
      id: `default-qc-${t.slug}`,
      slug: t.slug,
      labelAr: t.labelAr,
      labelEn: t.labelEn,
      sortOrder: t.sortOrder ?? i,
    })),
    maintenance: DEFAULT_MAINTENANCE_TECHNIQUES.map((t, i) => ({
      id: `default-m-${t.slug}`,
      slug: t.slug,
      labelAr: t.labelAr,
      labelEn: t.labelEn,
      sortOrder: t.sortOrder ?? i,
    })),
    fromDefaults: true,
  };
}

/** Authenticated Provisor / web QC dashboard: list techniques for forms. */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const rows = (await prisma.provisorTechnique.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
    })) as Row[];

    if (!rows.length) {
      return NextResponse.json({ success: true, ...defaultPayload() });
    }

    const { inspection, maintenance } = toPayload(rows);
    return NextResponse.json({
      success: true,
      inspection,
      maintenance,
      fromDefaults: false,
    });
  } catch (e) {
    // Table may not exist yet — serve hard-coded defaults so the app stays functional
    console.warn('GET /api/provisor-techniques: table unavailable, serving defaults.', (e as Error)?.message);
    return NextResponse.json({ success: true, ...defaultPayload() });
  }
}
