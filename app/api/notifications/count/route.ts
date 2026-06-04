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
    if (type === 'pending_private_companies') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (prisma as any).privateCompany;
        if (!delegate?.count) return NextResponse.json({ success: true, count: 0 });
        const count = await delegate.count({ where: { status: 'PENDING' } });
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_upgrade_requests') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = prisma as any;
        let individual = 0;
        let privateCount = 0;
        if (p.registrationRequest?.count) {
          individual = await p.registrationRequest.count({
            where: { requesterId: { not: null }, role: 'COMPANY', status: 'PENDING' },
          });
        }
        if (p.privateCompany?.count) {
          privateCount = await p.privateCompany.count({ where: { status: 'PENDING' } });
        }
        return NextResponse.json({ success: true, count: individual + privateCount });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_conflicts') {
      try {
        // Open conflicts = visitor_request rows whose JSON `company` field contains a conflictReported flag
        // and whose conflictStatus is still pending (not yet resolved or sent for re-inspection).
        // We mirror the cheap heuristic used by /api/admin/conflicts.
        const rows = await prisma.visitorRequest.findMany({
          where: { company: { contains: 'conflictReported' } },
          select: { company: true },
          take: 5000,
        });
        let count = 0;
        for (const r of rows) {
          try {
            const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : null;
            if (!parsed) continue;
            if (parsed.conflictReported !== true) continue;
            const s = String(parsed.conflictStatus ?? 'pending').toLowerCase();
            if (s === 'pending') count++;
          } catch {
            /* skip malformed rows */
          }
        }
        return NextResponse.json({ success: true, count });
      } catch {
        return NextResponse.json({ success: true, count: 0 });
      }
    }
    if (type === 'pending_staff_registrations') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (prisma as any).staffRegistrationRequest;
        if (!delegate?.count) return NextResponse.json({ success: true, count: 0 });
        const count = await delegate.count({ where: { status: 'PENDING' } });
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
