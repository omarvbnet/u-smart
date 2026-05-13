import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
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

function isMissingProvisorTechniquesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (!('code' in error) || (error as { code?: string }).code !== 'P2021') return false;
  const meta = (error as { meta?: { table?: string } }).meta;
  const table = typeof meta?.table === 'string' ? meta.table : '';
  return table.includes('provisor_techniques');
}

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

function defaultRowsAsRowArray(): Row[] {
  const qc = DEFAULT_INSPECTION_TECHNIQUES.map((t, i) => ({
    id: `default-qc-${t.slug}`,
    category: 'INSPECTION_QC',
    slug: t.slug,
    labelAr: t.labelAr,
    labelEn: (t.labelEn ?? null) as string | null,
    sortOrder: t.sortOrder ?? i,
    active: true,
  }));
  const mt = DEFAULT_MAINTENANCE_TECHNIQUES.map((t, i) => ({
    id: `default-m-${t.slug}`,
    category: 'MAINTENANCE',
    slug: t.slug,
    labelAr: t.labelAr,
    labelEn: (t.labelEn ?? null) as string | null,
    sortOrder: t.sortOrder ?? i,
    active: true,
  }));
  return [...qc, ...mt];
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

/** Workspace rows override global rows when category+slug match. */
function mergeWorkspaceTechniques(globalRows: Row[], workspaceRows: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const r of globalRows) map.set(`${r.category}:${r.slug}`, r);
  for (const r of workspaceRows) map.set(`${r.category}:${r.slug}`, r);
  return [...map.values()];
}

function workspaceTechniqueWhereClause(
  companyId: string,
  isWorkspaceOwner: boolean,
  viewerDepartmentId: string | null
): Record<string, unknown> {
  if (isWorkspaceOwner) {
    return { companyId, active: true };
  }
  const or: Array<{ departmentId: null } | { departmentId: string }> = [{ departmentId: null }];
  if (viewerDepartmentId) or.push({ departmentId: viewerDepartmentId });
  return { companyId, active: true, OR: or };
}

/** Authenticated Provisor / web QC dashboard: list techniques for forms. */
export async function GET(_req: NextRequest) {
  const auth = getRequesterFromRequest(_req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    let globalRows: Row[] = [];
    let globalFromDb = false;
    try {
      globalRows = (await prisma.provisorTechnique.findMany({
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
      })) as Row[];
      globalFromDb = globalRows.length > 0;
    } catch (inner: unknown) {
      if (!isMissingProvisorTechniquesTable(inner)) throw inner;
      globalRows = [];
    }

    if (!globalRows.length) {
      globalRows = defaultRowsAsRowArray();
    }

    const membership = await getPrivateCompanyMembership(auth.payload.requesterId);
    let workspaceCompanyId: string | null = null;
    let isWorkspaceOwner = false;
    const viewerDepartmentId = membership.departmentId;
    if (membership.effectiveCompanyId) {
      const comp = await prisma.privateCompany.findUnique({
        where: { id: membership.effectiveCompanyId },
        select: { status: true },
      });
      if (comp?.status === 'APPROVED') {
        workspaceCompanyId = membership.effectiveCompanyId;
        isWorkspaceOwner =
          membership.ownedCompanyId === membership.effectiveCompanyId &&
          membership.ownedCompanyStatus === 'APPROVED';
      }
    }

    let workspaceRows: Row[] = [];
    if (workspaceCompanyId) {
      try {
        const delegate = (prisma as any).privateCompanyTechnique;
        if (delegate?.findMany) {
          const raw = await delegate.findMany({
            where: workspaceTechniqueWhereClause(workspaceCompanyId, isWorkspaceOwner, viewerDepartmentId),
            orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
          });
          workspaceRows = (raw as Row[]).map((r) => ({
            id: r.id,
            category: String(r.category),
            slug: r.slug,
            labelAr: r.labelAr,
            labelEn: r.labelEn ?? null,
            sortOrder: r.sortOrder ?? 0,
            active: r.active !== false,
          }));
        }
      } catch {
        /* table may be missing before migrate */
      }
    }

    const merged = mergeWorkspaceTechniques(globalRows, workspaceRows);
    const { inspection, maintenance } = toPayload(merged);
    return NextResponse.json({
      success: true,
      inspection,
      maintenance,
      fromDefaults: !globalFromDb,
    });
  } catch (e) {
    if (isMissingProvisorTechniquesTable(e)) {
      console.warn('GET /api/provisor-techniques: table missing, serving defaults');
      return NextResponse.json({ success: true, ...defaultPayload(), tableMissing: true });
    }
    console.error('GET /api/provisor-techniques:', e);
    return NextResponse.json({ success: false, message: 'Failed to load techniques' }, { status: 500 });
  }
}
