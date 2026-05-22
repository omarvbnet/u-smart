import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  WORKSPACE_LOG_ACTIONS,
  WORKSPACE_LOG_ACTION_LABELS,
  workspaceActivityGuard,
} from '@/lib/private-company-workspace-log';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/workspace-activity
 *
 * Paginated workspace audit log (staff, departments, materials, settings, tickets).
 * Owner sees all; managers/coordinators/keepers see their department only.
 *
 * Query: ?limit=50&action=STAFF_ADDED&resourceType=staff&departmentId=
 */
export async function GET(req: NextRequest) {
  const guard = await workspaceActivityGuard(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(250, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const action = searchParams.get('action')?.trim() ?? '';
  const resourceType = searchParams.get('resourceType')?.trim() ?? '';
  const departmentIdParam = searchParams.get('departmentId')?.trim() ?? '';

  const clauses: Array<Record<string, unknown>> = [{ companyId: guard.companyId }];
  if (guard.scopeDepartmentId) {
    clauses.push({ departmentId: guard.scopeDepartmentId });
  } else if (departmentIdParam) {
    clauses.push({ departmentId: departmentIdParam });
  }
  if (action && (WORKSPACE_LOG_ACTIONS as readonly string[]).includes(action)) {
    clauses.push({ action });
  }
  if (resourceType) clauses.push({ resourceType });

  const where = clauses.length === 1 ? clauses[0]! : { AND: clauses };

  try {
    if (!prisma.privateCompanyWorkspaceLog?.findMany) {
      return NextResponse.json({
        success: true,
        scope: guard.scopeDepartmentId ? 'department' : 'company',
        logs: [],
        message: 'Activity log is not available until database migration is applied.',
      });
    }

    const rows = await prisma.privateCompanyWorkspaceLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, name: true, username: true, role: true } },
        department: { select: { id: true, name: true, color: true } },
      },
    });

    const logs = rows.map(
      (r: {
        id: string;
        action: string;
        resourceType: string;
        resourceId: string | null;
        summary: string;
        departmentId: string | null;
        metadata: unknown;
        createdAt: Date;
        actor: { id: string; name: string | null; username: string; role: string };
        department: { id: string; name: string; color: string | null } | null;
      }) => ({
        id: r.id,
        action: r.action,
        actionLabel: WORKSPACE_LOG_ACTION_LABELS[r.action] ?? r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        summary: r.summary,
        departmentId: r.departmentId,
        departmentName: r.department?.name ?? null,
        metadata: r.metadata,
        createdAt: r.createdAt,
        actor: {
          id: r.actor.id,
          name: r.actor.name,
          username: r.actor.username,
          role: r.actor.role,
        },
      })
    );

    return NextResponse.json({
      success: true,
      scope: guard.scopeDepartmentId ? 'department' : 'company',
      logs,
    });
  } catch (e) {
    console.error('GET workspace-activity:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to load workspace activity.' },
      { status: 500 }
    );
  }
}
