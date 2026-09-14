import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-require';
import { prisma as _prisma } from '@/lib/prisma';
import { encryptSecret, isSecretDecryptable, maskApiKey } from '@/lib/agent/providers/secrets';
import { invalidateAiProviderCache } from '@/lib/agent/providers/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const KINDS = new Set(['OPENAI', 'DEEPSEEK', 'CLAUDE', 'CUSTOM', 'HAMSA']);

async function clearDefaultPeers(kind: string) {
  if (kind === 'HAMSA') {
    await prisma.uAgentAiProvider.updateMany({
      where: { kind: 'HAMSA' },
      data: { isDefault: false },
    });
  } else {
    await prisma.uAgentAiProvider.updateMany({
      where: { kind: { not: 'HAMSA' } },
      data: { isDefault: false },
    });
  }
}

function publicRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    isDefault: row.isDefault,
    priority: row.priority,
    modelFast: row.modelFast,
    modelReason: row.modelReason,
    modelVision: row.modelVision,
    modelEmbed: row.modelEmbed,
    modelTranscribe: row.modelTranscribe,
    notes: row.notes,
    apiKeyMasked: maskApiKey(row.apiKeyEncrypted as string | null),
    hasApiKey: !!row.apiKeyEncrypted,
    keyDecryptable: isSecretDecryptable(row.apiKeyEncrypted as string | null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!prisma.uAgentAiProvider?.findMany) {
    return NextResponse.json({
      success: true,
      providers: [],
      message: 'Run prisma migrate deploy to enable AI provider storage.',
    });
  }
  const rows = await prisma.uAgentAiProvider.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({
    success: true,
    providers: rows.map((r: Record<string, unknown>) => publicRow(r)),
    presets: {
      OPENAI: {
        baseUrl: 'https://api.openai.com/v1',
        modelFast: 'gpt-4o-mini',
        modelReason: 'gpt-4o',
        modelVision: 'gpt-4o',
        modelTranscribe: 'whisper-1',
      },
      DEEPSEEK: {
        baseUrl: 'https://api.deepseek.com',
        modelFast: 'deepseek-chat',
        modelReason: 'deepseek-reasoner',
        modelVision: '',
        modelTranscribe: '',
      },
      CLAUDE: {
        baseUrl: 'https://api.anthropic.com',
        modelFast: 'claude-3-5-haiku-latest',
        modelReason: 'claude-sonnet-4-20250514',
        modelVision: 'claude-sonnet-4-20250514',
        modelTranscribe: '',
      },
      CUSTOM: {
        baseUrl: 'https://your-gateway.example/v1',
        modelFast: 'your-model',
        modelReason: 'your-model',
        modelVision: '',
        modelTranscribe: '',
      },
      HAMSA: {
        baseUrl: 'https://api.tryhamsa.com',
        modelFast: 'Lyali',
        modelReason: 'irq',
        modelVision: '',
        modelTranscribe: '',
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!prisma.uAgentAiProvider?.create) {
    return NextResponse.json({ success: false, message: 'Migration required' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const kind = String(body.kind || '').toUpperCase();
  if (!KINDS.has(kind)) {
    return NextResponse.json(
      { success: false, message: 'kind must be OPENAI|DEEPSEEK|CLAUDE|CUSTOM|HAMSA' },
      { status: 400 }
    );
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slugRaw = typeof body.slug === 'string' ? body.slug.trim() : name;
  const slug = slugRaw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  if (!name || !slug) {
    return NextResponse.json({ success: false, message: 'name and slug are required' }, { status: 400 });
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'apiKey is required' }, { status: 400 });
  }

  const isDefault = body.isDefault === true;
  if (isDefault) {
    await clearDefaultPeers(kind);
  }

  try {
    const row = await prisma.uAgentAiProvider.create({
      data: {
        slug,
        name,
        kind,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim() || null : null,
        apiKeyEncrypted: encryptSecret(apiKey),
        enabled: body.enabled !== false,
        isDefault,
        priority: typeof body.priority === 'number' ? body.priority : 100,
        modelFast: typeof body.modelFast === 'string' ? body.modelFast : null,
        modelReason: typeof body.modelReason === 'string' ? body.modelReason : null,
        modelVision: typeof body.modelVision === 'string' ? body.modelVision : null,
        modelEmbed: typeof body.modelEmbed === 'string' ? body.modelEmbed : null,
        modelTranscribe: typeof body.modelTranscribe === 'string' ? body.modelTranscribe : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
      },
    });
    invalidateAiProviderCache();
    return NextResponse.json({ success: true, provider: publicRow(row) });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Slug already exists' }, { status: 409 });
    }
    console.error('POST ai-providers:', e);
    return NextResponse.json({ success: false, message: 'Create failed' }, { status: 500 });
  }
}
