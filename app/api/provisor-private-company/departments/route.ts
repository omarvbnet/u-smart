import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  CAN_MANAGE_STAFF_ROLES,
  getPrivateCompanyMembership,
} from '@/lib/private-company-context';
import {
  deleteDepartmentTechniqueRows,
  upsertDepartmentTechniqueRows,
} from '@/lib/private-company-department-techniques';
import {
  normalizeMaintenanceDispatchMode,
} from '@/lib/private-company-maintenance-dispatch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const DEFAULT_COLORS = ['#6C63FF', '#00D4AA', '#FBBF24', '#38BDF8', '#FF9F43', '#A78BFA', '#4ADE80', '#FF4757'];

/**
 * Department mutations are workspace-wide structural changes, so we restrict
 * them to the workspace OWNER (the COMPANY-role requester). Managers and
 * coordinators can only manage staff inside existing departments.
 */
async function ownerOnly(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.ownedCompanyId || m.ownedCompanyStatus !== 'APPROVED') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: 'Only the workspace owner can manage departments.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, requesterId: auth.payload.requesterId, companyId: m.ownedCompanyId };
}

const DEPT_FIELD_SETTING_KEYS = new Set([
  'id',
  'maintenanceProximityJoinEnabled',
  'maintenanceProximityRadiusM',
  'siteArrivalAutoOnSiteEnabled',
]);

async function departmentSettingsGuard(req: NextRequest, body: Record<string, unknown>) {
  const keys = Object.keys(body);
  const fieldOnly = keys.length > 0 && keys.every((k) => DEPT_FIELD_SETTING_KEYS.has(k));
  if (!fieldOnly) {
    return { ...(await ownerOnly(req)), fieldOnly: false as const };
  }
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }),
      fieldOnly: true as const,
    };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 }),
      fieldOnly: true as const,
    };
  }
  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  if (isOwner) {
    return {
      ok: true as const,
      companyId: m.effectiveCompanyId,
      isOwner: true as const,
      actorDepartmentId: null as string | null,
      fieldOnly: true as const,
    };
  }
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true, privateCompanyDepartmentId: true },
  });
  const actorRole = String(me?.role ?? '').toUpperCase();
  if (!CAN_MANAGE_STAFF_ROLES.has(actorRole)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: 'Only the owner, managers, or coordinators can update field settings.' },
        { status: 403 }
      ),
      fieldOnly: true as const,
    };
  }
  return {
    ok: true as const,
    companyId: m.effectiveCompanyId,
    isOwner: false as const,
    actorDepartmentId: me?.privateCompanyDepartmentId ?? null,
    fieldOnly: true as const,
  };
}

/** GET — list departments for the workspace (owner OR staff). */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 404 });
  const departments = await prisma.privateCompanyDepartment.findMany({
    where: { companyId: m.effectiveCompanyId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      iconKey: true,
      sortOrder: true,
      createdAt: true,
      maintenanceProximityJoinEnabled: true,
      maintenanceProximityRadiusM: true,
      siteArrivalAutoOnSiteEnabled: true,
      engineerAvailabilityPoolEnabled: true,
      technicianAvailabilityPoolEnabled: true,
      maintenanceDispatchMode: true,
      members: {
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          specialization: true,
          status: true,
        },
      },
      _count: { select: { members: true } },
    },
  });
  return NextResponse.json({ success: true, departments });
}

/** POST — owner creates a department. */
export async function POST(req: NextRequest) {
  const guard = await ownerOnly(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ success: false, message: 'Name is required.' }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ success: false, message: 'Name is too long.' }, { status: 400 });
  }
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const color = typeof body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color.trim())
    ? body.color.trim()
    : DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
  const iconKey = typeof body?.iconKey === 'string' ? body.iconKey.trim() || null : null;
  const lastSort = await prisma.privateCompanyDepartment.findFirst({
    where: { companyId: guard.companyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const engineerPool =
    body?.engineerAvailabilityPoolEnabled === undefined
      ? undefined
      : body.engineerAvailabilityPoolEnabled === true;
  const technicianPool =
    body?.technicianAvailabilityPoolEnabled === undefined
      ? undefined
      : body.technicianAvailabilityPoolEnabled === true;
  const dispatchMode = normalizeMaintenanceDispatchMode(body?.maintenanceDispatchMode);
  try {
    const dept = await prisma.privateCompanyDepartment.create({
      data: {
        companyId: guard.companyId,
        name,
        description: description || null,
        color,
        iconKey,
        sortOrder: (lastSort?.sortOrder ?? -1) + 1,
        maintenanceDispatchMode: dispatchMode,
        ...(engineerPool !== undefined ? { engineerAvailabilityPoolEnabled: engineerPool } : {}),
        ...(technicianPool !== undefined ? { technicianAvailabilityPoolEnabled: technicianPool } : {}),
      },
    });
    try {
      await upsertDepartmentTechniqueRows(prisma, {
        companyId: guard.companyId,
        departmentId: dept.id,
        departmentName: name,
        sortOrder: dept.sortOrder ?? 0,
      });
    } catch (e) {
      console.error('Department technique sync (create):', e);
    }
    return NextResponse.json({ success: true, department: dept });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('POST departments:', err);
    return NextResponse.json({ success: false, message: 'Failed to create department.' }, { status: 500 });
  }
}

/** PATCH — owner updates a department; managers/coordinators may patch field proximity settings for their department only. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await departmentSettingsGuard(req, body);
  if (!guard.ok) return guard.response;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  if (guard.fieldOnly && !guard.isOwner) {
    if (!guard.actorDepartmentId || guard.actorDepartmentId !== id) {
      return NextResponse.json(
        { success: false, message: 'You can only update field settings for your own department.' },
        { status: 403 }
      );
    }
  }
  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, name: true, sortOrder: true },
  });
  if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (!guard.fieldOnly) {
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.description === 'string') data.description = body.description.trim() || null;
    if (typeof body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color.trim())) data.color = body.color.trim();
    if (typeof body?.iconKey === 'string') data.iconKey = body.iconKey.trim() || null;
    if (Number.isFinite(body?.sortOrder)) data.sortOrder = Math.max(0, Math.floor(Number(body.sortOrder)));
    if (body?.engineerAvailabilityPoolEnabled !== undefined) {
      data.engineerAvailabilityPoolEnabled = body.engineerAvailabilityPoolEnabled === true;
    }
    if (body?.technicianAvailabilityPoolEnabled !== undefined) {
      data.technicianAvailabilityPoolEnabled = body.technicianAvailabilityPoolEnabled === true;
    }
    if (body?.maintenanceDispatchMode !== undefined) {
      data.maintenanceDispatchMode = normalizeMaintenanceDispatchMode(body.maintenanceDispatchMode);
    }
  }
  if (body?.maintenanceProximityJoinEnabled !== undefined) {
    data.maintenanceProximityJoinEnabled = body.maintenanceProximityJoinEnabled === true;
  }
  if (body?.maintenanceProximityRadiusM !== undefined && Number.isFinite(body.maintenanceProximityRadiusM)) {
    data.maintenanceProximityRadiusM = Math.max(
      10,
      Math.min(5000, Math.floor(Number(body.maintenanceProximityRadiusM)))
    );
  }
  if (body?.siteArrivalAutoOnSiteEnabled !== undefined) {
    if (body.siteArrivalAutoOnSiteEnabled === null) {
      data.siteArrivalAutoOnSiteEnabled = null;
    } else {
      data.siteArrivalAutoOnSiteEnabled = body.siteArrivalAutoOnSiteEnabled === true;
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
  }
  try {
    const updated = await prisma.privateCompanyDepartment.update({ where: { id }, data });
    if (!guard.fieldOnly) {
      try {
        await upsertDepartmentTechniqueRows(prisma, {
          companyId: guard.companyId,
        departmentId: id,
        departmentName: String(updated.name ?? dept.name ?? ''),
        sortOrder: typeof updated.sortOrder === 'number' ? updated.sortOrder : Number(dept.sortOrder ?? 0),
      });
      } catch (e) {
        console.error('Department technique sync (update):', e);
      }
    }
    return NextResponse.json({ success: true, department: updated });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('PATCH departments:', err);
    return NextResponse.json({ success: false, message: 'Failed to update department.' }, { status: 500 });
  }
}

/** DELETE — owner removes a department (and unlinks members). */
export async function DELETE(req: NextRequest) {
  const guard = await ownerOnly(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  try {
    await deleteDepartmentTechniqueRows(prisma, guard.companyId, id);
  } catch (e) {
    console.error('Department technique delete:', e);
  }
  await prisma.privateCompanyDepartment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
