import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const profile = await prisma.coordinatorProfile.findUnique({
      where: { userId: payload.sub },
    });
    return NextResponse.json({
      success: true,
      profile: profile ? { id: profile.id, skills: profile.skills, cvUrl: profile.cvUrl, createdAt: profile.createdAt } : null,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/profile:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const body = await req.json();
    const skills = Array.isArray(body.skills) ? (body.skills as string[]).filter((s): s is string => typeof s === 'string') : undefined;
    const cvUrl = typeof body.cvUrl === 'string' ? body.cvUrl.trim() || null : undefined;
    const profile = await prisma.coordinatorProfile.upsert({
      where: { userId: payload.sub },
      create: { userId: payload.sub, skills: skills ?? [], cvUrl: cvUrl ?? null },
      update: { ...(skills !== undefined && { skills }), ...(cvUrl !== undefined && { cvUrl }) },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'profile_update',
      resource: 'profile',
      resourceId: profile.id,
      payload: { skillsCount: profile.skills.length },
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, profile: { id: profile.id, skills: profile.skills, cvUrl: profile.cvUrl } });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/profile:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
