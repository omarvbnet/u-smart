import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, message: 'Allowed types: JPEG, PNG, WebP, GIF, PDF' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, message: 'File too large (max 10MB)' }, { status: 400 });
    }

    const { url } = await uploadFile({ file, folder: 'ticket-attachments', prefix: 'attachment' });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error('POST /api/upload/ticket-attachment:', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
