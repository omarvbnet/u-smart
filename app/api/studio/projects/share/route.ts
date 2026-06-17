import { NextRequest, NextResponse } from 'next/server';
import { getStudioProjectByShareToken } from '@/lib/studio-db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }
  try {
    const design = await getStudioProjectByShareToken(token);
    return NextResponse.json({ design });
  } catch (e) {
    if (e instanceof Error && e.message === 'STUDIO_SCHEMA_NOT_READY') {
      return NextResponse.json({ error: 'Studio database not migrated' }, { status: 503 });
    }
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[studio/projects/share GET]', e);
    return NextResponse.json({ error: 'Failed to load shared project' }, { status: 500 });
  }
}
