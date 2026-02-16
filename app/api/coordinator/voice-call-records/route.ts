import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import { VoiceCallDirection } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const direction = searchParams.get('direction') as VoiceCallDirection | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const where: { companyId: string; direction?: VoiceCallDirection } = { companyId: payload.companyId };
    if (direction === 'INCOMING' || direction === 'OUTGOING') where.direction = direction;
    const list = await prisma.coordinatorVoiceCallRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({
      success: true,
      records: list.map((r) => ({
        id: r.id,
        direction: r.direction,
        duration: r.duration,
        transcript: r.transcript,
        taskLinked: r.taskLinked,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/voice-call-records:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const direction = body.direction === 'INCOMING' || body.direction === 'OUTGOING' ? body.direction : 'INCOMING';
    const duration = typeof body.duration === 'number' ? body.duration : (typeof body.duration === 'string' ? parseInt(body.duration, 10) : null);
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() || null : null;
    const taskLinked = typeof body.taskLinked === 'string' ? body.taskLinked.trim() || null : null;
    const status = typeof body.status === 'string' ? body.status.trim() : 'completed';
    const record = await prisma.coordinatorVoiceCallRecord.create({
      data: {
        companyId: payload.companyId,
        direction: direction as VoiceCallDirection,
        duration: duration ?? undefined,
        transcript,
        taskLinked,
        status,
      },
    });
    return NextResponse.json({
      success: true,
      record: {
        id: record.id,
        direction: record.direction,
        duration: record.duration,
        transcript: record.transcript,
        taskLinked: record.taskLinked,
        status: record.status,
        createdAt: record.createdAt,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/voice-call-records:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
