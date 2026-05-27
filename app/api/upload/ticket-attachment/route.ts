import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// Pin to Node.js runtime + large memory/duration so Vercel allocates the
// expanded body buffer used for multipart uploads on Pro / Fluid plans.
// See app/api/upload/ticket-qfield/route.ts for full context.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const fetchCache = 'force-no-store';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return jsonBody({ success: false, message: 'Unauthorized' }, 401);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error('POST /api/upload/ticket-attachment formData:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Attachment exceeds the upload limit. Please compress or split the file.',
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
    const rawType = (file.type?.toLowerCase() || '').trim();
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    const extToType: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
      heic: 'image/heic', heif: 'image/heif',
    };
    // Mobile clients often send application/octet-stream; rely on extension in that case
    const fileType = (rawType && rawType !== 'application/octet-stream')
      ? rawType
      : (extToType[ext] || 'image/jpeg');
    if (!ALLOWED_TYPES.includes(fileType)) {
      return jsonBody({ success: false, message: 'Allowed types: JPEG, PNG, WebP, GIF, HEIC, PDF' }, 400);
    }
    if (file.size <= 0) {
      return jsonBody({ success: false, message: 'File is empty' }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File too large (max 10MB)',
        },
        413
      );
    }

    const { url } = await uploadFile({ file, folder: 'ticket-attachments', prefix: 'attachment' });
    return jsonBody({ success: true, url });
  } catch (err) {
    console.error('POST /api/upload/ticket-attachment:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Attachment exceeded the server upload limit.',
        },
        413
      );
    }
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return jsonBody({ success: false, message: msg }, 500);
  }
}

export async function OPTIONS() {
  return jsonBody({ success: true });
}
