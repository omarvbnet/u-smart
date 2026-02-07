import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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

    const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : file.type === 'image/png' ? '.png' : '.jpg');
    const safeName = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    const dir = path.join(process.cwd(), 'public', 'uploads', 'ticket-attachments');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const url = `/uploads/ticket-attachments/${safeName}`;
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error('POST /api/upload/ticket-attachment:', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
