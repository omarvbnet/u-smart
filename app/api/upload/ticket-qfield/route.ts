import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const MAX_SIZE = 90 * 1024 * 1024; // 90MB — QField packages / GeoPackage can be large

const ALLOWED_EXT = new Set(['qgz', 'zip', 'gpkg', 'qgs', 'qgs~']);

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
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Allowed QField / GIS packages: .qgz, .zip, .gpkg, .qgs',
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, message: 'File too large (max 90MB)' }, { status: 400 });
    }

    const { url } = await uploadFile({
      file,
      folder: 'ticket-qfield',
      prefix: 'qfield',
    });
    return NextResponse.json({ success: true, url, fileName: file.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    console.error('POST /api/upload/ticket-qfield:', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
