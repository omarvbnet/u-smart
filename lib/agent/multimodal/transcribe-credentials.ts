import { getOpenAiApiKey } from '@/lib/agent/config';
import { decryptSecret } from '@/lib/agent/providers/secrets';
import { loadResolvedProviders, type ResolvedProvider } from '@/lib/agent/providers/registry';

export type TranscribeCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerSlug: string;
};

/**
 * Resolve Whisper-compatible transcription credentials.
 * Prefers an OpenAI (or CUSTOM with whisper model) provider even when DeepSeek/Claude is default,
 * so voice-note uploads keep working with DeepSeek chat.
 */
export async function resolveTranscribeCredentials(): Promise<TranscribeCredentials | null> {
  const all = await loadResolvedProviders();
  const whisperish = (p: ResolvedProvider) => {
    const model = (p.models.transcribe || '').toLowerCase();
    const kind = p.row.kind;
    if (kind === 'OPENAI') return true;
    if (kind === 'CUSTOM' && (model.includes('whisper') || model.includes('transcribe'))) return true;
    if (model.includes('whisper')) return true;
    return false;
  };

  const preferred =
    all.find((p) => p.row.isDefault && whisperish(p)) ||
    all.find((p) => whisperish(p)) ||
    null;

  if (preferred) {
    const apiKey =
      preferred.row.id === 'env-openai'
        ? getOpenAiApiKey()
        : decryptSecret(preferred.row.apiKeyEncrypted);
    if (apiKey) {
      const base =
        preferred.row.baseUrl ||
        (preferred.row.kind === 'OPENAI' ? 'https://api.openai.com/v1' : null) ||
        'https://api.openai.com/v1';
      const model =
        preferred.models.transcribe?.includes('whisper') || preferred.row.kind === 'OPENAI'
          ? preferred.models.transcribe || 'whisper-1'
          : 'whisper-1';
      return {
        apiKey,
        baseUrl: base.replace(/\/$/, ''),
        model: model.includes('deepseek') || model.includes('claude') ? 'whisper-1' : model,
        providerSlug: preferred.row.slug,
      };
    }
  }

  const envKey = getOpenAiApiKey();
  if (!envKey) return null;
  return {
    apiKey: envKey,
    baseUrl: 'https://api.openai.com/v1',
    model: process.env.U_AGENT_MODEL_TRANSCRIBE || 'whisper-1',
    providerSlug: 'env-openai',
  };
}
