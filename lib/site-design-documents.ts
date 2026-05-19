import { newQfieldEntityId } from '@/lib/qfield-projects';

export type SiteDesignDocumentStored = {
  id: string;
  url: string;
  fileName: string;
  title?: string | null;
  uploadedAt: string;
  mimeType?: string | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function parseSiteDesignDocuments(raw: unknown): SiteDesignDocumentStored[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteDesignDocumentStored[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const fileName = typeof item.fileName === 'string' ? item.fileName.trim() : '';
    if (!url || !fileName) continue;
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : newQfieldEntityId();
    const title = typeof item.title === 'string' ? item.title.trim() : null;
    const uploadedAt =
      typeof item.uploadedAt === 'string' && item.uploadedAt
        ? item.uploadedAt
        : new Date().toISOString();
    const mimeType =
      typeof item.mimeType === 'string' && item.mimeType.trim()
        ? item.mimeType.trim()
        : fileName.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : null;
    out.push({
      id,
      url,
      fileName,
      title: title || null,
      uploadedAt,
      mimeType,
    });
  }
  return out;
}

export function normalizeSiteDesignDocumentsInput(raw: unknown): SiteDesignDocumentStored[] {
  if (!Array.isArray(raw)) return [];
  const now = new Date().toISOString();
  const out: SiteDesignDocumentStored[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const fileName = typeof item.fileName === 'string' ? item.fileName.trim() : '';
    if (!url || !fileName) continue;
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : newQfieldEntityId();
    const title = typeof item.title === 'string' ? item.title.trim() : null;
    out.push({
      id,
      url,
      fileName,
      title: title || null,
      uploadedAt: typeof item.uploadedAt === 'string' ? item.uploadedAt : now,
      mimeType:
        typeof item.mimeType === 'string' && item.mimeType.trim()
          ? item.mimeType.trim()
          : fileName.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : null,
    });
  }
  return out;
}

export function siteDesignDocumentsToJsonValue(docs: SiteDesignDocumentStored[]): unknown {
  return docs.map((d) => ({
    id: d.id,
    url: d.url,
    fileName: d.fileName,
    title: d.title ?? null,
    uploadedAt: d.uploadedAt,
    mimeType: d.mimeType ?? null,
  }));
}
