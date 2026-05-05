import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

const prisma = _prisma as any;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const fromDate = from ? new Date(from) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  const toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  try {
    const companies = await prisma.coordinatorCompany.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        activeTicketPlan: true,
        freeTicketsUsed: true,
        freeTicketsLimit: true,
      },
    });
    const payments = await prisma.coordinatorPayment.findMany({
      where: fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amountCents: true,
        status: true,
        createdAt: true,
        stripePaymentIntentId: true,
        subscription: {
          select: {
            id: true,
            companyId: true,
            company: {
              select: { name: true, slug: true },
            },
          },
        },
      },
    });
    const invoices = await prisma.coordinatorInvoice.findMany({
      where: fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amountCents: true,
        periodFrom: true,
        periodTo: true,
        pdfUrl: true,
        createdAt: true,
        subscription: {
          select: {
            id: true,
            companyId: true,
            company: {
              select: { name: true, slug: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      companies,
      payments,
      invoices,
      totals: {
        paymentsCents: payments.reduce((sum: number, p: { amountCents?: number }) => sum + (p.amountCents ?? 0), 0),
        invoicesCents: invoices.reduce((sum: number, i: { amountCents?: number }) => sum + (i.amountCents ?? 0), 0),
      },
    });
  } catch (error) {
    console.error('GET /api/admin/company-payments:', error);
    return NextResponse.json({ success: false, message: 'Failed to load payment data.' }, { status: 500 });
  }
}
