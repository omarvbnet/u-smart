import { z } from 'zod';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { uploadBuffer } from '@/lib/upload';
import { toProviserPublicFileUrl } from '@/lib/agent/docs/public-url';
import { getProviserWebOrigin } from '@/lib/proviser-host';

const createDocumentInput = z.object({
  title: z.string().min(1).max(160),
  format: z.enum(['md', 'csv', 'txt', 'json', 'pdf']).default('md'),
  content: z.string().min(1).max(120000),
  /** Optional filename without extension */
  fileName: z.string().max(120).optional(),
  /** Document kind for letterhead styling */
  docType: z.enum(['report', 'letter', 'summary', 'table', 'memo']).optional(),
  subtitle: z.string().max(200).optional(),
});

function baghdadStamp(): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

function buildLetterhead(opts: {
  title: string;
  subtitle?: string;
  docType?: string;
  format: 'md' | 'txt';
}): string {
  const origin = getProviserWebOrigin();
  const stamp = baghdadStamp();
  const kind = (opts.docType || 'document').toUpperCase();
  if (opts.format === 'md') {
    return [
      `# ${opts.title}`,
      '',
      opts.subtitle ? `*${opts.subtitle}*` : '',
      '',
      `| | |`,
      `|---|---|`,
      `| **Organization** | Proviser · U Smart |`,
      `| **Document** | ${kind} |`,
      `| **Issued** | ${stamp} (Asia/Baghdad) |`,
      `| **Portal** | ${origin} |`,
      '',
      '---',
      '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }
  const bar = '='.repeat(Math.min(56, Math.max(24, opts.title.length + 8)));
  return [
    bar,
    'PROVISER · U SMART',
    bar,
    opts.title,
    opts.subtitle || '',
    `${kind}  ·  ${stamp} (Asia/Baghdad)`,
    origin,
    bar,
    '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Multi-page text PDF with Proviser footer. Prefer md/txt for full Arabic Unicode. */
function professionalPdfFromText(title: string, body: string, subtitle?: string): Buffer {
  const origin = getProviserWebOrigin();
  const stamp = baghdadStamp();
  const rawLines = [
    'PROVISER · U SMART',
    title,
    subtitle || '',
    `Issued: ${stamp} (Asia/Baghdad)`,
    origin,
    '',
    ...body.replace(/\r\n/g, '\n').split('\n'),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));

  const maxLinesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < rawLines.length; i += maxLinesPerPage) {
    pages.push(rawLines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push(['(empty)']);

  const objs: string[] = [];
  // We'll assemble after knowing page count — use placeholders via building page objects first
  const pageContentStreams: string[] = [];
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p]!;
    const contentLines: string[] = ['BT', '/F1 11 Tf', '48 760 Td', '13 TL'];
    for (let i = 0; i < lines.length; i++) {
      const line = escapePdfText(lines[i]!.slice(0, 96));
      contentLines.push(`(${line}) Tj`, 'T*');
    }
    contentLines.push('ET');
    // footer
    contentLines.push(
      'BT',
      '/F1 8 Tf',
      '48 36 Td',
      `(${escapePdfText(`Proviser  ·  ${origin}  ·  page ${p + 1}/${pages.length}`)}) Tj`,
      'ET'
    );
    pageContentStreams.push(contentLines.join('\n'));
  }

  const kids: string[] = [];
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(nextId++);
    contentIds.push(nextId++);
  }

  const objectMap = new Map<number, string>();
  objectMap.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (let i = 0; i < pages.length; i++) {
    kids.push(`${pageIds[i]} 0 R`);
    objectMap.set(
      pageIds[i]!,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[i]} 0 R /Resources<< /Font<< /F1 ${fontId} 0 R >> >> >>`
    );
    const stream = pageContentStreams[i]!;
    objectMap.set(
      contentIds[i]!,
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream`
    );
  }
  objectMap.set(pagesId, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
  objectMap.set(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextId; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${id} 0 obj\n${objectMap.get(id)}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${nextId}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < nextId; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

const MIME: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
};

export function registerDocumentTools(): void {
  registerTool({
    id: 'create_document',
    name: 'Create professional document',
    description:
      'Create a branded Proviser downloadable file (markdown, CSV, TXT, JSON, or PDF): reports, letters, tables, summaries. Prefer md for Arabic. Always include the returned Proviser download URL (proviser.usmart-iot.com) in your reply.',
    category: 'documents',
    riskLevel: 'LOW',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.create_document'],
    enabled: true,
    version: '2',
    timeoutMs: 30000,
    inputSchema: createDocumentInput,
    jsonSchema: zodToJsonSchemaRough(createDocumentInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = createDocumentInput.parse(input);
      const baseName = (parsed.fileName || parsed.title)
        .replace(/[^\w\u0600-\u06FF.-]+/g, '_')
        .slice(0, 80);
      const filename = `${baseName}.${parsed.format}`;
      let data: Buffer;
      const contentType = MIME[parsed.format] || 'application/octet-stream';

      if (parsed.format === 'pdf') {
        data = professionalPdfFromText(parsed.title, parsed.content, parsed.subtitle);
      } else if (parsed.format === 'json') {
        try {
          const parsedJson = JSON.parse(parsed.content);
          data = Buffer.from(
            JSON.stringify(
              {
                organization: 'Proviser · U Smart',
                portal: getProviserWebOrigin(),
                title: parsed.title,
                subtitle: parsed.subtitle || null,
                docType: parsed.docType || 'document',
                issuedAt: baghdadStamp(),
                timezone: 'Asia/Baghdad',
                content: parsedJson,
              },
              null,
              2
            ),
            'utf8'
          );
        } catch {
          data = Buffer.from(
            JSON.stringify(
              {
                organization: 'Proviser · U Smart',
                portal: getProviserWebOrigin(),
                title: parsed.title,
                issuedAt: baghdadStamp(),
                body: parsed.content,
              },
              null,
              2
            ),
            'utf8'
          );
        }
      } else if (parsed.format === 'csv') {
        data = Buffer.from(parsed.content, 'utf8');
      } else {
        const header = buildLetterhead({
          title: parsed.title,
          subtitle: parsed.subtitle,
          docType: parsed.docType,
          format: parsed.format,
        });
        data = Buffer.from(header + parsed.content, 'utf8');
      }

      const uploaded = await uploadBuffer({
        data,
        folder: 'u-agent/docs',
        prefix: ctx.userId.slice(0, 12),
        filename,
        contentType,
      });
      const { publicUrl, storageUrl } = toProviserPublicFileUrl(uploaded.url);

      return {
        ok: true,
        message: `Created professional document ${filename}`,
        data: {
          url: publicUrl,
          storageUrl,
          name: filename,
          title: parsed.title,
          contentType,
          format: parsed.format,
          kind: 'document',
          size: data.length,
          portal: getProviserWebOrigin(),
        },
      };
    },
  });
}
