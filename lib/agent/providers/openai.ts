import { createOpenAiCompatibleProvider } from '@/lib/agent/providers/openai-compatible';
import { getOpenAiApiKey } from '@/lib/agent/config';
import type { AIProvider } from '@/lib/agent/providers/types';

/** Env-based OpenAI provider (legacy). Prefer admin-managed providers via registry. */
export function createOpenAiProvider(): AIProvider | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  return createOpenAiCompatibleProvider({ id: 'openai', apiKey });
}
