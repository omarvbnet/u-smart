import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { uploadFile } from '@/lib/upload';
import { processAgentAttachments } from '@/lib/agent/multimodal/process';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'file is required' }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'File too large (max 25MB)' }, { status: 400 });
    }

    const processNow = String(form.get('process') || 'true').toLowerCase() !== 'false';

    const { url } = await uploadFile({
      file,
      folder: 'u-agent',
      prefix: auth.ctx.userId.slice(0, 12),
    });

    let processed = null;
    if (processNow) {
      const [item] = await processAgentAttachments(
        [{ url, name: file.name, contentType: file.type || null, size: file.size }],
        { privateCompanyId: auth.ctx.privateCompanyId, userId: auth.ctx.userId }
      );
      processed = item ?? null;
    }

    return NextResponse.json({
      success: true,
      url,
      name: file.name,
      contentType: file.type || null,
      size: file.size,
      processed,
    });
  } catch (e) {
    console.error('POST /api/agent/files:', e);
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
