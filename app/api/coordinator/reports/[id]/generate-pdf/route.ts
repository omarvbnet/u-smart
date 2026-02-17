import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import { jsPDF } from 'jspdf';

const TYPE_LABELS: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  custom: 'مخصص',
};

/**
 * POST: Generate PDF for a report. Returns PDF in response body; if BLOB_READ_WRITE_TOKEN
 * is set, also uploads to Blob and updates report.pdfUrl.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;

    const report = await prisma.coordinatorReport.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!report) {
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(18);
    doc.text(report.title, 20, 25);
    doc.setFontSize(11);
    doc.text(`النوع: ${TYPE_LABELS[report.type] ?? report.type}`, 20, 35);
    doc.text(
      `الفترة: ${report.periodFrom.toLocaleDateString('ar-IQ')} - ${report.periodTo.toLocaleDateString('ar-IQ')}`,
      20,
      42
    );
    doc.text(`تاريخ التوليد: ${new Date().toLocaleDateString('ar-IQ')}`, 20, 49);
    doc.setFontSize(10);
    doc.text('— تقرير منسق المشاريع الرقمي —', 20, 60);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    let pdfUrl: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob');
      const pathname = `usmart/coordinator-reports/${id}-${Date.now()}.pdf`;
      const blob = await put(pathname, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: false,
      });
      pdfUrl = blob.url;
      await prisma.coordinatorReport.update({
        where: { id },
        data: { pdfUrl },
      });
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${id.slice(-8)}.pdf"`,
        ...(pdfUrl ? { 'X-Pdf-Url': pdfUrl } : {}),
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/reports/[id]/generate-pdf:', e);
    return NextResponse.json({ success: false, message: 'PDF generation failed' }, { status: 500 });
  }
}
