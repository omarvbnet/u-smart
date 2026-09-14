import { recordAgentUsage } from '@/lib/agent/usage';
import { resolveTranscribeCredentials } from '@/lib/agent/multimodal/transcribe-credentials';
import { getOpenAiApiKey } from '@/lib/agent/config';

export type ProcessedAttachment = {
  url: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'other';
  extractedText?: string | null;
  transcript?: string | null;
  ocrText?: string | null;
  analysisNote?: string | null;
};

function detectKind(contentType?: string | null, name?: string | null): ProcessedAttachment['kind'] {
  const ct = (contentType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return 'image';
  if (ct.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(n)) return 'video';
  if (ct.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|aac)$/.test(n)) return 'audio';
  if (ct === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (
    ct.includes('word') ||
    ct.includes('sheet') ||
    ct.includes('excel') ||
    ct.includes('presentation') ||
    /\.(docx?|xlsx?|pptx?|csv)$/.test(n)
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * Phase 1 multimodal pipeline: classify + lightweight extract.
 * OCR / Whisper run when OPENAI_API_KEY is set and media is fetchable;
 * otherwise metadata-only notes are attached for the planner.
 */
export async function processAgentAttachments(
  inputs: Array<{
    url: string;
    name?: string | null;
    contentType?: string | null;
    size?: number | null;
  }>,
  meta?: { privateCompanyId?: string | null; userId?: string | null }
): Promise<ProcessedAttachment[]> {
  const out: ProcessedAttachment[] = [];
  for (const item of inputs) {
    const kind = detectKind(item.contentType, item.name);
    const base: ProcessedAttachment = {
      url: item.url,
      name: item.name ?? null,
      contentType: item.contentType ?? null,
      size: item.size ?? null,
      kind,
    };

    if (kind === 'audio' || kind === 'video') {
      const transcript = await tryTranscribe(item.url, kind);
      if (transcript) {
        base.transcript = transcript;
        base.extractedText = transcript;
        await recordAgentUsage({
          privateCompanyId: meta?.privateCompanyId ?? null,
          userId: meta?.userId ?? null,
          resourceType: 'transcription',
          quantity: 1,
          provider: 'openai',
        });
      } else {
        base.analysisNote = `${kind} stored; transcription unavailable (add OpenAI provider with whisper-1 for voice notes — chat voice still works on-device with DeepSeek).`;
      }
    } else if (kind === 'image' || kind === 'pdf') {
      const ocr = await tryVisionExtract(item.url, kind);
      if (ocr) {
        base.ocrText = ocr;
        base.extractedText = ocr;
        await recordAgentUsage({
          privateCompanyId: meta?.privateCompanyId ?? null,
          userId: meta?.userId ?? null,
          resourceType: kind === 'image' ? 'vision' : 'ocr',
          quantity: 1,
          provider: 'openai',
        });
      } else {
        base.analysisNote = `${kind} stored at ${item.url}; content extraction pending AI configuration.`;
      }
    } else {
      base.analysisNote = `Document/file stored (${kind}). Full parse may require Phase 2 document AI.`;
    }

    out.push(base);
  }
  return out;
}

export function attachmentsToPromptBlock(items: ProcessedAttachment[]): string {
  if (!items.length) return '';
  return items
    .map((a, i) => {
      const bits = [
        `Attachment ${i + 1}: kind=${a.kind} url=${a.url}`,
        a.name ? `name=${a.name}` : null,
        a.extractedText ? `extracted=<<${a.extractedText.slice(0, 4000)}>>` : null,
        a.analysisNote ? `note=${a.analysisNote}` : null,
      ].filter(Boolean);
      return bits.join(' | ');
    })
    .join('\n');
}

async function tryTranscribe(url: string, kind: string): Promise<string | null> {
  const creds = await resolveTranscribeCredentials();
  if (!creds) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const form = new FormData();
    form.append('file', blob, kind === 'audio' ? 'audio.m4a' : 'video.mp4');
    form.append('model', creds.model);
    const endpoint = `${creds.baseUrl}/audio/transcriptions`;
    const tr = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      body: form,
    });
    if (!tr.ok) return null;
    const data = (await tr.json()) as { text?: string };
    return typeof data.text === 'string' ? data.text.trim() : null;
  } catch (e) {
    console.error('tryTranscribe:', e);
    return null;
  }
}

async function tryVisionExtract(url: string, kind: string): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey || kind === 'pdf') {
    // PDF OCR needs a dedicated path; Phase 1 notes the file only for PDFs without Vision.
    return null;
  }
  try {
    const model = process.env.U_AGENT_MODEL_VISION || 'gpt-4o';
    const tr = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all readable text and briefly describe what this image shows for a field operations agent. Respond in the same language as any visible text when possible.',
              },
              { type: 'image_url', image_url: { url } },
            ],
          },
        ],
        max_tokens: 800,
      }),
    });
    if (!tr.ok) return null;
    const data = (await tr.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === 'string' ? text.trim() : null;
  } catch (e) {
    console.error('tryVisionExtract:', e);
    return null;
  }
}
