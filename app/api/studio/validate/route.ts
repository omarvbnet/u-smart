import { NextRequest, NextResponse } from 'next/server';
import { getStudioUserId } from '@/lib/studio-auth';
import { getStudioProject, updateStudioProject } from '@/lib/studio-db';
import { getCatalogEntry } from '@/app/studio/lib/catalog';
import { CABLES } from '@/app/studio/lib/catalog/cables';
import type { CableSpec } from '@/app/studio/lib/catalog';
import { resolveNodes } from '@/app/studio/lib/model';
import { validateDesign } from '@/app/studio/lib/engine/validation';
import { validatePlacement } from '@/app/studio/lib/engine/placement-validation';
import { suggestSmartFixes } from '@/app/studio/lib/engine/autofix';
import { persistValidationErrors, syncStudioBimFromDesign } from '@/lib/studio-db-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId: string };
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const userId = getStudioUserId(req);
    const file = await getStudioProject(projectId, userId);

    const resolved = resolveNodes(file.nodes ?? [], getCatalogEntry);
    const { issues: eng } = validateDesign(resolved, file.edges ?? [], CABLES as CableSpec[]);
    const place = validatePlacement(file.nodes ?? [], file.rooms ?? [], getCatalogEntry);
    const smart = suggestSmartFixes(file.project!, file.nodes ?? [], file.edges ?? [], file.rooms ?? []);
    const issues = [...eng, ...place, ...smart];

    await syncStudioBimFromDesign(projectId, file);
    await persistValidationErrors(projectId, issues);

    return NextResponse.json({
      ok: true,
      issueCount: issues.length,
      critical: issues.filter((i) => i.severity === 'critical').length,
    });
  } catch (e) {
    console.error('[studio/validate POST]', e);
    return NextResponse.json({ error: 'Validation sync failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { projectId: string; design: Parameters<typeof updateStudioProject>[1] };
    const userId = getStudioUserId(req);
    await updateStudioProject(body.projectId, body.design, userId);
    await syncStudioBimFromDesign(body.projectId, body.design);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Save sync failed' }, { status: 500 });
  }
}
