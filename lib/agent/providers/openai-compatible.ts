import OpenAI from 'openai';
import type { AIProvider, ChatCompletionResult } from '@/lib/agent/providers/types';

export type OpenAiCompatibleConfig = {
  id: string;
  apiKey: string;
  baseURL?: string | null;
};

/** OpenAI-compatible chat (OpenAI, DeepSeek, Azure-style custom gateways, etc.). */
export function createOpenAiCompatibleProvider(cfg: OpenAiCompatibleConfig): AIProvider {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL || undefined,
  });

  return {
    id: cfg.id,
    async chat({ model, messages, tools, temperature }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: any[] = messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id || 'tool',
          };
        }
        if (m.role === 'assistant' && m.tool_calls?.length) {
          return {
            role: 'assistant' as const,
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      });

      const res = await client.chat.completions.create({
        model,
        messages: mapped,
        temperature: temperature ?? 0.3,
        tools: tools?.length ? tools : undefined,
      });

      const choice = res.choices[0]?.message;
      const toolCalls =
        choice?.tool_calls
          ?.map((tc) => ({
            id: tc.id,
            name: 'function' in tc ? tc.function.name : '',
            arguments: 'function' in tc ? tc.function.arguments || '{}' : '{}',
          }))
          .filter((tc) => tc.name) ?? [];

      const result: ChatCompletionResult = {
        content: choice?.content ?? null,
        toolCalls,
        model,
        provider: cfg.id,
        usage: {
          inputTokens: res.usage?.prompt_tokens,
          outputTokens: res.usage?.completion_tokens,
        },
      };
      return result;
    },
  };
}
