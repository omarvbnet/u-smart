import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import { hasPrivilege } from '@/lib/coordinator-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const CHECKLIST_EDITOR_ROLES = new Set([
  'COMPANY_OWNER',
  'COORDINATOR',
  'ADMIN',
  'MANAGER',
  'TEAM_LEADER',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
  'COMPANY',
]);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function ensureLegacyRequesterCompany(requesterId: string): Promise<string | null> {
  const requester = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, username: true, email: true, role: true, name: true, company: true },
  });
  if (!requester) return null;

  const username = (requester.username ?? '').trim();
  const email = (typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '');
  if (username || email) {
    const existingOwner = await prisma.coordinatorUser.findFirst({
      where: {
        OR: [
          ...(username ? [{ username: { equals: username, mode: 'insensitive' as const } }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: { companyId: true },
    });
    if (existingOwner?.companyId) return existingOwner.companyId;
  }

  const linked = await getLinkedCoordinatorCompanyId(_prisma, {
    id: requester.id,
    username: requester.username ?? '',
    email: requester.email ?? null,
    role: requester.role ?? null,
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
      const created = await prisma.coordinatorCompany.create({
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
  await prisma.coordinatorUser.create({
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
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    const { searchParams } = new URL(req.url);
    const taskCategory = searchParams.get('taskCategory')?.trim().toUpperCase() || '';
    const technique = searchParams.get('technique')?.trim().toLowerCase() || '';

    let companyScopeId: string | null = null;
    if (coordinatorContext) {
      companyScopeId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      companyScopeId = await ensureLegacyRequesterCompany(auth.payload.requesterId);
    }

    if (!companyScopeId) {
      return NextResponse.json(
        { success: false, message: 'Checklists are only available for company provider accounts.' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = {
      OR: [{ companyId: companyScopeId }, { companyId: null }],
    };
    if (taskCategory) {
      where.taskCategory = taskCategory;
    }
    const checklists = await prisma.inspectionChecklist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        items: true,
        companyId: true,
        taskCategory: true,
        techniqueTypes: true,
        createdAt: true,
      },
    });
    const filtered = technique
      ? (checklists as Array<{ techniqueTypes?: string[] | null }>).filter((c) => {
          const arr = Array.isArray(c.techniqueTypes) ? c.techniqueTypes : [];
          return arr.length === 0 || arr.includes(technique);
        })
      : checklists;

    return NextResponse.json({ success: true, checklists: filtered });
  } catch (error) {
    console.error('GET /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch checklists' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    let companyId: string | null = null;
    if (coordinatorContext) {
      if (
        !CHECKLIST_EDITOR_ROLES.has(String(coordinatorContext.role)) &&
        !hasPrivilege(coordinatorContext.privileges, 'MANAGE_CHECKLISTS')
      ) {
        return NextResponse.json(
          { success: false, message: 'Only company owner or coordinator can create checklists.' },
          { status: 403 }
        );
      }
      companyId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      companyId = await ensureLegacyRequesterCompany(auth.payload.requesterId);
      if (!companyId) {
        return NextResponse.json(
          { success: false, message: 'Could not initialize your company provider workspace yet.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const taskCategory = typeof body.taskCategory === 'string' ? body.taskCategory.trim().toUpperCase() : null;
    const techniqueTypes = Array.isArray(body.techniqueTypes)
      ? body.techniqueTypes.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .filter((x: unknown) => x && typeof x === 'object' && 'label' in x && typeof (x as { label: unknown }).label === 'string')
      .map((x: { label: string; id?: string; weight?: string }) => {
        const w = typeof x.weight === 'string' && (x.weight === 'minor' || x.weight === 'major') ? x.weight : 'minor';
        return {
          id: typeof x.id === 'string' ? x.id : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          label: String(x.label).trim(),
          weight: w,
        };
      })
      .filter((x: { label: string }) => x.label.length > 0);

    if (!name) {
      return NextResponse.json({ success: false, message: 'Checklist name is required' }, { status: 400 });
    }

    const checklist = await prisma.inspectionChecklist.create({
      data: {
        name,
        items,
        companyId,
        taskCategory: taskCategory || null,
        techniqueTypes,
      },
    });
    return NextResponse.json({ success: true, checklist });
  } catch (error) {
    console.error('POST /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to create checklist' }, { status: 500 });
  }
}
