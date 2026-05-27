import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';

// Pin to Node.js runtime so Vercel allocates the expanded body buffer used
// for multipart uploads. Edge runtime caps body size lower than Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const fetchCache = 'force-no-store';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function jsonBody(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isPayloadTooLargeError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('payload too large') ||
    msg.includes('request entity too large') ||
    msg.includes('body exceeded') ||
    msg.includes('content length') ||
    msg.includes('maximum allowed size') ||
    msg.includes('functions_payload') ||
    msg.includes('413')
  );
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error('POST /api/upload/ticket-image formData:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Image exceeds the upload limit (max 5MB).',
        },
        413
      );
    }
    return jsonBody({ success: false, message: 'Invalid upload request body' }, 400);
  }

  try {
    const file = formData.get('file');
    if (!file || typeof file === 'string' || !(file instanceof File)) {
      return jsonBody({ success: false, message: 'No file provided' }, 400);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonBody({ success: false, message: 'Allowed types: JPEG, PNG, WebP, GIF' }, 400);
    }
    if (file.size <= 0) {
      return jsonBody({ success: false, message: 'File is empty' }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File too large (max 5MB)',
        },
        413
      );
    }

    const { url } = await uploadFile({ file, folder: 'ticket-images', prefix: 'ticket' });
    return jsonBody({ success: true, url });
  } catch (err) {
    console.error('POST /api/upload/ticket-image:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Image exceeded the server upload limit.',
        },
        413
      );
    }
    return jsonBody({ success: false, message: 'Upload failed' }, 500);
  }
}

export async function OPTIONS() {
  return jsonBody({ success: true });
}
