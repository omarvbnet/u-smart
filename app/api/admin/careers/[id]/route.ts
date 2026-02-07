import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === 'string') data.description = body.description.trim();
    if (typeof body.department === 'string') data.department = body.department.trim();
    if (typeof body.location === 'string') data.location = body.location.trim();
    if (['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'].includes(body.jobType)) data.jobType = body.jobType;
    if (typeof body.experience === 'string') data.experience = body.experience.trim();
    if (body.salaryRange !== undefined) data.salaryRange = typeof body.salaryRange === 'string' && body.salaryRange.trim() ? body.salaryRange.trim() : null;
    if (Array.isArray(body.requirements)) data.requirements = body.requirements.filter((r: unknown) => typeof r === 'string');
    if (Array.isArray(body.benefits)) data.benefits = body.benefits.filter((b: unknown) => typeof b === 'string');
    if (typeof body.slug === 'string' && body.slug.trim()) data.slug = body.slug.trim();
    if (typeof body.featured === 'boolean') data.featured = body.featured;
    if (typeof body.remote === 'boolean') data.remote = body.remote;
    if (['OPEN', 'CLOSED', 'FILLED'].includes(body.status)) data.status = body.status;
    if (body.translations && typeof body.translations === 'object') data.translations = body.translations;

    const career = await prisma.career.update({
      where: { id },
      data: data as Parameters<typeof prisma.career.update>[0]['data'],
    });

    return NextResponse.json({ success: true, career });
  } catch (error) {
    console.error('PATCH /api/admin/careers/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update career' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  try {
    await prisma.career.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/careers/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete career' }, { status: 500 });
  }
}
