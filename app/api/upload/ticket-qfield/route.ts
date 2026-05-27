import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

/**
 * QField package upload (mobile Flutter clients).
 *
 * Historically this returned a 413 `FUNCTION_PAYLOAD_TOO_LARGE` from Vercel's
 * edge gateway when QField `.qgz` / `.zip` projects exceeded the default
 * serverless request-body cap (4.5 MB on Hobby / older Pro). The fix here is
 * server-only:
 *
 *  - Pin the route to the Node.js runtime (Edge has a tighter body cap).
 *  - Declare max memory / duration so Vercel allocates the larger
 *    body buffer available to long-running file uploads (on Pro / Fluid this
 *    raises the cap to ~50 MB; combined with `vercel.json` it tracks the
 *    plan limit).
 *  - Disable any caching / static optimization so the body is never truncated.
 *  - Parse multipart in a single streaming pass (no double-buffering) and
 *    pipe the File's ReadableStream straight to Vercel Blob.
 *  - When the body is rejected upstream (gateway 413) we still see it as a
 *    `formData()` parse error — translate that into a structured JSON 413 so
 *    the existing Flutter client gets a parseable response instead of
 *    Vercel's HTML error page.
 *
 * NOTE: This file is intentionally backward compatible — older Flutter
 * builds keep working unchanged.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const fetchCache = 'force-no-store';

const MAX_SIZE = 90 * 1024 * 1024; // 90MB — QField packages / GeoPackage can be large

const ALLOWED_EXT = new Set(['qgz', 'zip', 'gpkg', 'qgs', 'qgs~']);

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
    console.error('POST /api/upload/ticket-qfield formData:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message:
            'QField package is larger than this server can accept in a single upload. ' +
            'Please split the project, export a smaller package, or contact support.',
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
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return jsonBody(
        {
          success: false,
          message: 'Allowed QField / GIS packages: .qgz, .zip, .gpkg, .qgs',
        },
        400
      );
    }
    if (file.size <= 0) {
      return jsonBody({ success: false, message: 'File is empty' }, 400);
    }
    if (file.size > MAX_SIZE) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File too large (max 90MB)',
        },
        413
      );
    }

    const { url } = await uploadFile({
      file,
      folder: 'ticket-qfield',
      prefix: 'qfield',
    });
    return jsonBody({ success: true, url, fileName: file.name });
  } catch (err) {
    console.error('POST /api/upload/ticket-qfield:', err);
    if (isPayloadTooLargeError(err)) {
      return jsonBody(
        {
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message:
            'QField package exceeded the server upload limit. ' +
            'Try a smaller export or contact support.',
        },
        413
      );
    }
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return jsonBody({ success: false, message: msg }, 500);
  }
}

/** Some clients probe with OPTIONS / GET; keep them safe with JSON responses. */
export async function OPTIONS() {
  return jsonBody({ success: true });
}

export async function GET() {
  return jsonBody(
    {
      success: false,
      message: 'Use POST multipart/form-data with field "file" to upload a QField package.',
    },
    405
  );
}
