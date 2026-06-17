import { NextRequest, NextResponse } from 'next/server';
import { getStudioUserId } from '@/lib/studio-auth';
import { getStudioProject, updateStudioProject } from '@/lib/studio-db';
import type { DesignFile } from '@/app/studio/lib/store';

export const dynamic = 'force-dynamic';

function schemaError(e: unknown) {
  if (e instanceof Error && e.message === 'STUDIO_SCHEMA_NOT_READY') {
    return NextResponse.json(
      { error: 'Studio database not migrated. Run: npx prisma migrate dev --name studio_digital_twin' },
      { status: 503 },
    );
  }
  if (e instanceof Error && e.message === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const userId = getStudioUserId(req);
    const design = await getStudioProject(id, userId);
    return NextResponse.json({ design });
  } catch (e) {
    const r = schemaError(e);
    if (r) return r;
    console.error('[studio/projects/id GET]', e);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { design?: DesignFile };
    if (!body.design || body.design.version !== 1) {
      return NextResponse.json({ error: 'Invalid design payload' }, { status: 400 });
    }
    const userId = getStudioUserId(req);
    const project = await updateStudioProject(id, body.design, userId);
    return NextResponse.json({ project });
  } catch (e) {
    const r = schemaError(e);
    if (r) return r;
    console.error('[studio/projects/id PUT]', e);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}
