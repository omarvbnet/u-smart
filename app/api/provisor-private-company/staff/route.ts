import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership, PRIVATE_COMPANY_STAFF_ROLES } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_SPECIALIZATIONS = ['ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER'] as const;

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
  return { ok: true as const, requesterId: auth.payload.requesterId, companyId: m.ownedCompanyId };
}

/** GET — list staff (and the owner, marked) inside the workspace. Visible to everyone in the workspace. */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 404 });
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: {
      id: true,
      ownerRequesterId: true,
      owner: {
        select: { id: true, username: true, name: true, email: true, phone: true, role: true, status: true },
      },
      staff: {
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

/** POST — owner creates a staff requester account. */
export async function POST(req: NextRequest) {
  const guard = await ownerGuard(req);
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

  if (!firstName) {
    return NextResponse.json({ success: false, message: 'First name is required.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ success: false, message: 'A phone number or email is required.' }, { status: 400 });
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
  if (departmentId) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: departmentId, companyId: guard.companyId },
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
      privateCompanyId: guard.companyId,
      privateCompanyDepartmentId: departmentId || null,
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

/** PATCH — owner updates a staff member (role/department/specialization/status), or
 *  resets their password by passing { id, resetPassword: true }. The new
 *  temporary password is returned only once in the response. */
export async function PATCH(req: NextRequest) {
  const guard = await ownerGuard(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const target = await prisma.ticketRequester.findFirst({
    where: { id, privateCompanyId: guard.companyId },
    select: { id: true, username: true },
  });
  if (!target) return NextResponse.json({ success: false, message: 'Staff not found.' }, { status: 404 });

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
    if ((PRIVATE_COMPANY_STAFF_ROLES as readonly string[]).includes(r)) data.role = r;
  }
  if (typeof body?.departmentId === 'string') {
    const did = body.departmentId.trim();
    if (did) {
      const dept = await prisma.privateCompanyDepartment.findFirst({
        where: { id: did, companyId: guard.companyId },
        select: { id: true },
      });
      if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
      data.privateCompanyDepartmentId = did;
    } else {
      data.privateCompanyDepartmentId = null;
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
      privateCompanyDepartmentId: true,
    },
  });
  return NextResponse.json({ success: true, user: updated });
}

/** DELETE — owner removes a staff member from the workspace (does NOT delete the user). */
export async function DELETE(req: NextRequest) {
  const guard = await ownerGuard(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const hard = searchParams.get('hard') === '1';
  const target = await prisma.ticketRequester.findFirst({
    where: { id, privateCompanyId: guard.companyId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ success: false, message: 'Staff not found.' }, { status: 404 });
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
