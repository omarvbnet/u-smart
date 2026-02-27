import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
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
    const fileType = file.type || (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    if (!ALLOWED_TYPES.includes(fileType)) {
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
