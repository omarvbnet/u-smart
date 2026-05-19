import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import {
  extractQfieldMapPreviewFromBytes,
  resolveTicketAssetAbsoluteUrl,
} from '@/lib/qfield-map-preview';
import { getWorkspaceSiteGuard } from '@/lib/private-company-sites';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;

  const { id: siteId } = await params;
  const projectId = req.nextUrl.searchParams.get('projectId')?.trim() ?? '';
  if (!siteId) {
    return NextResponse.json({ success: false, message: 'Site id is required.' }, { status: 400 });
  }

  const row = await prisma.privateCompanySite.findFirst({
    where: { id: siteId, companyId: guard.companyId },
    select: { qfieldProjects: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
  }

  const projects = parseQFieldProjectsFromCompanyJson({ qfieldProjects: row.qfieldProjects });
  let proj = projectId ? projects.find((p) => p.id === projectId) : undefined;
  if (!proj && projects.length === 1) proj = projects[0];
  if (!proj && projects.length > 0 && !projectId) proj = projects[0];
  if (!proj) {
    return NextResponse.json({ success: false, message: 'QField project not found.' }, { status: 404 });
  }

  const absUrl = resolveTicketAssetAbsoluteUrl(proj.currentUrl);
  if (!absUrl) {
    return NextResponse.json({ success: false, message: 'Invalid file URL.' }, { status: 400 });
  }

  try {
    const resFetch = await fetch(absUrl, { redirect: 'follow' });
    if (!resFetch.ok) {
      return NextResponse.json(
        { success: false, message: `Could not download file (${resFetch.status})` },
        { status: 502 }
      );
    }
    const bytes = new Uint8Array(await resFetch.arrayBuffer());
    const preview = await extractQfieldMapPreviewFromBytes(proj.fileName, bytes);
    return NextResponse.json({
      success: true,
      geojson: preview.geojson,
      bounds: preview.bounds,
      layers: preview.layers ?? [],
      dataTables: preview.dataTables ?? [],
      defaultCrsEpsg: preview.defaultCrsEpsg ?? null,
      message: preview.message ?? null,
      stats: preview.stats ?? null,
      mapAnnotation: proj.mapAnnotation ?? null,
      mapNotes: proj.mapNotes ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Preview failed';
    console.error('GET workspace site qfield-map-preview:', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
