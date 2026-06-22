import { NextRequest } from 'next/server';
import type { DesignEdge, DesignNode } from '@/app/studio/lib/model';
import type { ControlState } from '@/app/studio/lib/controls';
import {
  applyTwinSimState,
  ensureTwinSessionFromDesign,
  getTwinSession,
  toPersistedTwinSession,
} from '@/lib/studio-simulation-hub';
import { runTwinTick } from '@/app/studio/lib/engine/twin-events';
import { persistTwinSessionSnapshot } from '@/lib/studio-db-sync';
import { twinSessionSseResponse } from '@/lib/twin-sse-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type StreamBody = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  sessionId?: string;
  projectId?: string;
};

/**
 * Create (or rehydrate) a twin session and open SSE on the same serverless invocation.
 * Avoids 404s when POST and GET hit different Vercel instances.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StreamBody;
    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const session = await ensureTwinSessionFromDesign(body.sessionId, {
      nodes: body.nodes,
      edges: body.edges,
      controls: body.controls ?? {},
    });

    const tick = runTwinTick(session.nodes, session.edges, session.controls);
    applyTwinSimState(session.id, tick.states, tick.metrics);

    const live = getTwinSession(session.id);
    if (live) {
      void persistTwinSessionSnapshot(session.id, body.projectId, toPersistedTwinSession(live), true);
    }

    return twinSessionSseResponse(session.id);
  } catch (e) {
    console.error('[studio/simulation/stream POST]', e);
    return Response.json({ error: 'Failed to open twin stream' }, { status: 500 });
  }
}
