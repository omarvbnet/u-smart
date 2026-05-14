import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyTicketsRegistrationRequest } from '@/lib/email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company
 * Returns the workspace context for the current requester:
 *   - If they own a workspace -> full workspace + departments + staff + checklists
 *   - If they are staff       -> the workspace info (read-only fields)
 *   - Otherwise               -> { workspace: null, request: null }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        id: true,
        name: true,
        company: true,
        role: true,
        specialization: true,
        privateCompanyId: true,
        privateCompanyDepartmentId: true,
        privateCompanyAllowedTaskSlugs: true,
        maintenanceProximityJoinOverride: true,
        maintenanceProximityRadiusOverrideM: true,
        privateCompanyOwned: {
          select: {
            id: true,
            name: true,
            description: true,
            logoUrl: true,
            status: true,
            rejectionReason: true,
            approvedAt: true,
            createdAt: true,
            updatedAt: true,
            departments: {
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
                engineerAvailabilityPoolEnabled: true,
                technicianAvailabilityPoolEnabled: true,
                _count: { select: { members: true } },
              },
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
                province: true,
                provinceFilterActive: true,
                privateCompanyDepartmentId: true,
                privateCompanyAllowedTaskSlugs: true,
                maintenanceProximityJoinOverride: true,
                maintenanceProximityRadiusOverrideM: true,
                createdAt: true,
              },
            },
            checklists: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                name: true,
                description: true,
                category: true,
                techniqueTypes: true,
                items: true,
                createdById: true,
                departmentId: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 404 });
    }

    // Owner branch: include the full workspace
    if (requester.privateCompanyOwned) {
      const ws = requester.privateCompanyOwned;
      return NextResponse.json({
        success: true,
        membership: {
          isOwner: true,
          isStaff: false,
          status: ws.status,
          role: String(requester.role ?? '').toUpperCase() || 'COMPANY',
        },
        workspace: ws,
      });
    }

    // Staff branch: include lightweight workspace info
    if (requester.privateCompanyId) {
      const myRole = String(requester.role ?? '').toUpperCase();
      const myDepartmentId = requester.privateCompanyDepartmentId ?? null;
      // Managers / coordinators / engineers / technicians / workers see only
      // staff inside their own department. Department-less staff see only
      // themselves. Owner branch above always sees every staff member.
      const staffWhere: Record<string, unknown> | undefined = myDepartmentId
        ? { privateCompanyDepartmentId: myDepartmentId }
        : { id: requester.id };
      const ws = await prisma.privateCompany.findUnique({
        where: { id: requester.privateCompanyId },
        select: {
          id: true,
          name: true,
          description: true,
          logoUrl: true,
          status: true,
          approvedAt: true,
          departments: {
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
              engineerAvailabilityPoolEnabled: true,
              technicianAvailabilityPoolEnabled: true,
              _count: { select: { members: true } },
            },
          },
          // Staff need to see their teammates (same department only) so the
          // client can resolve their own role + permissions (e.g.
          // canCreateChecklists / canManageStaff).
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
              privateCompanyAllowedTaskSlugs: true,
              maintenanceProximityJoinOverride: true,
              maintenanceProximityRadiusOverrideM: true,
              createdAt: true,
            },
          },
          checklists: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              techniqueTypes: true,
              items: true,
              createdById: true,
              departmentId: true,
              createdAt: true,
            },
          },
        },
      });
      let departmentName: string | null = null;
      if (myDepartmentId && ws?.departments?.length) {
        const hit = (ws.departments as Array<{ id: string; name: string }>).find((d) => d.id === myDepartmentId);
        departmentName = hit?.name ?? null;
      }
      return NextResponse.json({
        success: true,
        membership: {
          isOwner: false,
          isStaff: true,
          status: ws?.status ?? null,
          departmentId: myDepartmentId,
          departmentName,
          role: myRole || null,
          specialization: requester.specialization ?? null,
        },
        workspace: ws,
      });
    }

    return NextResponse.json({
      success: true,
      membership: { isOwner: false, isStaff: false, status: null, role: null },
      workspace: null,
    });
  } catch (err) {
    const e = err as Error;
    console.error('GET /api/provisor-private-company:', e?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to load workspace' }, { status: 500 });
  }
}

/**
 * POST /api/provisor-private-company
 * Body: { name: string; description?: string; logoUrl?: string }
 * Creates a PENDING workspace request for the current requester. Only one
 * workspace per requester is allowed.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const logoUrl = typeof body?.logoUrl === 'string' ? body.logoUrl.trim() : '';
    if (!name) {
      return NextResponse.json(
        { success: false, message: 'A workspace name is required.' },
        { status: 400 }
      );
    }
    if (name.length > 80) {
      return NextResponse.json(
        { success: false, message: 'Workspace name is too long (max 80 characters).' },
        { status: 400 }
      );
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        id: true,
        role: true,
        status: true,
        name: true,
        email: true,
        phone: true,
        privateCompanyOwned: { select: { id: true, status: true } },
        privateCompanyId: true,
      },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 404 });
    }
    if (requester.status === 'BLOCKED' || requester.status === 'SUSPENDED') {
      return NextResponse.json(
        { success: false, message: 'Your account is blocked or suspended.' },
        { status: 403 }
      );
    }
    const role = String(requester.role ?? '').toUpperCase();
    if (role !== 'COMPANY') {
      return NextResponse.json(
        { success: false, message: 'Only company accounts can request a private workspace.' },
        { status: 403 }
      );
    }
    if (requester.privateCompanyId) {
      return NextResponse.json(
        { success: false, message: 'You are already a staff member of another workspace.' },
        { status: 400 }
      );
    }
    if (requester.privateCompanyOwned) {
      return NextResponse.json(
        {
          success: false,
          message:
            requester.privateCompanyOwned.status === 'APPROVED'
              ? 'Your workspace is already approved.'
              : requester.privateCompanyOwned.status === 'PENDING'
                ? 'Your request is already pending admin review.'
                : 'A workspace already exists for your account.',
          workspace: requester.privateCompanyOwned,
        },
        { status: 409 }
      );
    }

    const workspace = await prisma.privateCompany.create({
      data: {
        name,
        description: description || null,
        logoUrl: logoUrl || null,
        ownerRequesterId: requester.id,
        status: 'PENDING',
      },
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        status: true,
        createdAt: true,
      },
    });

    // Admin alert (re-uses existing tickets/registration channel, gracefully if missing)
    try {
      if (typeof prisma.notification?.create === 'function') {
        await prisma.notification.create({
          data: {
            type: 'private_company_request',
            title: 'New private workspace request',
            message: `${requester.name ?? requester.email ?? requester.phone ?? 'A company user'} requested workspace "${name}".`,
            forAdmin: true,
            payload: { workspaceId: workspace.id, requesterId: requester.id },
          },
        });
      }
    } catch (e) {
      console.error('Notify admin (private-company request):', e);
    }
    try {
      await notifyTicketsRegistrationRequest({
        id: workspace.id,
        legalName: name,
        phone: requester.phone ?? '',
        email: requester.email ?? '',
        province: '',
        evidenceUrl: '',
        role: 'COMPANY',
      });
    } catch (e) {
      console.error('Email admin (private-company request):', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Your private workspace request was submitted. An admin will review it shortly.',
      workspace,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error('POST /api/provisor-private-company:', e?.message ?? err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit workspace request.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/provisor-private-company
 * Owner-only. Body: { name?, description?, logoUrl? }.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const ws = await prisma.privateCompany.findUnique({
      where: { ownerRequesterId: auth.payload.requesterId },
      select: { id: true, status: true },
    });
    if (!ws) {
      return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
    }
    const data: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.description === 'string') data.description = body.description.trim() || null;
    if (typeof body?.logoUrl === 'string') data.logoUrl = body.logoUrl.trim() || null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
    }
    const updated = await prisma.privateCompany.update({ where: { id: ws.id }, data });
    return NextResponse.json({ success: true, workspace: updated });
  } catch (err) {
    console.error('PATCH /api/provisor-private-company:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update workspace.' },
      { status: 500 }
    );
  }
}
