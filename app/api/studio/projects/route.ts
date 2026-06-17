import { NextRequest, NextResponse } from 'next/server';
import { getStudioUserId } from '@/lib/studio-auth';
import { createStudioProject, listStudioProjects } from '@/lib/studio-db';
import type { DesignFile } from '@/app/studio/lib/store';

export const dynamic = 'force-dynamic';

function schemaError(e: unknown) {
  if (e instanceof Error && e.message === 'STUDIO_SCHEMA_NOT_READY') {
    return NextResponse.json(
      { error: 'Studio database not migrated. Run: npx prisma migrate dev --name studio_digital_twin' },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = getStudioUserId(req);
    const projects = await listStudioProjects(userId);
    return NextResponse.json({ projects });
  } catch (e) {
    const r = schemaError(e);
    if (r) return r;
    console.error('[studio/projects GET]', e);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { design?: DesignFile };
    if (!body.design || body.design.version !== 1) {
      return NextResponse.json({ error: 'Invalid design payload' }, { status: 400 });
    }
    const userId = getStudioUserId(req);
    const project = await createStudioProject(body.design, userId);
    return NextResponse.json({ project });
  } catch (e) {
    const r = schemaError(e);
    if (r) return r;
    console.error('[studio/projects POST]', e);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
