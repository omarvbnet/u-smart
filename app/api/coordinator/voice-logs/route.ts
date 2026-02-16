import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const list = await prisma.coordinatorVoiceLog.findMany({
      where: { userId: payload.sub },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({
      success: true,
      logs: list.map((l) => ({
        id: l.id,
        transcript: l.transcript,
        detectedLanguage: l.detectedLanguage,
        intent: l.intent,
        actionTaken: l.actionTaken,
        audioFileUrl: l.audioFileUrl,
        createdAt: l.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/voice-logs:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const body = await req.json();
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() || null : null;
    const detectedLanguage = typeof body.detectedLanguage === 'string' ? body.detectedLanguage.trim() || null : null;
    const intent = typeof body.intent === 'string' ? body.intent.trim() || null : null;
    const actionTaken = typeof body.actionTaken === 'string' ? body.actionTaken.trim() || null : null;
    const audioFileUrl = typeof body.audioFileUrl === 'string' ? body.audioFileUrl.trim() || null : null;
    const log = await prisma.coordinatorVoiceLog.create({
      data: {
        userId: payload.sub,
        transcript,
        detectedLanguage,
        intent,
        actionTaken,
        audioFileUrl,
      },
    });
    return NextResponse.json({
      success: true,
      log: {
        id: log.id,
        transcript: log.transcript,
        detectedLanguage: log.detectedLanguage,
        intent: log.intent,
        actionTaken: log.actionTaken,
        createdAt: log.createdAt,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/voice-logs:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
