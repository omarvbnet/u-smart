/**
 * POST /api/admin/bootstrap-sample
 * One-time endpoint to seed sample coordinator company + staff accounts.
 * Protected by BOOTSTRAP_SECRET env var (or falls back to a fixed key).
 * Call once on production to create the sample accounts, then disable/delete this file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const prisma = _prisma as any;

const ALLOWED_SECRET =
  process.env.BOOTSTRAP_SECRET || 'usmart-bootstrap-2026';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.secret !== ALLOWED_SECRET) {
      return NextResponse.json(
        { success: false, message: 'Invalid secret' },
        { status: 403 },
      );
    }

    const results: string[] = [];

    // ── 1. Create / upsert coordinator company ────────────────────────────
    let company: { id: string };
    try {
      // Try with optional billing columns first
      const upserted = await prisma.coordinatorCompany.upsert({
        where: { slug: 'sample-provider-company' },
        update: { name: 'Sample Provider Company' },
        create: {
          slug: 'sample-provider-company',
          name: 'Sample Provider Company',
        },
      });
      if (!upserted) throw new Error('upsert returned null');
      company = upserted as { id: string };

      // Try to set billing columns (may not exist on older DB schema — ignore errors)
      try {
        await prisma.coordinatorCompany.update({
          where: { id: company.id },
          data: { freeTicketsLimit: 50, freeTicketsUsed: 0 },
        });
      } catch { /* billing columns may not exist yet — safe to skip */ }

      results.push(`company: ${company.id}`);
    } catch (err) {
      return NextResponse.json(
        { success: false, message: `Company upsert failed: ${String(err)}` },
        { status: 500 },
      );
    }

    // ── 2. Sample accounts ────────────────────────────────────────────────
    const accounts = [
      {
        username: 'sampleowner',
        email: 'owner.sample@usmart.com',
        name: 'Sample Company Owner',
        password: 'Owner@12345',
        role: 'COMPANY_OWNER',
      },
      {
        username: 'samplecoord',
        email: 'coord.sample@usmart.com',
        name: 'Sample Coordinator',
        password: 'Coord@12345',
        role: 'COORDINATOR',
      },
      {
        username: 'samplequality',
        email: 'quality.sample@usmart.com',
        name: 'Sample Quality Engineer',
        password: 'Quality@12345',
        role: 'QUALITY_ENGINEER',
      },
      {
        username: 'samplesupervision',
        email: 'supervision.sample@usmart.com',
        name: 'Sample Supervision Engineer',
        password: 'Supervision@12345',
        role: 'SUPERVISION_ENGINEER',
      },
      {
        username: 'sampletechnician',
        email: 'tech.sample@usmart.com',
        name: 'Sample Technician',
        password: 'Technician@12345',
        role: 'TECHNICIAN',
      },
    ];

    for (const acc of accounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      try {
        // Try full upsert first (modern schema)
        await prisma.coordinatorUser.upsert({
          where: { username: acc.username },
          update: {
            email: acc.email,
            name: acc.name,
            passwordHash: hash,
            role: acc.role,
            status: 'ACTIVE',
            mustChangePassword: false,
            companyId: company.id,
          },
          create: {
            username: acc.username,
            email: acc.email,
            name: acc.name,
            passwordHash: hash,
            role: acc.role,
            status: 'ACTIVE',
            mustChangePassword: false,
            companyId: company.id,
          },
        });
      } catch {
        // Fallback: minimal fields for older schema
        await prisma.coordinatorUser.upsert({
          where: { username: acc.username },
          update: {
            email: acc.email,
            name: acc.name,
            passwordHash: hash,
            role: acc.role,
            companyId: company.id,
          },
          create: {
            username: acc.username,
            email: acc.email,
            name: acc.name,
            passwordHash: hash,
            role: acc.role,
            companyId: company.id,
          },
        });
      }
      results.push(`${acc.role}: ${acc.username} / ${acc.password}`);
    }

    // ── 3. Sample checklist ───────────────────────────────────────────────
    try {
      await prisma.inspectionChecklist.upsert({
        where: { id: 'sample-qc-checklist' },
        update: {
          name: 'Sample QC Checklist',
          companyId: company.id,
          taskCategory: 'QUALITY',
          techniqueTypes: ['inspection', 'supervision'],
          items: [
            { id: 'item-1', label: 'Check site safety', weight: 'major' },
            { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
            { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
          ],
        },
        create: {
          id: 'sample-qc-checklist',
          name: 'Sample QC Checklist',
          companyId: company.id,
          taskCategory: 'QUALITY',
          techniqueTypes: ['inspection', 'supervision'],
          items: [
            { id: 'item-1', label: 'Check site safety', weight: 'major' },
            { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
            { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
          ],
        },
      });
      results.push('checklist: sample-qc-checklist created');
    } catch {
      results.push('checklist: skipped (may already exist or schema mismatch)');
    }

    return NextResponse.json({
      success: true,
      message: 'Sample data seeded successfully',
      created: results,
    });
  } catch (err) {
    console.error('bootstrap-sample error:', err);
    return NextResponse.json(
      { success: false, message: String(err) },
      { status: 500 },
    );
  }
}
