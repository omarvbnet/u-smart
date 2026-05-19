import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import { canPreviewQFieldMapOnTicket } from '@/lib/qfield-map-preview-auth';
import {
  extractQfieldMapPreviewFromBytes,
  resolveTicketAssetAbsoluteUrl,
} from '@/lib/qfield-map-preview';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const projectId = req.nextUrl.searchParams.get('projectId')?.trim() ?? '';
  if (!ticketId || !projectId) {
    return NextResponse.json(
      { success: false, message: 'Ticket id and projectId query parameter are required' },
      { status: 400 }
    );
  }

  const allowed = await canPreviewQFieldMapOnTicket(prisma, ticketId, auth.payload.requesterId);
  if (!allowed) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const row = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: { company: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    parsed = {};
  }
  const projects = parseQFieldProjectsFromCompanyJson(parsed);
  const proj = projects.find((p) => p.id === projectId);
  if (!proj) {
    return NextResponse.json({ success: false, message: 'QField project not found' }, { status: 404 });
  }

  const absUrl = resolveTicketAssetAbsoluteUrl(proj.currentUrl);
  if (!absUrl) {
    return NextResponse.json({ success: false, message: 'Invalid file URL' }, { status: 400 });
  }

  try {
    const resFetch = await fetch(absUrl, { redirect: 'follow' });
    if (!resFetch.ok) {
      return NextResponse.json(
        { success: false, message: `Could not download file for preview (${resFetch.status})` },
        { status: 502 }
      );
    }
    const ab = await resFetch.arrayBuffer();
    const bytes = new Uint8Array(ab);
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
    console.error('GET /api/tickets/[id]/qfield-map-preview:', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
