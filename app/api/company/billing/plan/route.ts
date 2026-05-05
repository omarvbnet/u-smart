import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import { hasPrivilege } from '@/lib/coordinator-access';

const PLAN_RATE_USD: Record<string, number> = {
  WEEKLY: 0.7,
  MONTHLY: 0.6,
  YEARLY: 0.5,
};

const OWNER_ROLES = new Set(['COMPANY_OWNER', 'ADMIN']);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function ensureLegacyRequesterCompany(requesterId: string): Promise<string | null> {
  const requester = await (prisma as any).ticketRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, username: true, email: true, role: true, name: true, company: true },
  });
  const role = String((requester as { role?: string })?.role ?? '').toUpperCase();
  if (!requester || role !== 'COMPANY') return null;
  const linked = await getLinkedCoordinatorCompanyId(prisma, {
    id: requester.id,
    username: requester.username ?? '',
    email: requester.email ?? null,
    role,
  });
  if (linked) return linked;

  const companyName =
    (typeof requester.company === 'string' && requester.company.trim()) ||
    (typeof requester.name === 'string' && requester.name.trim()) ||
    requester.username ||
    `Company ${requester.id.slice(-6)}`;
  const slugBase = slugify(companyName) || `company-${requester.id.slice(-6).toLowerCase()}`;
  let companyId: string | null = null;
  for (let i = 0; i < 10; i++) {
    const slug = i === 0 ? slugBase : `${slugBase}-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const created = await (prisma as any).coordinatorCompany.create({
        data: { name: companyName, slug },
        select: { id: true },
      });
      companyId = created.id;
      break;
    } catch {
      // retry on slug collision
    }
  }
  if (!companyId) return null;

  const ownerUsername = `${slugBase.replace(/-/g, '').slice(0, 12) || 'owner'}${Math.floor(100 + Math.random() * 900)}`;
  const ownerEmail =
    (typeof requester.email === 'string' && requester.email.trim().toLowerCase()) ||
    `${ownerUsername}@legacy-company.local`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
  await (prisma as any).coordinatorUser.create({
    data: {
      username: ownerUsername,
      email: ownerEmail,
      name: requester.name ?? companyName,
      passwordHash,
      role: 'COMPANY_OWNER',
      status: 'ACTIVE',
      mustChangePassword: true,
      companyId,
    },
    select: { id: true },
  });
  return companyId;
}

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  const auth = getRequesterFromRequest(req);
  const companyId =
    ctx?.companyId ??
    (auth?.payload.identitySource === 'ticket_requester'
      ? await ensureLegacyRequesterCompany(auth.payload.requesterId)
      : null);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const company = await (prisma as any).coordinatorCompany.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      freeTicketsUsed: true,
      freeTicketsLimit: true,
      activeTicketPlan: true,
      ticketPlanActivatedAt: true,
    },
  });
  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }
  const activePlan = company.activeTicketPlan as string | null;
  return NextResponse.json({
    success: true,
    billing: {
      freeTicketsUsed: company.freeTicketsUsed ?? 0,
      freeTicketsLimit: company.freeTicketsLimit ?? 50,
      activeTicketPlan: activePlan,
      activeRateUsd: activePlan ? PLAN_RATE_USD[activePlan] : null,
      ticketPlanActivatedAt: company.ticketPlanActivatedAt ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  const auth = getRequesterFromRequest(req);
  let companyId =
    ctx?.companyId ??
    (auth?.payload.identitySource === 'ticket_requester'
      ? await ensureLegacyRequesterCompany(auth.payload.requesterId)
      : null);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const canManagePayments =
    (ctx && (OWNER_ROLES.has(ctx.role) || hasPrivilege(ctx.privileges, 'MANAGE_PAYMENTS'))) ||
    (auth?.payload.identitySource === 'ticket_requester');
  if (!canManagePayments) {
    return NextResponse.json({ success: false, message: 'Only company owner can update billing plan.' }, { status: 403 });
  }

  const body = await req.json();
  const plan = typeof body.plan === 'string' ? body.plan.toUpperCase() : '';
  if (!PLAN_RATE_USD[plan]) {
    return NextResponse.json({ success: false, message: 'Invalid plan. Use WEEKLY, MONTHLY, or YEARLY.' }, { status: 400 });
  }

  const company = await (prisma as any).coordinatorCompany.update({
    where: { id: companyId },
    data: {
      activeTicketPlan: plan,
      ticketPlanActivatedAt: new Date(),
    },
    select: {
      freeTicketsUsed: true,
      freeTicketsLimit: true,
      activeTicketPlan: true,
      ticketPlanActivatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    billing: {
      freeTicketsUsed: company.freeTicketsUsed ?? 0,
      freeTicketsLimit: company.freeTicketsLimit ?? 50,
      activeTicketPlan: company.activeTicketPlan,
      activeRateUsd: PLAN_RATE_USD[company.activeTicketPlan as string] ?? null,
      ticketPlanActivatedAt: company.ticketPlanActivatedAt ?? null,
    },
  });
}
