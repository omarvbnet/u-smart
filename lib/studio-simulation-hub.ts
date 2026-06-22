/**
 * In-memory digital twin session hub — event-driven simulation sync.
 * Subscribers receive SSE/WebSocket-compatible twin events.
 */
import type { DesignEdge, DesignNode } from '@/app/studio/lib/model';
import type { ControlState } from '@/app/studio/lib/controls';
import type { NodeSimState } from '@/app/studio/lib/engine/simulate';
import type { Telegram } from '@/app/studio/lib/engine/bus';
import { loadTwinSessionSnapshot, type PersistedTwinSession } from '@/lib/studio-db-sync';

export type TwinChainStep = {
  kind: 'panel' | 'actuator' | 'load' | 'circuit' | 'metric';
  nodeId: string;
  label: string;
  detail: string;
};

export type TwinMetrics = {
  totalKw: number;
  totalA: number;
  activeDevices: number;
  energisedDevices: number;
};

export type TwinEvent =
  | { type: 'connected'; sessionId: string; ts: number }
  | { type: 'control'; nodeId: string; key: string; value: boolean | number; ts: number }
  | { type: 'chain'; steps: TwinChainStep[]; ts: number }
  | { type: 'telegram'; telegram: Telegram; ts: number }
  | { type: 'sim'; states: Record<string, NodeSimState>; metrics: TwinMetrics; ts: number }
  | { type: 'stopped'; ts: number };

export type TwinSessionSnapshot = {
  id: string;
  active: boolean;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  states: Record<string, NodeSimState>;
  metrics: TwinMetrics;
  telegrams: Telegram[];
  lastEventAt: number;
};

type Subscriber = (event: TwinEvent) => void;

type Session = {
  id: string;
  active: boolean;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  states: Record<string, NodeSimState>;
  metrics: TwinMetrics;
  telegrams: Telegram[];
  subscribers: Set<Subscriber>;
  tickTimer: ReturnType<typeof setInterval> | null;
  lastEventAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __studioTwinHub: Map<string, Session> | undefined;
}

function hub(): Map<string, Session> {
  if (!globalThis.__studioTwinHub) globalThis.__studioTwinHub = new Map();
  return globalThis.__studioTwinHub;
}

function emptyMetrics(): TwinMetrics {
  return { totalKw: 0, totalA: 0, activeDevices: 0, energisedDevices: 0 };
}

function emit(session: Session, event: TwinEvent) {
  session.lastEventAt = Date.now();
  for (const sub of session.subscribers) {
    try {
      sub(event);
    } catch {
      /* ignore broken subscriber */
    }
  }
}

export function createTwinSession(
  nodes: DesignNode[],
  edges: DesignEdge[],
  controls: Record<string, ControlState>,
): TwinSessionSnapshot {
  const id = `twin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const session: Session = {
    id,
    active: true,
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    controls: structuredClone(controls),
    states: {},
    metrics: emptyMetrics(),
    telegrams: [],
    subscribers: new Set(),
    tickTimer: null,
    lastEventAt: Date.now(),
  };
  hub().set(id, session);
  return snapshot(session);
}

export function getTwinSession(id: string): Session | undefined {
  return hub().get(id);
}

export function toPersistedTwinSession(session: Session): PersistedTwinSession {
  return {
    nodes: session.nodes,
    edges: session.edges,
    controls: session.controls,
    states: session.states,
    metrics: session.metrics,
    active: session.active,
  };
}

export function rehydrateTwinSession(id: string, data: PersistedTwinSession): Session {
  const session: Session = {
    id,
    active: true,
    nodes: structuredClone(data.nodes),
    edges: structuredClone(data.edges),
    controls: structuredClone(data.controls),
    states: structuredClone(data.states ?? {}),
    metrics: { ...data.metrics },
    telegrams: [],
    subscribers: new Set(),
    tickTimer: null,
    lastEventAt: Date.now(),
  };
  hub().set(id, session);
  return session;
}

/** Load from memory or restore from DB — required for Vercel serverless SSE. */
export async function getOrRestoreTwinSession(id: string): Promise<Session | undefined> {
  const existing = hub().get(id);
  if (existing?.active) return existing;
  const persisted = await loadTwinSessionSnapshot(id);
  if (!persisted?.active) return undefined;
  return rehydrateTwinSession(id, persisted);
}

/** Create or restore a session from the current design (serverless-safe). */
export async function ensureTwinSessionFromDesign(
  sessionId: string | null | undefined,
  design: {
    nodes: DesignNode[];
    edges: DesignEdge[];
    controls: Record<string, ControlState>;
  },
): Promise<Session> {
  if (sessionId) {
    const restored = await getOrRestoreTwinSession(sessionId);
    if (restored?.active) return restored;
    return rehydrateTwinSession(sessionId, {
      nodes: design.nodes,
      edges: design.edges,
      controls: design.controls,
      states: {},
      metrics: emptyMetrics(),
      active: true,
    });
  }

  const snap = createTwinSession(design.nodes, design.edges, design.controls);
  const session = hub().get(snap.id);
  if (!session) throw new Error('Failed to create twin session');
  return session;
}

export function snapshot(session: Session): TwinSessionSnapshot {
  return {
    id: session.id,
    active: session.active,
    nodes: session.nodes,
    edges: session.edges,
    controls: session.controls,
    states: session.states,
    metrics: session.metrics,
    telegrams: session.telegrams.slice(-50),
    lastEventAt: session.lastEventAt,
  };
}

export function subscribeTwinSession(id: string, subscriber: Subscriber): (() => void) | null {
  const session = hub().get(id);
  if (!session || !session.active) return null;
  session.subscribers.add(subscriber);
  subscriber({ type: 'connected', sessionId: id, ts: Date.now() });
  return () => session.subscribers.delete(subscriber);
}

export function updateTwinDesign(
  id: string,
  patch: { nodes?: DesignNode[]; edges?: DesignEdge[]; controls?: Record<string, ControlState> },
): TwinSessionSnapshot | null {
  const session = hub().get(id);
  if (!session || !session.active) return null;
  if (patch.nodes) session.nodes = structuredClone(patch.nodes);
  if (patch.edges) session.edges = structuredClone(patch.edges);
  if (patch.controls) session.controls = structuredClone(patch.controls);
  return snapshot(session);
}

export function pushTwinEvent(id: string, event: TwinEvent): boolean {
  const session = hub().get(id);
  if (!session || !session.active) return false;
  emit(session, event);
  return true;
}

export function applyTwinControl(
  id: string,
  nodeId: string,
  key: string,
  value: boolean | number,
  chain: TwinChainStep[],
  telegram?: Telegram,
): TwinSessionSnapshot | null {
  const session = hub().get(id);
  if (!session || !session.active) return null;
  session.controls = {
    ...session.controls,
    [nodeId]: { ...session.controls[nodeId], [key]: value },
  };
  emit(session, { type: 'control', nodeId, key, value, ts: Date.now() });
  if (chain.length) emit(session, { type: 'chain', steps: chain, ts: Date.now() });
  if (telegram) {
    session.telegrams = [telegram, ...session.telegrams].slice(0, 200);
    emit(session, { type: 'telegram', telegram, ts: Date.now() });
  }
  return snapshot(session);
}

export function applyTwinSimState(
  id: string,
  states: Record<string, NodeSimState>,
  metrics: TwinMetrics,
): TwinSessionSnapshot | null {
  const session = hub().get(id);
  if (!session || !session.active) return null;
  session.states = states;
  session.metrics = metrics;
  emit(session, { type: 'sim', states, metrics, ts: Date.now() });
  return snapshot(session);
}

export function stopTwinSession(id: string): boolean {
  const session = hub().get(id);
  if (!session) return false;
  session.active = false;
  if (session.tickTimer) clearInterval(session.tickTimer);
  emit(session, { type: 'stopped', ts: Date.now() });
  session.subscribers.clear();
  hub().delete(id);
  return true;
}
