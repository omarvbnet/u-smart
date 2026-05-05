import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import {
  COMPANY_STAFF_CREATE_ROLES,
  decodeProfileSkills,
  encodeProfileSkills,
  hasPrivilege,
  normalizeCoordinatorRole,
  normalizeDepartments,
  normalizePrivileges,
} from '@/lib/coordinator-access';

const ALLOWED_CREATOR_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'COMPANY', 'MANAGER']);
const STAFF_ROLE_ALIASES: Record<string, string> = {
  QC: 'QUALITY_ENGINEER',
  SUPERVISOR: 'SUPERVISION_ENGINEER',
  TEAM_LEADER: 'TEAM_LEADER',
  TEAMLEADER: 'TEAM_LEADER',
  TEAM_LEAD: 'TEAM_LEADER',
  MANAGER: 'MANAGER',
};

type StaffCreatorContext = {
  companyId: string;
  creatorUserId: string | null;
  status: string;
};

type LegacyCompanyRequester = {
  id: string;
  username: string;
  email: string | null;
  role: string | null;
  status: string | null;
  name: string | null;
  company: string | null;
};

function buildUsernameBase(firstName: string): string {
  const cleaned = firstName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16);
  return cleaned || 'staff';
}

async function generateUniqueUsername(firstName: string): Promise<string> {
  const base = buildUsernameBase(firstName);
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
    const existing = await (prisma as any).coordinatorUser.findFirst({
      where: { username: { equals: candidate, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(6).toString('base64url');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeStaffRole(raw: string): string {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '_');
  const alias = STAFF_ROLE_ALIASES[normalized] ?? normalized;
  return normalizeCoordinatorRole(alias);
}

async function ensureCompanyForLegacyRequester(requester: LegacyCompanyRequester): Promise<string> {
  const linkedCompanyId = await getLinkedCoordinatorCompanyId(prisma, {
    id: requester.id,
    username: requester.username,
    email: requester.email ?? null,
    role: requester.role ?? null,
  });
  if (linkedCompanyId) return linkedCompanyId;

  const companyName =
    (typeof requester.company === 'string' && requester.company.trim()) ||
    (typeof requester.name === 'string' && requester.name.trim()) ||
    requester.username ||
    `Company ${requester.id.slice(-6)}`;
  const slugBase = slugify(companyName) || `company-${requester.id.slice(-6).toLowerCase()}`;

  let createdCompanyId: string | null = null;
  for (let i = 0; i < 10; i++) {
    const slugCandidate = i === 0 ? slugBase : `${slugBase}-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const createdCompany = await (prisma as any).coordinatorCompany.create({
        data: {
          name: companyName,
          slug: slugCandidate,
        },
        select: { id: true },
      });
      createdCompanyId = createdCompany.id;
      break;
    } catch {
      // Try a different slug on unique collisions.
    }
  }
  if (!createdCompanyId) {
    throw new Error('Unable to create coordinator company for requester.');
  }

  const ownerSeed = requester.username || requester.email || `owner${Date.now().toString().slice(-6)}`;
  const ownerUsername = await generateUniqueUsername(ownerSeed);
  const ownerEmail =
    (typeof requester.email === 'string' && requester.email.trim().toLowerCase()) ||
    `${ownerUsername}@legacy-company.local`;
  const ownerPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);

  await (prisma as any).coordinatorUser.create({
    data: {
      username: ownerUsername,
      email: ownerEmail,
      name: requester.name ?? companyName,
      passwordHash: ownerPasswordHash,
      role: 'COMPANY_OWNER',
      status: 'ACTIVE',
      mustChangePassword: true,
      companyId: createdCompanyId,
      managedByUserId: null,
    },
    select: { id: true },
  });

  return createdCompanyId;
}

async function getStaffCreatorContext(req: NextRequest): Promise<StaffCreatorContext | null> {
  const auth = getRequesterFromRequest(req);
  if (!auth) return null;

  if (auth.payload.identitySource === 'coordinator_user') {
    const me = await (prisma as any).coordinatorUser.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        id: true,
        role: true,
        companyId: true,
        status: true,
        profile: {
          select: { skills: true },
        },
      },
    });
    const access = decodeProfileSkills(me?.profile?.skills ?? [], String(me?.role ?? 'COORDINATOR'));
    const canManageStaff = me && (ALLOWED_CREATOR_ROLES.has(String(me.role)) || hasPrivilege(access.privileges, 'MANAGE_STAFF'));
    if (!me || !me.companyId || !canManageStaff) {
      return null;
    }
    return {
      companyId: me.companyId,
      creatorUserId: me.id,
      status: String(me.status ?? 'ACTIVE'),
    };
  }

  const requester = (await (prisma as any).ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      name: true,
      company: true,
    },
  })) as LegacyCompanyRequester | null;
  if (!requester || String(requester.role ?? '').toUpperCase() !== 'COMPANY') {
    return null;
  }

  const companyId = await ensureCompanyForLegacyRequester(requester);

  return {
    companyId,
    creatorUserId: null,
    status: String(requester.status ?? 'ACTIVE'),
  };
}

export async function GET(req: NextRequest) {
  const context = await getStaffCreatorContext(req);
  if (!context) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const users = await (prisma as any).coordinatorUser.findMany({
    where: { companyId: context.companyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      profile: {
        select: {
          skills: true,
        },
      },
    },
  });
  const usersWithAccess = (users as Array<Record<string, unknown>>).map((u) => {
    const access = decodeProfileSkills(
      (u.profile as { skills?: string[] } | undefined)?.skills ?? [],
      String(u.role ?? 'COORDINATOR')
    );
    return {
      ...u,
      departments: access.departments,
      privileges: access.privileges,
    };
  });
  return NextResponse.json({ success: true, users: usersWithAccess });
}

export async function POST(req: NextRequest) {
  const context = await getStaffCreatorContext(req);
  if (!context) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (context.status !== 'ACTIVE') {
    return NextResponse.json({ success: false, message: 'Your account is not active.' }, { status: 403 });
  }

  const body = await req.json();
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body.role === 'string' ? normalizeStaffRole(body.role) : '';
  const departments = normalizeDepartments(body.departments);
  const privileges = normalizePrivileges(body.privileges);

  if (!firstName || !email || !role) {
    return NextResponse.json(
      { success: false, message: 'firstName, email, and role are required.' },
      { status: 400 }
    );
  }
  if (!COMPANY_STAFF_CREATE_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, message: 'Invalid staff role.' },
      { status: 400 }
    );
  }

  const username = await generateUniqueUsername(firstName);
  const temporaryPassword = generateTemporaryPassword();
  const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const existingEmail = await (prisma as any).coordinatorUser.findFirst({
    where: { companyId: context.companyId, email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existingEmail) {
    return NextResponse.json(
      { success: false, message: 'Email is already used by another user in your company.' },
      { status: 400 }
    );
  }

  const created = await (prisma as any).coordinatorUser.create({
    data: {
      username,
      email,
      name: fullName || firstName,
      passwordHash: temporaryPasswordHash,
      role,
      status: 'ACTIVE',
      mustChangePassword: true,
      companyId: context.companyId,
      managedByUserId: context.creatorUserId ?? undefined,
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
      companyId: true,
    },
  });

  await (prisma as any).coordinatorProfile.upsert({
    where: { userId: created.id },
    update: {
      skills: encodeProfileSkills({ departments, privileges }),
    },
    create: {
      userId: created.id,
      skills: encodeProfileSkills({ departments, privileges }),
    },
  });

  const access = decodeProfileSkills(encodeProfileSkills({ departments, privileges }), role);

  return NextResponse.json({
    success: true,
    user: {
      ...created,
      departments: access.departments,
      privileges: access.privileges,
    },
    credentials: {
      username: created.username,
      temporaryPassword,
      temporaryPasswordHash,
      mustChangePassword: true,
    },
  });
}
