import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

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

function buildUsernameBase(seed: string): string {
  const cleaned = seed.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  return cleaned || 'company';
}

async function generateUniqueUsername(seed: string): Promise<string> {
  const base = buildUsernameBase(seed);
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

const SERVICE_SLUGS = ['enterprise-networking', 'quality-control-supervision'] as const;

/** GET — list every private workspace (and request) for the admin to triage. */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  try {
    const rows = await prisma.privateCompany.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        rejectionReason: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: { id: true, name: true, username: true, email: true, phone: true, company: true, province: true },
        },
        _count: { select: { departments: true, staff: true, checklists: true } },
      },
    });
    return NextResponse.json({ success: true, companies: rows });
  } catch (err) {
    console.error('GET /api/admin/private-companies:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch private companies' }, { status: 500 });
  }
}

/**
 * POST /api/admin/private-companies
 * Two modes — chosen by `mode`:
 *   1) `create_user_with_workspace` — create a brand-new COMPANY-role TicketRequester
 *      and immediately create an APPROVED PrivateCompany workspace tied to it.
 *      Body: {
 *        mode: 'create_user_with_workspace',
 *        user: { name?, phone, email?, company?, province?, serviceSlug?, username?, password? },
 *        workspace: { name, description? }
 *      }
 *   2) `promote_existing` — convert an existing TicketRequester (must be COMPANY role
 *      and not already in another workspace) into an APPROVED workspace owner.
 *      Body: { mode: 'promote_existing', userId, workspace: { name, description? } }
 */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === 'string' ? body.mode : '';
  if (mode !== 'create_user_with_workspace' && mode !== 'promote_existing') {
    return NextResponse.json(
      { success: false, message: 'Invalid mode. Expected create_user_with_workspace | promote_existing.' },
      { status: 400 }
    );
  }

  const wsRaw = (body?.workspace ?? {}) as { name?: unknown; description?: unknown };
  const workspaceName = typeof wsRaw.name === 'string' ? wsRaw.name.trim() : '';
  const workspaceDescription = typeof wsRaw.description === 'string' ? wsRaw.description.trim() : '';
  if (!workspaceName) {
    return NextResponse.json(
      { success: false, message: 'workspace.name is required.' },
      { status: 400 }
    );
  }
  if (workspaceName.length > 80) {
    return NextResponse.json(
      { success: false, message: 'workspace.name is too long (max 80 chars).' },
      { status: 400 }
    );
  }

  if (mode === 'promote_existing') {
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ success: false, message: 'userId is required.' }, { status: 400 });
    }
    const user = await prisma.ticketRequester.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
        privateCompanyId: true,
        privateCompanyOwned: { select: { id: true, status: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    }
    if (user.privateCompanyOwned) {
      return NextResponse.json(
        { success: false, message: 'This user already owns a workspace.', workspace: user.privateCompanyOwned },
        { status: 409 }
      );
    }
    if (user.privateCompanyId) {
      return NextResponse.json(
        { success: false, message: 'This user is already a staff member of another workspace.' },
        { status: 409 }
      );
    }
    // Promote: ensure role becomes COMPANY and create approved workspace.
    if (String(user.role).toUpperCase() !== 'COMPANY') {
      await prisma.ticketRequester.update({
        where: { id: user.id },
        data: { role: 'COMPANY' },
      });
    }
    const workspace = await prisma.privateCompany.create({
      data: {
        name: workspaceName,
        description: workspaceDescription || null,
        ownerRequesterId: user.id,
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: admin.userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        approvedAt: true,
        owner: { select: { id: true, username: true, name: true } },
      },
    });

    try {
      if (typeof prisma.notification?.create === 'function') {
        await prisma.notification.create({
          data: {
            type: 'private_company_status',
            title: 'Private workspace approved',
            message: `An admin promoted your account to a private workspace: "${workspaceName}". You can now build departments and staff.`,
            requesterId: user.id,
            payload: { workspaceId: workspace.id, status: 'APPROVED', source: 'admin_promote' },
          },
        });
      }
    } catch (e) {
      console.error('Notify promoted owner:', e);
    }

    return NextResponse.json({ success: true, workspace });
  }

  // mode === 'create_user_with_workspace'
  const userRaw = (body?.user ?? {}) as Record<string, unknown>;
  const phone = typeof userRaw.phone === 'string' ? userRaw.phone.trim() : '';
  if (!phone) {
    return NextResponse.json({ success: false, message: 'user.phone is required.' }, { status: 400 });
  }
  const name = typeof userRaw.name === 'string' ? userRaw.name.trim() || null : null;
  const email = typeof userRaw.email === 'string' ? userRaw.email.trim() || null : null;
  const company = typeof userRaw.company === 'string' ? userRaw.company.trim() || null : null;
  const province = typeof userRaw.province === 'string' ? userRaw.province.trim() || null : null;
  const requestedSlug = typeof userRaw.serviceSlug === 'string' ? userRaw.serviceSlug : 'enterprise-networking';
  const serviceSlug = (SERVICE_SLUGS as readonly string[]).includes(requestedSlug)
    ? (requestedSlug as (typeof SERVICE_SLUGS)[number])
    : 'enterprise-networking';
  const usernameInput = typeof userRaw.username === 'string' ? userRaw.username.trim() : '';
  const passwordInput = typeof userRaw.password === 'string' && userRaw.password.length >= 6
    ? userRaw.password
    : null;

  const phoneCheck = await checkPhoneUnique(prisma, phone);
  if (phoneCheck.taken) {
    return NextResponse.json(
      { success: false, message: phoneCheck.message ?? 'Phone number already in use.' },
      { status: 400 }
    );
  }
  if (email) {
    const emailCheck = await checkEmailUnique(prisma, email);
    if (emailCheck.taken) {
      return NextResponse.json(
        { success: false, message: emailCheck.message ?? 'Email already in use.' },
        { status: 400 }
      );
    }
  }

  const username = usernameInput || (await generateUniqueUsername(name || email || phone));
  const tempPassword = passwordInput ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    const created = await prisma.$transaction(async (tx: any) => {
      const newUser = await tx.ticketRequester.create({
        data: {
          username,
          passwordHash,
          name,
          email,
          phone,
          company,
          province,
          role: 'COMPANY',
          serviceSlug,
          mustChangePassword: passwordInput ? false : true,
        },
        select: { id: true, username: true, name: true, email: true, phone: true, role: true, createdAt: true },
      });
      const newWs = await tx.privateCompany.create({
        data: {
          name: workspaceName,
          description: workspaceDescription || null,
          ownerRequesterId: newUser.id,
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: admin.userId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          approvedAt: true,
        },
      });
      return { user: newUser, workspace: newWs };
    });

    return NextResponse.json({
      success: true,
      user: created.user,
      workspace: created.workspace,
      credentials: { username, temporaryPassword: tempPassword },
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'Username, phone or email is already in use.' },
        { status: 400 }
      );
    }
    console.error('POST /api/admin/private-companies:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to create private workspace.' },
      { status: 500 }
    );
  }
}
