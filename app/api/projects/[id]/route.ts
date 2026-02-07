import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!project) {
      return NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('GET /api/projects/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.slug !== undefined) update.slug = body.slug;
    if (body.description !== undefined) update.description = body.description;
    if (body.content !== undefined) update.content = body.content;
    if (body.category !== undefined) update.category = body.category;
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.technologies !== undefined) update.technologies = Array.isArray(body.technologies) ? body.technologies : [];
    if (body.client !== undefined) update.client = body.client;
    if (body.year !== undefined) update.year = body.year;
    if (body.duration !== undefined) update.duration = body.duration;
    if (body.budget !== undefined) update.budget = body.budget;
    if (body.featured !== undefined) update.featured = Boolean(body.featured);
    if (body.status !== undefined) update.status = body.status;
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
    if (body.gallery !== undefined) update.gallery = Array.isArray(body.gallery) ? body.gallery : [];
    if (body.liveUrl !== undefined) update.liveUrl = body.liveUrl;
    if (body.githubUrl !== undefined) update.githubUrl = body.githubUrl;
    if (body.translations !== undefined) update.translations = body.translations;

    const project = await prisma.project.update({
      where: { id },
      data: update as Parameters<typeof prisma.project.update>[0]['data'],
    });
    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('PATCH /api/projects/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete project' }, { status: 500 });
  }
}
