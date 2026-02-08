import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * Upload a file: use Vercel Blob when BLOB_READ_WRITE_TOKEN is set (e.g. on Vercel),
 * otherwise save to local public/uploads (for local dev). Vercel's filesystem is read-only
 * so local writes would fail in production.
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
  const pathname = `uploads/${folder}/${safeName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return { url: blob.url };
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', folder);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
  return { url: `/uploads/${folder}/${safeName}` };
}
