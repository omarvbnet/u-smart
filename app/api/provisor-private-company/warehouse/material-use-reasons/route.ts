import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';
import { logPrivateCompanyWorkspaceActivity } from '@/lib/private-company-workspace-log';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const CAN_EDIT_REASONS = new Set(['COMPANY', 'MANAGER', 'COORDINATOR']);

function normalizeReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (typeof e !== 'string') continue;
    const s = e.trim();
    if (!s || s.length > 200) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 80) break;
  }
  return out;
}

/**
 * GET /api/provisor-private-company/warehouse/material-use-reasons
 * PATCH body: { reasons: string[] } — owner, manager, or coordinator only.
 */
export async function GET(_req: NextRequest) {
  const guard = await warehouseGuard(_req);
  if (!guard.ok) return guard.response;
  const row = await prisma.privateCompany.findUnique({
    where: { id: guard.companyId },
    select: { materialUseReasons: true },
  });
  const reasons = Array.isArray(row?.materialUseReasons)
    ? (row.materialUseReasons as string[]).map((s) => String(s).trim()).filter(Boolean)
    : [];
  return NextResponse.json({ success: true, reasons });
}

export async function PATCH(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  if (!guard.isOwner && !CAN_EDIT_REASONS.has(guard.actorRole)) {
    return NextResponse.json(
      { success: false, message: 'Only the workspace owner, manager, or coordinator can edit material reasons.' },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const reasons = normalizeReasons(body?.reasons);
  await prisma.privateCompany.update({
    where: { id: guard.companyId },
    data: { materialUseReasons: reasons },
  });
  logPrivateCompanyWorkspaceActivity({
    companyId: guard.companyId,
    actorRequesterId: guard.requesterId,
    action: 'WORKSPACE_SETTINGS_CHANGED',
    resourceType: 'workspace',
    resourceId: guard.companyId,
    summary: `Updated material use reasons (${reasons.length})`,
    departmentId: guard.actorDepartmentId,
  });
  return NextResponse.json({ success: true, reasons });
}
