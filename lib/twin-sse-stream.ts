import {
  applyTwinSimState,
  getTwinSession,
  subscribeTwinSession,
  type TwinEvent,
} from '@/lib/studio-simulation-hub';
import { runTwinTick } from '@/app/studio/lib/engine/twin-events';

/** Shared SSE response for an active in-memory twin session. */
export function twinSessionSseResponse(sessionId: string): Response {
  const session = getTwinSession(sessionId);
  if (!session?.active) {
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
        if (!s?.active) return;
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
