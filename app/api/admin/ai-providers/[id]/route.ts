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

async function resolveId(params: Promise<unknown>): Promise<string | null> {
  const p = await params;
  if (!p || typeof p !== 'object') return null;
  const id = (p as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<unknown> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  const id = await resolveId(params);
  if (!id || !prisma.uAgentAiProvider?.update) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if (typeof body.kind === 'string' && KINDS.has(body.kind.toUpperCase())) {
    data.kind = body.kind.toUpperCase();
  }
  if (typeof body.baseUrl === 'string') data.baseUrl = body.baseUrl.trim() || null;
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (typeof body.priority === 'number') data.priority = body.priority;
  if (typeof body.modelFast === 'string') data.modelFast = body.modelFast || null;
  if (typeof body.modelReason === 'string') data.modelReason = body.modelReason || null;
  if (typeof body.modelVision === 'string') data.modelVision = body.modelVision || null;
  if (typeof body.modelEmbed === 'string') data.modelEmbed = body.modelEmbed || null;
  if (typeof body.modelTranscribe === 'string') data.modelTranscribe = body.modelTranscribe || null;
  if (typeof body.notes === 'string') data.notes = body.notes || null;
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    data.apiKeyEncrypted = encryptSecret(body.apiKey.trim());
  }
  if (body.isDefault === true) {
    const existing = await prisma.uAgentAiProvider.findUnique({
      where: { id },
      select: { kind: true },
    });
    const kindForDefault =
      (typeof body.kind === 'string' && KINDS.has(body.kind.toUpperCase())
        ? body.kind.toUpperCase()
        : existing?.kind) || 'OPENAI';
    await clearDefaultPeers(String(kindForDefault));
    data.isDefault = true;
  } else if (body.isDefault === false) {
    data.isDefault = false;
  }

  try {
    const row = await prisma.uAgentAiProvider.update({ where: { id }, data });
    invalidateAiProviderCache();
    return NextResponse.json({ success: true, provider: publicRow(row) });
  } catch (e) {
    console.error('PATCH ai-providers:', e);
    return NextResponse.json({ success: false, message: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<unknown> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  const id = await resolveId(params);
  if (!id || !prisma.uAgentAiProvider?.delete) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  try {
    await prisma.uAgentAiProvider.delete({ where: { id } });
    invalidateAiProviderCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
