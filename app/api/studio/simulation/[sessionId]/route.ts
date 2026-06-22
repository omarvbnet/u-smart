import { NextRequest } from 'next/server';
import {
  applyTwinControl,
  applyTwinSimState,
  ensureTwinSessionFromDesign,
  getOrRestoreTwinSession,
  getTwinSession,
  stopTwinSession,
  toPersistedTwinSession,
} from '@/lib/studio-simulation-hub';
import { processTwinControl, runTwinTick } from '@/app/studio/lib/engine/twin-events';
import { persistTwinSessionSnapshot } from '@/lib/studio-db-sync';
import { twinSessionSseResponse } from '@/lib/twin-sse-stream';
import type { DesignEdge, DesignNode } from '@/app/studio/lib/model';
import type { ControlState } from '@/app/studio/lib/controls';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ControlBody = {
  nodeId: string;
  key: string;
  value: boolean | number;
  nodes?: DesignNode[];
  edges?: DesignEdge[];
  controls?: Record<string, ControlState>;
};

/** Server-Sent Events stream — WebSocket-compatible event payloads for digital twin. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const session = await getOrRestoreTwinSession(sessionId);
  if (!session?.active) {
    return new Response('Session not found', { status: 404 });
  }
  return twinSessionSseResponse(sessionId);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;

  try {
    const body = (await req.json()) as ControlBody;
    let session = await getOrRestoreTwinSession(sessionId);
    if (!session?.active && body.nodes && body.edges) {
      session = await ensureTwinSessionFromDesign(sessionId, {
        nodes: body.nodes,
        edges: body.edges,
        controls: body.controls ?? {},
      });
    }
    if (!session?.active) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const { chain, telegram } = processTwinControl(session.nodes, session.edges, body.nodeId, body.key, body.value);
    const snap = applyTwinControl(sessionId, body.nodeId, body.key, body.value, chain, telegram);
    const tick = runTwinTick(session.nodes, session.edges, session.controls);
    applyTwinSimState(sessionId, tick.states, tick.metrics);
    const live = getTwinSession(sessionId);
    if (live) {
      void persistTwinSessionSnapshot(sessionId, null, toPersistedTwinSession(live), true);
    }
    return Response.json({ ok: true, chain, metrics: tick.metrics, snapshot: snap });
  } catch (e) {
    console.error('[studio/simulation control POST]', e);
    return Response.json({ error: 'Control failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  stopTwinSession(sessionId);
  await persistTwinSessionSnapshot(
    sessionId,
    null,
    {
      nodes: [],
      edges: [],
      controls: {},
      states: {},
      metrics: { totalKw: 0, totalA: 0, activeDevices: 0, energisedDevices: 0 },
      active: false,
    },
    false,
  );
  return Response.json({ ok: true });
}
