import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MAX_TITLE = 160;
const MAX_DESC = 4000;
const MAX_ATTACHMENTS = 10;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json({ success: true, reports: [] });
  }
  try {
    const reports = await prisma.issueReport.findMany({
      where: { requesterId: auth.payload.requesterId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { type: { select: { id: true, slug: true, label: true } } },
    });
    return NextResponse.json({
      success: true,
      reports: reports.map(serializeReport),
    });
  } catch (err) {
    console.error('GET /api/issue-reports:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load reports' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator users report via their company.' },
      { status: 403 }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }
  const title = String(body?.title ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const typeId = body?.typeId != null ? String(body.typeId).trim() : null;
  const typeLabelRaw = body?.typeLabel != null ? String(body.typeLabel).trim() : null;
  const appVersion = body?.appVersion ? String(body.appVersion).trim().slice(0, 32) : null;
  const platform = body?.platform ? String(body.platform).trim().slice(0, 32) : null;
  const attachments: string[] = Array.isArray(body?.attachmentUrls)
    ? body.attachmentUrls
        .map((u: unknown) => String(u ?? '').trim())
        .filter((u: string) => u.length > 0)
        .slice(0, MAX_ATTACHMENTS)
    : [];

  if (!title || title.length > MAX_TITLE) {
    return NextResponse.json(
      { success: false, message: `Title is required (max ${MAX_TITLE} chars).` },
      { status: 400 }
    );
  }
  if (!description || description.length > MAX_DESC) {
    return NextResponse.json(
      { success: false, message: `Description is required (max ${MAX_DESC} chars).` },
      { status: 400 }
    );
  }

  let resolvedTypeId: string | null = null;
  let typeLabel: string | null = typeLabelRaw && typeLabelRaw.length > 0 ? typeLabelRaw.slice(0, 120) : null;
  if (typeId) {
    try {
      const type = await prisma.issueReportType.findUnique({
        where: { id: typeId },
        select: { id: true, label: true, active: true },
      });
      if (type && type.active !== false) {
        resolvedTypeId = type.id;
        typeLabel = type.label;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const created = await prisma.issueReport.create({
      data: {
        requesterId: auth.payload.requesterId,
        typeId: resolvedTypeId,
        typeLabel,
        title: title.slice(0, MAX_TITLE),
        description: description.slice(0, MAX_DESC),
        attachmentUrls: attachments,
        appVersion,
        platform,
      },
      include: { type: { select: { id: true, slug: true, label: true } } },
    });
    return NextResponse.json({ success: true, report: serializeReport(created) });
  } catch (err) {
    console.error('POST /api/issue-reports:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit report' },
      { status: 500 }
    );
  }
}

function serializeReport(r: any) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    typeId: r.typeId ?? null,
    typeLabel: r.type?.label ?? r.typeLabel ?? null,
    typeSlug: r.type?.slug ?? null,
    adminNote: r.adminNote ?? null,
    handledAt: r.handledAt ?? null,
    attachmentUrls: Array.isArray(r.attachmentUrls) ? r.attachmentUrls : [],
    appVersion: r.appVersion ?? null,
    platform: r.platform ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
