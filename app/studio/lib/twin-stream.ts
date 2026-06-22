'use client';

/**
 * Digital twin real-time connection — fetch SSE stream (serverless-safe).
 * Session create + event stream share one POST so Vercel instances stay consistent.
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
  private streamAbort: AbortController | null = null;
  private design: { nodes: DesignNode[]; edges: DesignEdge[]; controls: Record<string, ControlState> } | null = null;
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
    this.design = { nodes, edges, controls };
    this.patch({ connection: 'connecting' });
    this.streamAbort = new AbortController();

    try {
      const res = await fetch('/api/studio/simulation/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, controls }),
        signal: this.streamAbort.signal,
      });
      if (!res.ok || !res.body) throw new Error('twin stream failed');

      this.patch({ connection: 'connected' });
      void this.consumeSseStream(res.body);
      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false;
      this.patch({ connection: 'error', sessionId: null });
      return false;
    }
  }

  private async consumeSseStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split = buffer.indexOf('\n\n');
        while (split >= 0) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (line) {
            try {
              const event = JSON.parse(line.slice(6)) as TwinEvent;
              this.handleEvent(event);
            } catch {
              /* ignore malformed chunk */
            }
          }
          split = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.patch({ connection: 'error' });
      }
    }
  }

  private handleEvent(event: TwinEvent) {
    switch (event.type) {
      case 'connected':
        this.sessionId = event.sessionId;
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
    if (!this.sessionId || !this.design) return false;
    try {
      const res = await fetch(`/api/studio/simulation/${this.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          key,
          value,
          nodes: this.design.nodes,
          edges: this.design.edges,
          controls: this.design.controls,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncDesign(nodes: DesignNode[], edges: DesignEdge[], controls: Record<string, ControlState>) {
    this.design = { nodes, edges, controls };
    if (!this.sessionId) return;
    await fetch('/api/studio/simulation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, nodes, edges, controls }),
    });
  }

  async stop() {
    if (this.streamAbort) {
      this.streamAbort.abort();
      this.streamAbort = null;
    }
    const ending = this.sessionId;
    if (ending) {
      await fetch(`/api/studio/simulation/${ending}`, { method: 'DELETE' }).catch(() => {});
      await fetch(`/api/studio/simulation?sessionId=${ending}`, { method: 'DELETE' }).catch(() => {});
    }
    this.sessionId = null;
    this.design = null;
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
