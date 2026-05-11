import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  CAN_MANAGE_STAFF_ROLES,
  getPrivateCompanyMembership,
  MANAGER_CAN_GRANT_STAFF_ROLES,
  PRIVATE_COMPANY_STAFF_ROLES,
} from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_SPECIALIZATIONS = ['ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER'] as const;

const IRAQ_PROVINCES = [
  'Al-Anbar',
  'Babil',
  'Baghdad',
  'Basra',
  'Dhi Qar',
  'Al-Qadisiyyah',
  'Diyala',
  'Duhok',
  'Erbil',
  'Halabja',
  'Karbala',
  'Kirkuk',
  'Maysan',
  'Muthanna',
  'Najaf',
  'Ninawa',
  'Salah Al-Din',
  'Sulaymaniyah',
  'Wasit',
] as const;

const IRAQ_PROVINCE_SET = new Set<string>(IRAQ_PROVINCES);

function normalizeProvinceOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Case-insensitive lookup so the client can send any casing.
  const hit = IRAQ_PROVINCES.find((p) => p.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}

function buildUsernameBase(firstName: string): string {
  const cleaned = firstName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  return cleaned || 'staff';
}

async function generateUniqueUsername(firstName: string): Promise<string> {
  const base = buildUsernameBase(firstName);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
    const existing = await prisma.ticketRequester.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(6).toString('base64url');
}

async function ownerGuard(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.ownedCompanyId || m.ownedCompanyStatus !== 'APPROVED') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: 'No approved workspace.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, requesterId: auth.payload.requesterId, companyId: m.ownedCompanyId, isOwner: true as const };
}

/**
 * Allows the owner OR a MANAGER / COORDINATOR staff member of an APPROVED
 * workspace. Used for non-destructive staff management (create / edit /
 * reset password / soft-suspend).
 *
 * The returned `isOwner` flag and `actorDepartmentId` let callers enforce the
 * additional rule that managers / coordinators may only act on staff inside
 * their OWN department.
 */
async function managerGuard(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 }) };
  }
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { status: true },
  });
  if (!company || company.status !== 'APPROVED') {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 }) };
  }
  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  let actorRole = 'COMPANY';
  if (!isOwner) {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true },
    });
    actorRole = String(me?.role ?? '').toUpperCase();
    if (!CAN_MANAGE_STAFF_ROLES.has(actorRole)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { success: false, message: 'Only the owner, managers, or coordinators can manage staff.' },
          { status: 403 }
        ),
      };
    }
  }
  return {
    ok: true as const,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner,
    actorRole,
    actorDepartmentId: m.departmentId ?? null,
  };
}

/**
 * GET — list staff (and the owner, marked) inside the workspace.
 *
 * Visibility rules:
 *   • Owner:                       sees every staff member.
 *   • Manager / Coordinator:       sees only staff in the SAME department.
 *   • Engineer / Technician / Worker: same — only their department.
 *   • Department-less staff:       sees only themselves.
 */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 404 });
  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  const staffWhere: Record<string, unknown> | undefined = isOwner
    ? undefined
    : m.departmentId
      ? { privateCompanyDepartmentId: m.departmentId }
      : { id: auth.payload.requesterId };
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: {
      id: true,
      ownerRequesterId: true,
      owner: {
        select: { id: true, username: true, name: true, email: true, phone: true, role: true, status: true },
      },
      staff: {
        where: staffWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          specialization: true,
          status: true,
          province: true,
          provinceFilterActive: true,
          privateCompanyDepartmentId: true,
          createdAt: true,
        },
      },
    },
  });
  if (!company) return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 404 });
  return NextResponse.json({
    success: true,
    owner: company.owner,
    staff: company.staff,
  });
}

/** POST — owner / manager / coordinator creates a staff requester account. */
export async function POST(req: NextRequest) {
  const guard = await managerGuard(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const roleRaw = typeof body?.role === 'string' ? body.role.trim().toUpperCase() : '';
  const departmentId = typeof body?.departmentId === 'string' ? body.departmentId.trim() : '';
  const specRaw = typeof body?.specialization === 'string' ? body.specialization.trim().toUpperCase() : '';
  const specialization = VALID_SPECIALIZATIONS.includes(specRaw as (typeof VALID_SPECIALIZATIONS)[number])
    ? specRaw
    : null;
  // Province is REQUIRED on every workspace staff member so ticket and
  // announcement notifications can be routed by governorate.
  const province = normalizeProvinceOrNull(body?.province);

  if (!firstName) {
    return NextResponse.json({ success: false, message: 'First name is required.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ success: false, message: 'A phone number or email is required.' }, { status: 400 });
  }
  if (!province) {
    return NextResponse.json(
      {
        success: false,
        message: `Province is required and must be one of ${IRAQ_PROVINCES.join(', ')}.`,
      },
      { status: 400 }
    );
  }
  const role = (PRIVATE_COMPANY_STAFF_ROLES as readonly string[]).includes(roleRaw) ? roleRaw : '';
  if (!role) {
    return NextResponse.json(
      {
        success: false,
        message: `Role must be one of ${PRIVATE_COMPANY_STAFF_ROLES.join(', ')}.`,
      },
      { status: 400 }
    );
  }

  // Managers / coordinators are scoped to their own department and may only
  // grant the "execution" roles (ENGINEER / TECHNICIAN / WORKER). Promoting a
  // staff member to MANAGER or COORDINATOR is reserved for the workspace owner.
  let effectiveDepartmentId = departmentId;
  if (!guard.isOwner) {
    if (!MANAGER_CAN_GRANT_STAFF_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Managers and coordinators can only add engineers, technicians, or workers.',
        },
        { status: 403 }
      );
    }
    if (!guard.actorDepartmentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'You must belong to a department before adding staff. Ask the owner to assign you to one.',
        },
        { status: 400 }
      );
    }
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'You can only add staff to your own department.',
        },
        { status: 403 }
      );
    }
    effectiveDepartmentId = guard.actorDepartmentId;
  }

  if (effectiveDepartmentId) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: effectiveDepartmentId, companyId: guard.companyId },
      select: { id: true },
    });
    if (!dept) {
      return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
    }
  }
  if (email) {
    const existing = await prisma.ticketRequester.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, message: 'Email is already in use.' }, { status: 409 });
    }
  }

  const username = await generateUniqueUsername(firstName);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || firstName;

  const created = await prisma.ticketRequester.create({
    data: {
      username,
      passwordHash,
      name: fullName,
      email: email || null,
      phone: phone || `+0000${Math.random().toString().slice(2, 9)}`,
      role,
      specialization,
      province,
      provinceFilterActive: true,
      privateCompanyId: guard.companyId,
      privateCompanyDepartmentId: effectiveDepartmentId || null,
      status: 'ACTIVE',
      mustChangePassword: true,
      hasUpdatedCredentials: false,
      serviceSlug: 'quality-control-supervision',
      verificationStatus: 'APPROVED',
      verifiedAt: new Date(),
    },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      specialization: true,
      status: true,
      province: true,
      provinceFilterActive: true,
      privateCompanyDepartmentId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    user: created,
    credentials: { username: created.username, temporaryPassword, mustChangePassword: true },
  });
}

/** PATCH — owner / manager / coordinator updates a staff member
 *  (role / department / specialization / status), or resets their password
 *  by passing `{ id, resetPassword: true }`. The new temporary password is
 *  returned only once in the response. */
export async function PATCH(req: NextRequest) {
  const guard = await managerGuard(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const target = await prisma.ticketRequester.findFirst({
    where: { id, privateCompanyId: guard.companyId },
    select: {
      id: true,
      username: true,
      role: true,
      privateCompanyDepartmentId: true,
    },
  });
  if (!target) return NextResponse.json({ success: false, message: 'Staff not found.' }, { status: 404 });

  // Managers / coordinators can only touch staff in their own department, and
  // can never edit fellow managers / coordinators (those are owner-only edits).
  if (!guard.isOwner) {
    if (
      !guard.actorDepartmentId ||
      target.privateCompanyDepartmentId !== guard.actorDepartmentId
    ) {
      return NextResponse.json(
        { success: false, message: 'You can only manage staff in your own department.' },
        { status: 403 }
      );
    }
    const targetRole = String(target.role ?? '').toUpperCase();
    if (!MANAGER_CAN_GRANT_STAFF_ROLES.has(targetRole)) {
      return NextResponse.json(
        { success: false, message: 'Only the owner can edit managers or coordinators.' },
        { status: 403 }
      );
    }
  }

  // Branch: password reset — generates a new temp password, marks the staff member
  // as needing a forced change on next login, and returns the new password ONCE.
  if (body?.resetPassword === true) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const updated = await prisma.ticketRequester.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        hasUpdatedCredentials: false,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        specialization: true,
        status: true,
        privateCompanyDepartmentId: true,
      },
    });
    return NextResponse.json({
      success: true,
      user: updated,
      credentials: {
        username: updated.username,
        temporaryPassword,
        mustChangePassword: true,
      },
    });
  }

  const data: Record<string, unknown> = {};
  if (typeof body?.role === 'string') {
    const r = body.role.trim().toUpperCase();
    if ((PRIVATE_COMPANY_STAFF_ROLES as readonly string[]).includes(r)) {
      // Only the owner can change a staff member's role at all, and even then
      // a manager / coordinator may not promote anyone above their own scope.
      if (guard.isOwner) {
        data.role = r;
      } else if (MANAGER_CAN_GRANT_STAFF_ROLES.has(r)) {
        data.role = r;
      } else {
        return NextResponse.json(
          {
            success: false,
            message:
              'Only the workspace owner can assign the warehouse keeper role or promote to manager or coordinator.',
          },
          { status: 403 }
        );
      }
    }
  }
  if (typeof body?.departmentId === 'string') {
    const did = body.departmentId.trim();
    if (did) {
      // Managers / coordinators can only ever (re)assign staff to their OWN
      // department — they cannot move someone out of their team.
      if (!guard.isOwner && did !== guard.actorDepartmentId) {
        return NextResponse.json(
          { success: false, message: 'You can only assign staff to your own department.' },
          { status: 403 }
        );
      }
      const dept = await prisma.privateCompanyDepartment.findFirst({
        where: { id: did, companyId: guard.companyId },
        select: { id: true },
      });
      if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
      data.privateCompanyDepartmentId = did;
    } else if (guard.isOwner) {
      data.privateCompanyDepartmentId = null;
    } else {
      return NextResponse.json(
        { success: false, message: 'Only the owner can detach a staff member from a department.' },
        { status: 403 }
      );
    }
  }
  if (typeof body?.specialization === 'string') {
    const s = body.specialization.trim().toUpperCase();
    data.specialization = VALID_SPECIALIZATIONS.includes(s as (typeof VALID_SPECIALIZATIONS)[number])
      ? s
      : null;
  }
  if (typeof body?.status === 'string') {
    const s = body.status.trim().toUpperCase();
    if (['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(s)) data.status = s;
  }
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (body?.province !== undefined) {
    const p = normalizeProvinceOrNull(body.province);
    if (!p) {
      return NextResponse.json(
        {
          success: false,
          message: `Province must be one of ${IRAQ_PROVINCES.join(', ')}.`,
        },
        { status: 400 }
      );
    }
    data.province = p;
  }
  if (body?.provinceFilterActive !== undefined) {
    data.provinceFilterActive = body.provinceFilterActive === true;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
  }
  const updated = await prisma.ticketRequester.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      specialization: true,
      status: true,
      province: true,
      provinceFilterActive: true,
      privateCompanyDepartmentId: true,
    },
  });
  return NextResponse.json({ success: true, user: updated });
}

/** DELETE — soft-remove (any manager-level user) or hard-delete (owner only). */
export async function DELETE(req: NextRequest) {
  const guard = await managerGuard(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const hard = searchParams.get('hard') === '1';
  if (hard && !guard.isOwner) {
    return NextResponse.json(
      { success: false, message: 'Only the workspace owner can permanently delete a staff account.' },
      { status: 403 }
    );
  }
  const target = await prisma.ticketRequester.findFirst({
    where: { id, privateCompanyId: guard.companyId },
    select: { id: true, role: true, privateCompanyDepartmentId: true },
  });
  if (!target) return NextResponse.json({ success: false, message: 'Staff not found.' }, { status: 404 });
  if (!guard.isOwner) {
    if (
      !guard.actorDepartmentId ||
      target.privateCompanyDepartmentId !== guard.actorDepartmentId
    ) {
      return NextResponse.json(
        { success: false, message: 'You can only remove staff in your own department.' },
        { status: 403 }
      );
    }
    const targetRole = String(target.role ?? '').toUpperCase();
    if (!MANAGER_CAN_GRANT_STAFF_ROLES.has(targetRole)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Only the workspace owner can remove a manager, coordinator, or warehouse keeper.',
        },
        { status: 403 }
      );
    }
  }
  if (hard) {
    await prisma.ticketRequester.delete({ where: { id } });
  } else {
    await prisma.ticketRequester.update({
      where: { id },
      data: {
        privateCompanyId: null,
        privateCompanyDepartmentId: null,
        status: 'SUSPENDED',
      },
    });
  }
  return NextResponse.json({ success: true });
}
