import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }
    const rawType = file.type?.toLowerCase() || '';
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    const extToType: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
      heic: 'image/heic', heif: 'image/heif',
    };
    const fileType = rawType || extToType[ext] || 'image/jpeg';
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json({ success: false, message: 'Allowed types: JPEG, PNG, WebP, GIF, HEIC, PDF' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, message: 'File too large (max 10MB)' }, { status: 400 });
    }

    const { url } = await uploadFile({ file, folder: 'ticket-attachments', prefix: 'attachment' });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    console.error('POST /api/upload/ticket-attachment:', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
