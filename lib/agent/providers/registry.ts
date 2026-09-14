import { prisma as _prisma } from '@/lib/prisma';
import { getOpenAiApiKey } from '@/lib/agent/config';
import { decryptSecret } from '@/lib/agent/providers/secrets';
import { createOpenAiCompatibleProvider } from '@/lib/agent/providers/openai-compatible';
import { createClaudeProvider } from '@/lib/agent/providers/claude';
import type { AIProvider } from '@/lib/agent/providers/types';
import type { ModelKind } from '@/lib/agent/models/router';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type ProviderRow = {
  id: string;
  slug: string;
  name: string;
  kind: 'OPENAI' | 'DEEPSEEK' | 'CLAUDE' | 'CUSTOM';
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  modelFast: string | null;
  modelReason: string | null;
  modelVision: string | null;
  modelEmbed: string | null;
  modelTranscribe: string | null;
};

export type ResolvedProvider = {
  row: ProviderRow;
  provider: AIProvider;
  models: Record<ModelKind, string>;
};

const DEFAULT_MODELS: Record<'OPENAI' | 'DEEPSEEK' | 'CLAUDE' | 'CUSTOM', Record<ModelKind, string>> = {
  OPENAI: {
    fast: 'gpt-4o-mini',
    reason: 'gpt-4o',
    vision: 'gpt-4o',
    embed: 'text-embedding-3-small',
    transcribe: 'whisper-1',
  },
  DEEPSEEK: {
    fast: 'deepseek-chat',
    reason: 'deepseek-reasoner',
    vision: 'deepseek-chat',
    embed: 'deepseek-chat',
    // DeepSeek has no Whisper API — leave empty so resolveTranscribeCredentials falls back to OpenAI.
    transcribe: '',
  },
  CLAUDE: {
    fast: 'claude-3-5-haiku-latest',
    reason: 'claude-sonnet-4-20250514',
    vision: 'claude-sonnet-4-20250514',
    embed: 'claude-3-5-haiku-latest',
    transcribe: 'claude-3-5-haiku-latest',
  },
  CUSTOM: {
    fast: 'gpt-4o-mini',
    reason: 'gpt-4o',
    vision: 'gpt-4o',
    embed: 'text-embedding-3-small',
    transcribe: 'whisper-1',
  },
};

function defaultBaseUrl(kind: ProviderRow['kind']): string | null {
  if (kind === 'DEEPSEEK') return 'https://api.deepseek.com';
  if (kind === 'CLAUDE') return 'https://api.anthropic.com';
  if (kind === 'OPENAI') return 'https://api.openai.com/v1';
  return null;
}

function modelsFor(row: ProviderRow): Record<ModelKind, string> {
  const d = DEFAULT_MODELS[row.kind];
  return {
    fast: row.modelFast || process.env.U_AGENT_MODEL_FAST || d.fast,
    reason: row.modelReason || process.env.U_AGENT_MODEL_REASON || d.reason,
    vision: row.modelVision || process.env.U_AGENT_MODEL_VISION || d.vision,
    embed: row.modelEmbed || process.env.U_AGENT_MODEL_EMBED || d.embed,
    transcribe: row.modelTranscribe || process.env.U_AGENT_MODEL_TRANSCRIBE || d.transcribe || '',
  };
}

function buildProvider(row: ProviderRow): AIProvider | null {
  const apiKey = decryptSecret(row.apiKeyEncrypted);
  if (!apiKey) return null;
  const baseURL = row.baseUrl || defaultBaseUrl(row.kind);

  if (row.kind === 'CLAUDE') {
    return createClaudeProvider({ id: row.slug, apiKey, baseURL });
  }
  return createOpenAiCompatibleProvider({
    id: row.slug,
    apiKey,
    baseURL: baseURL || undefined,
  });
}

function envFallback(): ResolvedProvider | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  const row: ProviderRow = {
    id: 'env-openai',
    slug: 'env-openai',
    name: 'OpenAI (env)',
    kind: 'OPENAI',
    baseUrl: null,
    apiKeyEncrypted: null,
    enabled: true,
    isDefault: true,
    priority: 0,
    modelFast: process.env.U_AGENT_MODEL_FAST || null,
    modelReason: process.env.U_AGENT_MODEL_REASON || null,
    modelVision: process.env.U_AGENT_MODEL_VISION || null,
    modelEmbed: process.env.U_AGENT_MODEL_EMBED || null,
    modelTranscribe: process.env.U_AGENT_MODEL_TRANSCRIBE || null,
  };
  return {
    row,
    provider: createOpenAiCompatibleProvider({ id: 'openai', apiKey }),
    models: modelsFor(row),
  };
}

let cache: { at: number; list: ResolvedProvider[] } | null = null;
const CACHE_MS = 15_000;

export function invalidateAiProviderCache(): void {
  cache = null;
}

/** Load enabled providers from DB (cached), fall back to OPENAI_API_KEY env. */
export async function loadResolvedProviders(): Promise<ResolvedProvider[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.list;

  const list: ResolvedProvider[] = [];
  try {
    if (prisma.uAgentAiProvider?.findMany) {
      const rows = (await prisma.uAgentAiProvider.findMany({
        where: { enabled: true },
        orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }],
      })) as ProviderRow[];

      for (const row of rows) {
        const provider = buildProvider(row);
        if (!provider) continue;
        list.push({ row, provider, models: modelsFor(row) });
      }
    }
  } catch (e) {
    console.error('loadResolvedProviders:', e);
  }

  if (!list.length) {
    const fb = envFallback();
    if (fb) list.push(fb);
  }

  cache = { at: now, list };
  return list;
}

export async function pickDefaultProvider(): Promise<ResolvedProvider | null> {
  const all = await loadResolvedProviders();
  if (!all.length) return null;
  return all.find((p) => p.row.isDefault) || all[0];
}

export async function listProviderHealth(): Promise<
  Array<{ slug: string; name: string; kind: string; enabled: boolean; isDefault: boolean; hasKey: boolean }>
> {
  try {
    if (!prisma.uAgentAiProvider?.findMany) {
      const env = !!getOpenAiApiKey();
      return env
        ? [{ slug: 'env-openai', name: 'OpenAI (env)', kind: 'OPENAI', enabled: true, isDefault: true, hasKey: true }]
        : [];
    }
    const rows = await prisma.uAgentAiProvider.findMany({
      orderBy: [{ priority: 'asc' }],
      select: {
        slug: true,
        name: true,
        kind: true,
        enabled: true,
        isDefault: true,
        apiKeyEncrypted: true,
      },
    });
    return rows.map((r: { slug: string; name: string; kind: string; enabled: boolean; isDefault: boolean; apiKeyEncrypted: string | null }) => ({
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      enabled: r.enabled,
      isDefault: r.isDefault,
      hasKey: !!r.apiKeyEncrypted,
    }));
  } catch {
    return [];
  }
}
