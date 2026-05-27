import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// Pin to Node.js runtime + opt out of caching/static optimization so the
// expanded body buffer used for multipart uploads is allocated on Pro/Fluid
// plans. Matches the rest of /api/upload/* and avoids the Edge body cap.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const fetchCache = 'force-no-store';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE = 5 * 1024 * 1024;

// Mobile clients (Dart `http.MultipartFile.fromBytes`) default the part's
// Content-Type to `application/octet-stream`. Map known image extensions to
// real MIME types so the API doesn't 400 on an otherwise valid photo.
const EXT_TO_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

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
    return jsonBody({ success: false, message: 'Not authenticated' }, 401);
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return jsonBody(
      { success: false, message: 'Coordinator users update their photo via their company.' },
      403
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error('POST /api/profile/photo formData:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Image is larger than the server upload limit. Please pick a smaller photo.',
        },
        413
      );
    }
    return jsonBody({ success: false, message: 'Invalid upload request body' }, 400);
  }

  try {
    const file = form.get('file');
    if (!file || typeof file === 'string' || !(file instanceof File)) {
      return jsonBody({ success: false, message: 'No image provided' }, 400);
    }
    if (file.size <= 0) {
      return jsonBody({ success: false, message: 'Image is empty' }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonBody(
        { success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Image too large (max 5MB).' },
        413
      );
    }

    // Resolve a usable MIME, tolerating mobile clients that send
    // `application/octet-stream` or an empty content-type for binary uploads.
    const rawType = (file.type?.toLowerCase() || '').trim();
    const ext = (path.extname(file.name)?.slice(1) || '').toLowerCase();
    const fileType =
      rawType && rawType !== 'application/octet-stream'
        ? rawType
        : EXT_TO_TYPE[ext] || '';

    if (!fileType || !ALLOWED_TYPES.includes(fileType)) {
      return jsonBody(
        { success: false, message: 'Allowed types: JPEG, PNG, WebP, HEIC.' },
        400
      );
    }

    const safeExt = ext ? `.${ext}` : fileType === 'image/png' ? '.png' : '.jpg';
    const safeName = `${auth.payload.requesterId}-${Date.now()}${safeExt}`;
    const { url } = await uploadFile({
      file,
      folder: 'profile-photos',
      prefix: 'profile',
      safeName,
    });

    if (!url || typeof url !== 'string' || !url.trim()) {
      return jsonBody({ success: false, message: 'Upload failed: no file URL returned' }, 500);
    }

    await (prisma.ticketRequester as unknown as {
      update: (args: { where: { id: string }; data: { photoUrl: string | null } }) => Promise<unknown>;
    }).update({
      where: { id: auth.payload.requesterId },
      data: { photoUrl: url },
    });

    return jsonBody({ success: true, photoUrl: url });
  } catch (err) {
    console.error('POST /api/profile/photo:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        { success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Image exceeded the server upload limit.' },
        413
      );
    }
    return jsonBody({ success: false, message: 'Photo upload failed' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return jsonBody({ success: false, message: 'Not authenticated' }, 401);
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return jsonBody(
      { success: false, message: 'Coordinator users manage their photo via their company.' },
      403
    );
  }
  try {
    await (prisma.ticketRequester as unknown as {
      update: (args: { where: { id: string }; data: { photoUrl: string | null } }) => Promise<unknown>;
    }).update({
      where: { id: auth.payload.requesterId },
      data: { photoUrl: null },
    });
    return jsonBody({ success: true, photoUrl: null });
  } catch (err) {
    console.error('DELETE /api/profile/photo:', err);
    return jsonBody({ success: false, message: 'Failed to clear photo' }, 500);
  }
}

export async function OPTIONS() {
  return jsonBody({ success: true });
}
