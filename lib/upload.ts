import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const BLOB_PATH_PREFIX = 'usmart';

/**
 * Upload a file for use in the app (ticket attachments, certifications, etc.).
 *
 * - On Vercel (or when BLOB_READ_WRITE_TOKEN is set): uploads to Vercel Blob and returns
 *   the public Blob URL (https://...). Set the token in Vercel: Project → Storage → Blob → Connect.
 * - Local dev without token: saves to public/uploads/ for same-origin viewing.
 *
 * Stored URLs are used as-is when viewing attachments; Blob URLs work from anywhere.
 */
export async function uploadFile(options: {
  file: File;
  folder: string;
  prefix: string;
  /** Optional custom filename (e.g. requesterId-timestamp); otherwise generated. */
  safeName?: string;
}): Promise<{ url: string }> {
  const { file, folder, prefix, safeName: customName } = options;
  const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
  const safeName = customName ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const pathname = `${BLOB_PATH_PREFIX}/${folder}/${safeName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    // Stream the file body directly to Blob storage rather than buffering the
    // entire payload twice in function memory. `file.stream()` exposes a
    // standard ReadableStream which @vercel/blob's `put` accepts natively and
    // forwards as chunked transfer-encoding. This is essential for large
    // QField / GeoPackage uploads where loading the whole file into memory
    // would push the serverless function over its allocation.
    const body: ReadableStream<Uint8Array> | File =
      typeof file.stream === 'function' ? file.stream() : file;
    const blob = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    if (!blob?.url) {
      throw new Error('File upload succeeded but no URL was returned.');
    }
    return { url: blob.url };
  }

  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    throw new Error(
      'File storage is not configured on the server (missing BLOB_READ_WRITE_TOKEN).'
    );
  }

  const localFolder = path.join(process.cwd(), 'public', 'uploads', folder);
  await mkdir(localFolder, { recursive: true });
  const filePath = path.join(localFolder, safeName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
  return { url: `/uploads/${folder}/${safeName}` };
}

/** Upload raw bytes (agent-generated docs, exports, etc.). */
export async function uploadBuffer(options: {
  data: Buffer | Uint8Array;
  folder: string;
  prefix: string;
  filename: string;
  contentType?: string;
}): Promise<{ url: string }> {
  const { data, folder, prefix, filename, contentType } = options;
  const ext = path.extname(filename) || '';
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9._\u0600-\u06FF-]+/g, '_').slice(0, 80);
  const safeName = `${prefix}-${Date.now()}-${base}${ext || '.bin'}`;
  const pathname = `${BLOB_PATH_PREFIX}/${folder}/${safeName}`;
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: true,
      contentType: contentType || undefined,
    });
    if (!blob?.url) {
      throw new Error('File upload succeeded but no URL was returned.');
    }
    return { url: blob.url };
  }

  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    throw new Error(
      'File storage is not configured on the server (missing BLOB_READ_WRITE_TOKEN).'
    );
  }

  const localFolder = path.join(process.cwd(), 'public', 'uploads', folder);
  await mkdir(localFolder, { recursive: true });
  const filePath = path.join(localFolder, safeName);
  await writeFile(filePath, body);
  return { url: `/uploads/${folder}/${safeName}` };
}
