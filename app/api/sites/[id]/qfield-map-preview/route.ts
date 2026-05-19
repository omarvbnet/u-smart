import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import {
  extractQfieldMapPreviewFromBytes,
  resolveTicketAssetAbsoluteUrl,
} from '@/lib/qfield-map-preview';

function getSiteDelegate() {
  return (prisma as any).site;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const { id: siteId } = await params;
  const projectId = req.nextUrl.searchParams.get('projectId')?.trim() ?? '';
  if (!siteId || !projectId) {
    return NextResponse.json(
      { success: false, message: 'Site id and projectId are required.' },
      { status: 400 }
    );
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate?.findUnique) {
    return NextResponse.json({ success: false, message: 'Sites not available.' }, { status: 503 });
  }

  const row = await siteDelegate.findUnique({
    where: { id: siteId },
    select: { requesterId: true, qfieldProjects: true },
  });
  if (!row || row.requesterId !== payload.requesterId) {
    return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
  }

  const projects = parseQFieldProjectsFromCompanyJson({ qfieldProjects: row.qfieldProjects });
  const proj = projects.find((p) => p.id === projectId);
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
    console.error('GET /api/sites/[id]/qfield-map-preview:', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
