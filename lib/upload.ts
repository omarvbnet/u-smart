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
    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return { url: blob.url };
  }

  const localFolder = path.join(process.cwd(), 'public', 'uploads', folder);
  await mkdir(localFolder, { recursive: true });
  const filePath = path.join(localFolder, safeName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
  return { url: `/uploads/${folder}/${safeName}` };
}
