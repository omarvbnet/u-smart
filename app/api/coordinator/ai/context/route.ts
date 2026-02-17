import { NextResponse } from 'next/server';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { buildCompanyContext } from '@/lib/coordinator/ai-context';
import { CoordinatorRole } from '@prisma/client';

/**
 * GET: Return full company context (tasks, KPIs, reports, audit, voice, job duties, social)
 * for the current user's company. Used by the AI agent to read all data.
 */
export async function GET(req: Request) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const ctx = await buildCompanyContext(payload.companyId);
    return NextResponse.json({ success: true, context: ctx });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/ai/context:', e);
    return NextResponse.json({ success: false, message: 'Failed to load context' }, { status: 500 });
  }
}
