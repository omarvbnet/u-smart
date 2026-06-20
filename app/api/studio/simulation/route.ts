import { NextRequest, NextResponse } from 'next/server';
import {
  applyTwinSimState,
  createTwinSession,
  getTwinSession,
  stopTwinSession,
  updateTwinDesign,
} from '@/lib/studio-simulation-hub';
import type { DesignEdge, DesignNode } from '@/app/studio/lib/model';
import type { ControlState } from '@/app/studio/lib/controls';
import { runTwinTick } from '@/app/studio/lib/engine/twin-events';
import { persistSimulationSession } from '@/lib/studio-db-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateBody = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  projectId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateBody;
    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const session = createTwinSession(body.nodes, body.edges, body.controls ?? {});
    const tick = runTwinTick(session.nodes, session.edges, session.controls);
    applyTwinSimState(session.id, tick.states, tick.metrics);
    if (body.projectId) {
      await persistSimulationSession(body.projectId, session.id, { metrics: tick.metrics }, true);
    }
    return NextResponse.json({ sessionId: session.id });
  } catch (e) {
    console.error('[studio/simulation POST]', e);
    return NextResponse.json({ error: 'Failed to create simulation session' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('sessionId');
  if (!id) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  stopTwinSession(id);
  return NextResponse.json({ ok: true });
}

/** Sync full design snapshot into an active session. */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateBody & { sessionId: string };
    if (!body.sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    const snap = updateTwinDesign(body.sessionId, {
      nodes: body.nodes,
      edges: body.edges,
      controls: body.controls,
    });
    if (!snap) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const tick = runTwinTick(snap.nodes, snap.edges, snap.controls);
    applyTwinSimState(body.sessionId, tick.states, tick.metrics);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[studio/simulation PUT]', e);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('sessionId');
  if (!id) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  const session = getTwinSession(id);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json({
    id: session.id,
    active: session.active,
    metrics: session.metrics,
    lastEventAt: session.lastEventAt,
  });
}
