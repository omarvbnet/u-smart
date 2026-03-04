import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { uploadFile } from '@/lib/upload';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const extToType: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
};

/** Public upload for registration evidence (no auth - user not logged in yet) */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }
    // Mobile clients often send application/octet-stream; infer type from extension
    const rawType = (file.type?.toLowerCase() || '').trim();
    const ext = (path.extname(file.name)?.slice(1) || '').toLowerCase();
    const fileType = (rawType && rawType !== 'application/octet-stream')
      ? rawType
      : (extToType[ext] || 'image/jpeg');
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json({ success: false, message: 'Allowed types: PDF, JPEG, PNG, WebP' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, message: 'File too large (max 5MB)' }, { status: 400 });
    }

    const extForName = ext ? `.${ext}` : (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const safeName = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${extForName}`;
    const { url } = await uploadFile({ file, folder: 'registration-evidence', prefix: 'reg', safeName });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error('POST /api/upload/registration-evidence:', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
