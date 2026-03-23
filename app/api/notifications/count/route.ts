import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type');
    if (type === 'pending_tickets') {
      try {
        const count = await prisma.visitorRequest.count({
          where: {
            serviceSlug: 'enterprise-networking',
            status: 'PENDING',
          },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_visitor_tickets') {
      try {
        const count = await prisma.visitorRequest.count({
          where: {
            serviceSlug: { in: ['smart-home-automation', 'custom-software', 'programming'] },
            status: 'PENDING',
          },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_clean_energy_tickets') {
      try {
        const count = await prisma.visitorRequest.count({
          where: {
            serviceSlug: 'clean-energy',
            status: 'PENDING',
          },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_qc_tickets') {
      try {
        const count = await prisma.visitorRequest.count({
          where: { serviceSlug: 'quality-control-supervision', status: 'PENDING' },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_training_requests') {
      try {
        const count = await prisma.trainingRequest.count({
          where: { status: 'PENDING' },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_product_requests') {
      try {
        const count = await prisma.productRequest.count({
          where: { status: 'PENDING' },
        });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'admin_unread') {
      const count = await prisma.notification.count({
        where: { forAdmin: true, read: false },
      });
      return NextResponse.json({ success: true, count });
    }
    return NextResponse.json({ success: false, message: 'Invalid type' }, { status: 400 });
  } catch (error) {
    const err = error as Error;
    console.error('GET /api/notifications/count:', err?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to fetch' }, { status: 500 });
  }
}
