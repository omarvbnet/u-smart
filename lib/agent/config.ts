/** Feature flags and global U Agent configuration. */

export function isUAgentGloballyEnabled(): boolean {
  const raw = (process.env.U_AGENT_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

export function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export const U_AGENT_DEFAULT_DAILY_LIMIT = 100;
export const U_AGENT_RATE_LIMIT_WINDOW_MS = 60_000;
export const U_AGENT_RATE_LIMIT_MAX = 20;
