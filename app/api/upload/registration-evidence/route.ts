import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { uploadFile } from '@/lib/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const extToType: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function jsonBody(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Public upload for registration / company-upgrade evidence (Provisor profile). */
export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (err) {
      console.error('POST /api/upload/registration-evidence formData:', err);
      return jsonBody({ success: false, message: 'Invalid upload request body' }, 400);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string' || !(file instanceof File)) {
      return jsonBody({ success: false, message: 'No file provided' }, 400);
    }

    const rawType = (file.type?.toLowerCase() || '').trim();
    const ext = (path.extname(file.name)?.slice(1) || '').toLowerCase();
    const fileType =
      rawType && rawType !== 'application/octet-stream' ? rawType : extToType[ext] || '';

    if (!fileType || !ALLOWED_TYPES.includes(fileType)) {
      return jsonBody(
        { success: false, message: 'Allowed types: PDF, JPEG, PNG, WebP' },
        400
      );
    }
    if (file.size <= 0) {
      return jsonBody({ success: false, message: 'File is empty' }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonBody({ success: false, message: 'File too large (max 5MB)' }, 400);
    }

    const extForName = ext ? `.${ext}` : fileType === 'application/pdf' ? '.pdf' : '.jpg';
    const safeName = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${extForName}`;

    const { url } = await uploadFile({
      file,
      folder: 'registration-evidence',
      prefix: 'reg',
      safeName,
    });

    if (!url || typeof url !== 'string' || !url.trim()) {
      return jsonBody({ success: false, message: 'Upload failed: no file URL returned' }, 500);
    }

    return jsonBody({ success: true, url: url.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    console.error('POST /api/upload/registration-evidence:', err);
    return jsonBody({ success: false, message: msg }, 500);
  }
}

/** Some clients probe with OPTIONS; return JSON so proxies never send an empty body. */
export async function OPTIONS() {
  return jsonBody({ success: true });
}
