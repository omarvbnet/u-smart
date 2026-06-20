import { NextRequest, NextResponse } from 'next/server';
import { convertDwgToDxf } from '@/lib/studio/dwg-convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 40 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 40 MB)' }, { status: 413 });
    }
    const result = await convertDwgToDxf(buffer);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Conversion failed';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
