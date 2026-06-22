import { NextRequest } from 'next/server';
import {
  applyTwinControl,
  applyTwinSimState,
  getOrRestoreTwinSession,
  getTwinSession,
  stopTwinSession,
  subscribeTwinSession,
  toPersistedTwinSession,
  type TwinEvent,
} from '@/lib/studio-simulation-hub';
import { processTwinControl, runTwinTick } from '@/app/studio/lib/engine/twin-events';
import { persistTwinSessionSnapshot } from '@/lib/studio-db-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ControlBody = {
  nodeId: string;
  key: string;
  value: boolean | number;
};

/** Server-Sent Events stream — WebSocket-compatible event payloads for digital twin. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const session = await getOrRestoreTwinSession(sessionId);
  if (!session || !session.active) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: TwinEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeTwinSession(sessionId, send);
      if (!unsubscribe) {
        controller.close();
        return;
      }

      tickTimer = setInterval(() => {
        const s = getTwinSession(sessionId);
        if (!s || !s.active) return;
        const tick = runTwinTick(s.nodes, s.edges, s.controls);
        applyTwinSimState(sessionId, tick.states, tick.metrics);
      }, 1000);
    },
    cancel() {
      if (tickTimer) clearInterval(tickTimer);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const session = await getOrRestoreTwinSession(sessionId);
  if (!session || !session.active) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const body = (await req.json()) as ControlBody;
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
