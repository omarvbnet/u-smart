import type { AIProvider, ChatCompletionResult, ChatMessage } from '@/lib/agent/providers/types';

export type ClaudeConfig = {
  id: string;
  apiKey: string;
  baseURL?: string | null;
};

/**
 * Anthropic Messages API adapter.
 * Tool calling mapped to Anthropic tools format when provided.
 */
export function createClaudeProvider(cfg: ClaudeConfig): AIProvider {
  const base = (cfg.baseURL || 'https://api.anthropic.com').replace(/\/$/, '');

  return {
    id: cfg.id,
    async chat({ model, messages, tools, temperature }) {
      const systemParts: string[] = [];
      const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

      for (const m of messages) {
        if (m.role === 'system') {
          systemParts.push(m.content);
          continue;
        }
        if (m.role === 'tool') {
          anthropicMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.tool_call_id || 'tool',
                content: m.content,
              },
            ],
          });
          continue;
        }
        if (m.role === 'assistant' && m.tool_calls?.length) {
          anthropicMessages.push({
            role: 'assistant',
            content: [
              ...(m.content ? [{ type: 'text', text: m.content }] : []),
              ...m.tool_calls.map((tc) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: safeJson(tc.arguments),
              })),
            ],
          });
          continue;
        }
        anthropicMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        });
      }

      // Anthropic requires alternating user/assistant; merge consecutive same roles lightly.
      const normalized = coalesceRoles(anthropicMessages);

      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        temperature: temperature ?? 0.3,
        messages: normalized,
      };
      if (systemParts.length) body.system = systemParts.join('\n\n');
      if (tools?.length) {
        body.tools = tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters || { type: 'object', properties: {} },
        }));
      }

      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Claude API ${res.status}: ${errText.slice(0, 400)}`);
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const textParts: string[] = [];
      const toolCalls: ChatCompletionResult['toolCalls'] = [];
      for (const block of data.content || []) {
        if (block.type === 'text' && block.text) textParts.push(block.text);
        if (block.type === 'tool_use' && block.id && block.name) {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          });
        }
      }

      return {
        content: textParts.join('\n') || null,
        toolCalls,
        model,
        provider: cfg.id,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        },
      };
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function coalesceRoles(
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>
): Array<{ role: 'user' | 'assistant'; content: unknown }> {
  const out: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      if (typeof last.content === 'string' && typeof m.content === 'string') {
        last.content = `${last.content}\n${m.content}`;
      } else if (Array.isArray(last.content) && Array.isArray(m.content)) {
        last.content = [...last.content, ...m.content];
      } else {
        out.push(m);
      }
    } else {
      out.push(m);
    }
  }
  // Must start with user
  if (out.length && out[0].role !== 'user') {
    out.unshift({ role: 'user', content: '(continue)' });
  }
  return out;
}

/** @deprecated kept for type imports */
export type { ChatMessage };
