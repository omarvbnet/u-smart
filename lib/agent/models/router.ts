import type { AIProvider, ChatCompletionResult, ChatMessage } from '@/lib/agent/providers/types';
import { pickDefaultProvider, loadResolvedProviders } from '@/lib/agent/providers/registry';

export type ModelKind = 'fast' | 'reason' | 'vision' | 'embed' | 'transcribe';

/**
 * Routes U Agent chat to the platform-default AI provider
 * (admin-managed OpenAI / DeepSeek / Claude / custom, or OPENAI_API_KEY env fallback).
 */
export class ModelRouter {
  private injected: AIProvider[] | null;

  constructor(providers?: AIProvider[]) {
    this.injected = providers ?? null;
  }

  async hasProvider(): Promise<boolean> {
    if (this.injected?.length) return true;
    const list = await loadResolvedProviders();
    return list.length > 0;
  }

  /** Sync check used by older call sites — prefer async hasProvider. */
  hasProviderSync(): boolean {
    return !!this.injected?.length || !!process.env.OPENAI_API_KEY?.trim();
  }

  async resolveModel(kind: ModelKind = 'fast'): Promise<string> {
    const picked = await pickDefaultProvider();
    if (picked) return picked.models[kind];
    return process.env.U_AGENT_MODEL_FAST || 'gpt-4o-mini';
  }

  /** Back-compat sync model id (env only). Prefer resolveModel. */
  resolveModelSync(kind: ModelKind = 'fast'): string {
    const map: Record<ModelKind, string> = {
      fast: process.env.U_AGENT_MODEL_FAST || 'gpt-4o-mini',
      reason: process.env.U_AGENT_MODEL_REASON || 'gpt-4o',
      vision: process.env.U_AGENT_MODEL_VISION || 'gpt-4o',
      embed: process.env.U_AGENT_MODEL_EMBED || 'text-embedding-3-small',
      transcribe: process.env.U_AGENT_MODEL_TRANSCRIBE || 'whisper-1',
    };
    return map[kind];
  }

  async chat(args: {
    kind?: ModelKind;
    messages: ChatMessage[];
    tools?: Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    temperature?: number;
  }): Promise<ChatCompletionResult> {
    if (this.injected?.length) {
      const p = this.injected[0];
      return p.chat({
        model: this.resolveModelSync(args.kind ?? 'fast'),
        messages: args.messages,
        tools: args.tools,
        temperature: args.temperature,
      });
    }

    const picked = await pickDefaultProvider();
    if (!picked) {
      return {
        content:
          'U Agent AI provider is not configured. Add OpenAI, DeepSeek, Claude, or a custom provider in Admin → AI Providers (or set OPENAI_API_KEY).',
        toolCalls: [],
        model: 'none',
        provider: 'none',
      };
    }

    const model = picked.models[args.kind ?? 'fast'];
    return picked.provider.chat({
      model,
      messages: args.messages,
      tools: args.tools,
      temperature: args.temperature,
    });
  }
}

export const modelRouter = new ModelRouter();
