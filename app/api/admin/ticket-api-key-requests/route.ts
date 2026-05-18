import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-require';
import { prisma } from '@/lib/prisma';
import {
  getRequesterWorkspaceApiContext,
  isPrivateWorkspaceApiRole,
  resolveDepartmentNames,
} from '@/lib/ticket-api-key-workspace';

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ success: false, message: admin.message }, { status: admin.status });
  }

  try {
    const delegate = (prisma as { ticketApiKeyAccessRequest?: { findMany: Function } }).ticketApiKeyAccessRequest;
    if (!delegate?.findMany) {
      return NextResponse.json({ success: true, requests: [] });
    }

    const requests = await delegate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            name: true,
            company: true,
            phone: true,
            email: true,
            role: true,
            serviceSlug: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            keyPrefix: true,
            label: true,
            allowedDepartmentIds: true,
            revokedAt: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const enriched = await Promise.all(
      (requests as Array<{
        requester: { id: string; role: string };
        apiKey: { allowedDepartmentIds?: string[] } | null;
        [key: string]: unknown;
      }>).map(async (row) => {
        const workspace = await getRequesterWorkspaceApiContext(
          row.requester.id,
          row.requester.role
        );
        let allowedDepartments: Array<{ id: string; name: string }> = [];
        const deptIds = row.apiKey?.allowedDepartmentIds ?? [];
        if (workspace && deptIds.length > 0) {
          allowedDepartments = await resolveDepartmentNames(workspace.companyId, deptIds);
        }
        return {
          ...row,
          isPrivateWorkspaceRequester: isPrivateWorkspaceApiRole(row.requester.role) && !!workspace,
          workspace: workspace
            ? {
                companyId: workspace.companyId,
                companyName: workspace.companyName,
                departments: workspace.departments,
                requiresDepartmentSelection: workspace.requiresDepartmentSelection,
              }
            : null,
          allowedDepartments,
        };
      })
    );

    return NextResponse.json({ success: true, requests: enriched });
  } catch (err) {
    console.error('GET /api/admin/ticket-api-key-requests:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch requests' }, { status: 500 });
  }
}
