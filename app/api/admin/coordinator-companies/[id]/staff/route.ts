import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import {
  COMPANY_STAFF_CREATE_ROLES,
  decodeProfileSkills,
  encodeProfileSkills,
  normalizeCoordinatorRole,
  normalizeDepartments,
  normalizePrivileges,
} from '@/lib/coordinator-access';

const prisma = _prisma as any;

const STAFF_ROLE_ALIASES: Record<string, string> = {
  QC: 'QUALITY_ENGINEER',
  SUPERVISOR: 'SUPERVISION_ENGINEER',
  TEAMLEADER: 'TEAM_LEADER',
  TEAM_LEADER: 'TEAM_LEADER',
  TEAM_LEAD: 'TEAM_LEADER',
  MANAGER: 'MANAGER',
};

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// POST /api/admin/coordinator-companies/[id]/staff — add staff to a company
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  const { id: companyId } = await params;

  try {
    const body = await req.json();
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const normalizedRoleRaw = typeof body.role === 'string' ? body.role.trim().toUpperCase().replace(/\s+/g, '_') : '';
    const role = normalizeCoordinatorRole(STAFF_ROLE_ALIASES[normalizedRoleRaw] ?? normalizedRoleRaw);
    const departments = normalizeDepartments(body.departments);
    const privileges = normalizePrivileges(body.privileges);
    const customPassword = typeof body.password === 'string' && body.password.length >= 6
      ? body.password
      : crypto.randomBytes(6).toString('base64url');

    if (!firstName || !email || !COMPANY_STAFF_CREATE_ROLES.has(role)) {
      return NextResponse.json(
        { success: false, message: `firstName, email required and role must be one of: ${[...COMPANY_STAFF_CREATE_ROLES].join(', ')}.` },
        { status: 400 },
      );
    }

    // Check company exists
    const company = await prisma.coordinatorCompany.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found.' }, { status: 404 });
    }

    // Generate username
    const base = firstName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'staff';
    let username = base;
    for (let i = 0; i < 10; i++) {
      const existing = await prisma.coordinatorUser.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!existing) break;
      username = `${base}${Math.floor(100 + Math.random() * 900)}`;
    }

    const hash = await bcrypt.hash(customPassword, 10);

    const user = await prisma.coordinatorUser.create({
      data: {
        username,
        email,
        name: [firstName, lastName].filter(Boolean).join(' '),
        passwordHash: hash,
        role,
        status: 'ACTIVE',
        mustChangePassword: true,
        companyId,
      },
      select: { id: true, username: true, email: true, name: true, role: true },
    });

    await prisma.coordinatorProfile.upsert({
      where: { userId: user.id },
      update: {
        skills: encodeProfileSkills({ departments, privileges }),
      },
      create: {
        userId: user.id,
        skills: encodeProfileSkills({ departments, privileges }),
      },
    });
    const access = decodeProfileSkills(encodeProfileSkills({ departments, privileges }), role);

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        departments: access.departments,
        privileges: access.privileges,
      },
      credentials: { username, temporaryPassword: customPassword },
    });
  } catch (err) {
    console.error('POST admin/coordinator-companies/[id]/staff:', err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}
