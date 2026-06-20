'use client';

/**
 * Digital twin real-time connection — EventSource (SSE) with WebSocket-style API.
 * Next.js route handlers stream twin events; clients subscribe to panel→actuator→circuit chains.
 */
import type { TwinEvent, TwinMetrics } from '@/lib/studio-simulation-hub';
import type { NodeSimState } from './engine/simulate';
import type { DesignEdge, DesignNode } from './model';
import type { ControlState } from './controls';
import type { Telegram } from './engine/bus';

export type TwinConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export type TwinLiveState = {
  connection: TwinConnectionState;
  sessionId: string | null;
  remoteStates: Record<string, NodeSimState>;
  remoteMetrics: TwinMetrics | null;
  lastChain: TwinEvent & { type: 'chain' } | null;
  lastTelegram: Telegram | null;
};

type Listener = (state: TwinLiveState) => void;

let singleton: DigitalTwinConnection | null = null;

export class DigitalTwinConnection {
  private sessionId: string | null = null;
  private source: EventSource | null = null;
  private state: TwinLiveState = {
    connection: 'idle',
    sessionId: null,
    remoteStates: {},
    remoteMetrics: null,
    lastChain: null,
    lastTelegram: null,
  };
  private listeners = new Set<Listener>();

  static get(): DigitalTwinConnection {
    if (!singleton) singleton = new DigitalTwinConnection();
    return singleton;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  private patch(p: Partial<TwinLiveState>) {
    this.state = { ...this.state, ...p };
    this.emit();
  }

  async start(nodes: DesignNode[], edges: DesignEdge[], controls: Record<string, ControlState>): Promise<boolean> {
    await this.stop();
    this.patch({ connection: 'connecting' });
    try {
      const res = await fetch('/api/studio/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, controls }),
      });
      if (!res.ok) throw new Error('session create failed');
      const { sessionId } = (await res.json()) as { sessionId: string };
      this.sessionId = sessionId;
      this.source = new EventSource(`/api/studio/simulation/${sessionId}`);
      this.source.onopen = () => this.patch({ connection: 'connected', sessionId });
      this.source.onerror = () => this.patch({ connection: 'error' });
      this.source.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as TwinEvent;
          this.handleEvent(event);
        } catch {
          /* ignore */
        }
      };
      return true;
    } catch {
      this.patch({ connection: 'error', sessionId: null });
      return false;
    }
  }

  private handleEvent(event: TwinEvent) {
    switch (event.type) {
      case 'connected':
        this.patch({ connection: 'connected', sessionId: event.sessionId });
        break;
      case 'sim':
        this.patch({ remoteStates: event.states, remoteMetrics: event.metrics });
        break;
      case 'chain':
        this.patch({ lastChain: event });
        break;
      case 'telegram':
        this.patch({ lastTelegram: event.telegram });
        break;
      case 'stopped':
        void this.stop();
        break;
      default:
        break;
    }
  }

  async pushControl(nodeId: string, key: string, value: boolean | number): Promise<boolean> {
    if (!this.sessionId) return false;
    try {
      const res = await fetch(`/api/studio/simulation/${this.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, key, value }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncDesign(nodes: DesignNode[], edges: DesignEdge[], controls: Record<string, ControlState>) {
    if (!this.sessionId) return;
    await fetch('/api/studio/simulation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, nodes, edges, controls }),
    });
  }

  async stop() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    if (this.sessionId) {
      await fetch(`/api/studio/simulation/${this.sessionId}`, { method: 'DELETE' }).catch(() => {});
      await fetch(`/api/studio/simulation?sessionId=${this.sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
    this.sessionId = null;
    this.patch({
      connection: 'idle',
      sessionId: null,
      remoteStates: {},
      remoteMetrics: null,
      lastChain: null,
      lastTelegram: null,
    });
  }
}

export function getTwinConnection(): DigitalTwinConnection {
  return DigitalTwinConnection.get();
}
