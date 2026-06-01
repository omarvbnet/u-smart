import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import { isValidTicketPlan, PLAN_TICKET_CREDITS } from '@/lib/private-company-billing';
import { sendActivationCodeEmail } from '@/lib/email';

const PLAN_EMAIL_LABELS: Record<string, string> = {
  PACK_100: '100 tickets',
  PACK_1000: '1000 tickets',
  YEARLY_UNLIMITED: 'Yearly unlimited',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.role !== 'ADMIN') return null;
  return payload;
}

/** Human-friendly code: USM-XXXX-XXXX (no ambiguous chars). */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  return `USM-${pick(4)}-${pick(4)}`;
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = generateCode();
    const existing = await prisma.privateCompanyActivationCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  return `USM-${Date.now().toString(36).toUpperCase()}`;
}

/** GET — list activation codes for a workspace (newest first). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const codes = await prisma.privateCompanyActivationCode.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        code: true,
        planType: true,
        ticketCredits: true,
        unlimitedUntil: true,
        status: true,
        planRequestId: true,
        redeemedByRequesterId: true,
        redeemedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, codes });
  } catch (err) {
    console.error('GET /api/admin/private-companies/[id]/activation-codes:', err);
    return NextResponse.json({ success: false, message: 'Failed to load activation codes.' }, { status: 500 });
  }
}

/**
 * POST — generate a new activation code scoped to this workspace.
 * Body: { planType: 'PACK_100' | 'PACK_1000' | 'YEARLY_UNLIMITED', unlimitedUntil?, planRequestId? }
 * YEARLY_UNLIMITED requires unlimitedUntil (admin-set expiry).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const planType = typeof body?.planType === 'string' ? body.planType.trim().toUpperCase() : '';
  if (!isValidTicketPlan(planType)) {
    return NextResponse.json({ success: false, message: 'Invalid plan type.' }, { status: 400 });
  }

  const company = await prisma.privateCompany.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerRequesterId: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!company) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }

  let unlimitedUntil: Date | null = null;
  if (planType === 'YEARLY_UNLIMITED') {
    const raw = typeof body?.unlimitedUntil === 'string' ? body.unlimitedUntil.trim() : '';
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, message: 'An expiry date is required for the yearly unlimited plan.' },
        { status: 400 }
      );
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json(
        { success: false, message: 'The expiry date must be in the future.' },
        { status: 400 }
      );
    }
    unlimitedUntil = parsed;
  }

  const planRequestId =
    typeof body?.planRequestId === 'string' && body.planRequestId.trim()
      ? body.planRequestId.trim()
      : null;
  if (planRequestId) {
    const pr = await prisma.privateCompanyPlanRequest.findUnique({
      where: { id: planRequestId },
      select: { id: true, companyId: true },
    });
    if (!pr || pr.companyId !== id) {
      return NextResponse.json(
        { success: false, message: 'Plan request not found for this workspace.' },
        { status: 400 }
      );
    }
  }

  try {
    const code = await generateUniqueCode();
    const created = await prisma.privateCompanyActivationCode.create({
      data: {
        companyId: id,
        code,
        planType,
        ticketCredits: PLAN_TICKET_CREDITS[planType],
        unlimitedUntil,
        planRequestId,
        createdByAdminId: admin.userId,
      },
      select: {
        id: true,
        code: true,
        planType: true,
        ticketCredits: true,
        unlimitedUntil: true,
        status: true,
        createdAt: true,
      },
    });

    // Notify the workspace owner in-app with the code.
    try {
      if (typeof prisma.notification?.create === 'function') {
        await prisma.notification.create({
          data: {
            type: 'private_company_activation_code',
            title: 'Ticket plan activation code',
            message: `Your activation code for ${planType} is ${code}. Enter it in the app to unlock your tickets.`,
            requesterId: company.ownerRequesterId,
            payload: {
              companyId: id,
              code,
              planType,
              ticketCredits: created.ticketCredits,
              unlimitedUntil: created.unlimitedUntil,
            },
          },
        });
      }
    } catch (e) {
      console.error('Notify owner (activation code):', e);
    }

    // Email the owner the code professionally (non-fatal if SMTP/email missing).
    try {
      const ownerEmail = company.owner?.email?.trim();
      if (ownerEmail) {
        await sendActivationCodeEmail({
          to: ownerEmail,
          recipientName: company.owner?.name ?? null,
          companyName: company.name,
          code: created.code,
          planLabel: PLAN_EMAIL_LABELS[created.planType] ?? created.planType,
          ticketCredits: created.ticketCredits,
          unlimitedUntil: created.unlimitedUntil ?? null,
        });
      }
    } catch (e) {
      console.error('Email owner (activation code):', e);
    }

    return NextResponse.json({ success: true, code: created });
  } catch (err) {
    console.error('POST /api/admin/private-companies/[id]/activation-codes:', err);
    return NextResponse.json({ success: false, message: 'Failed to generate activation code.' }, { status: 500 });
  }
}
