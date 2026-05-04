import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';

const ALLOWED_CREATOR_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'COMPANY']);
const ALLOWED_STAFF_ROLES = new Set([
  'COORDINATOR',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
]);
const STAFF_ROLE_ALIASES: Record<string, string> = {
  QC: 'QUALITY_ENGINEER',
  SUPERVISOR: 'SUPERVISION_ENGINEER',
};

type StaffCreatorContext = {
  companyId: string;
  creatorUserId: string | null;
  status: string;
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

function normalizeStaffRole(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  return STAFF_ROLE_ALIASES[normalized] ?? normalized;
}

async function getStaffCreatorContext(req: NextRequest): Promise<StaffCreatorContext | null> {
  const auth = getRequesterFromRequest(req);
  if (!auth) return null;

  if (auth.payload.identitySource === 'coordinator_user') {
    const me = await (prisma as any).coordinatorUser.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, role: true, companyId: true, status: true },
    });
    if (!me || !me.companyId || !ALLOWED_CREATOR_ROLES.has(String(me.role))) {
      return null;
    }
    return {
      companyId: me.companyId,
      creatorUserId: me.id,
      status: String(me.status ?? 'ACTIVE'),
    };
  }

  const requester = await (prisma as any).ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
    },
  });
  if (!requester || String(requester.role ?? '').toUpperCase() !== 'COMPANY') {
    return null;
  }

  const linkedCompanyId = await getLinkedCoordinatorCompanyId(prisma, {
    id: requester.id,
    username: requester.username,
    email: requester.email ?? null,
    role: requester.role ?? null,
  });
  if (!linkedCompanyId) return null;

  return {
    companyId: linkedCompanyId,
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
    },
  });
  return NextResponse.json({ success: true, users });
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

  if (!firstName || !email || !role) {
    return NextResponse.json(
      { success: false, message: 'firstName, email, and role are required.' },
      { status: 400 }
    );
  }
  if (!ALLOWED_STAFF_ROLES.has(role)) {
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

  return NextResponse.json({
    success: true,
    user: created,
    credentials: {
      username: created.username,
      temporaryPassword,
      temporaryPasswordHash,
      mustChangePassword: true,
    },
  });
}
