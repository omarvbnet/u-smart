import { z } from 'zod';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { uploadBuffer } from '@/lib/upload';

const createDocumentInput = z.object({
  title: z.string().min(1).max(160),
  format: z.enum(['md', 'csv', 'txt', 'json', 'pdf']).default('md'),
  content: z.string().min(1).max(120000),
  /** Optional filename without extension */
  fileName: z.string().max(120).optional(),
});

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Minimal multi-line text PDF (Latin + common punctuation). Arabic may need client render. */
function simplePdfFromText(title: string, body: string): Buffer {
  const lines = [`${title}`, '', ...body.replace(/\r\n/g, '\n').split('\n')].slice(0, 80);
  const contentLines: string[] = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL'];
  for (let i = 0; i < lines.length; i++) {
    const line = escapePdfText(lines[i]!.slice(0, 95));
    if (i === 0) contentLines.push(`(${line}) Tj`, 'T*');
    else contentLines.push(`(${line}) Tj`, 'T*');
  }
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objs: string[] = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n'
  );
  objs.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`);
  objs.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += o;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
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
      'Create a downloadable professional file (markdown, CSV, TXT, JSON, or PDF) from structured content the user requested (reports, tables, letters, summaries). Return the public URL so the user can open/share it.',
    category: 'documents',
    riskLevel: 'LOW',
    requiresApproval: false,
    requiredPermissions: ['agent.create_document'],
    enabled: true,
    version: '1',
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
      let contentType = MIME[parsed.format] || 'application/octet-stream';

      if (parsed.format === 'pdf') {
        data = simplePdfFromText(parsed.title, parsed.content);
      } else if (parsed.format === 'json') {
        try {
          JSON.parse(parsed.content);
          data = Buffer.from(parsed.content, 'utf8');
        } catch {
          data = Buffer.from(JSON.stringify({ title: parsed.title, body: parsed.content }, null, 2), 'utf8');
        }
      } else {
        const header =
          parsed.format === 'md'
            ? `# ${parsed.title}\n\n`
            : parsed.format === 'csv'
              ? ''
              : `${parsed.title}\n${'='.repeat(Math.min(parsed.title.length, 40))}\n\n`;
        data = Buffer.from(header + parsed.content, 'utf8');
      }

      const { url } = await uploadBuffer({
        data,
        folder: 'u-agent/docs',
        prefix: ctx.userId.slice(0, 12),
        filename,
        contentType,
      });

      return {
        ok: true,
        message: `Created ${filename}`,
        data: {
          url,
          name: filename,
          title: parsed.title,
          contentType,
          format: parsed.format,
          kind: 'document',
          size: data.length,
        },
      };
    },
  });
}
