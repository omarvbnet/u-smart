import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_SPECIALIZATIONS = new Set([
  'ELECTRICAL',
  'MECHANICAL',
  'CIVIL',
  'TELECOM',
  'PROGRAMMER',
]);

const IRAQ_PROVINCES = [
  'Al-Anbar',
  'Babil',
  'Baghdad',
  'Basra',
  'Dhi Qar',
  'Al-Qadisiyyah',
  'Diyala',
  'Duhok',
  'Erbil',
  'Halabja',
  'Karbala',
  'Kirkuk',
  'Maysan',
  'Muthanna',
  'Najaf',
  'Ninawa',
  'Salah Al-Din',
  'Sulaymaniyah',
  'Wasit',
];

function normalizeProvinceList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const trimmed = r.trim();
    if (!trimmed) continue;
    const hit = IRAQ_PROVINCES.find((p) => p.toLowerCase() === trimmed.toLowerCase());
    if (hit) out.push(hit);
  }
  return Array.from(new Set(out));
}

type AudienceMode = 'all' | 'departments' | 'specializations' | 'both';

function normalizeMode(raw: unknown): AudienceMode {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'departments') return 'departments';
  if (s === 'specializations') return 'specializations';
  if (s === 'both') return 'both';
  return 'all';
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
}

/**
 * POST /api/provisor-private-company/notifications
 * Owner-only. Broadcasts an in-app + push notification to staff inside the
 * workspace. The audience is filtered by department, by specialization, or
 * by both.
 *
 * Body:
 *   {
 *     title?: string,            // optional, defaults to localized fallback
 *     body: string,              // required, broadcast message
 *     mode: 'all' | 'departments' | 'specializations' | 'both',
 *     departmentIds?: string[],  // when mode includes 'departments'
 *     specializations?: string[],// when mode includes 'specializations'
 *     includeOwner?: boolean,    // default false (don't notify yourself)
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const m = await getPrivateCompanyMembership(auth.payload.requesterId);
    if (!m.ownedCompanyId || m.ownedCompanyStatus !== 'APPROVED') {
      return NextResponse.json(
        { success: false, message: 'Only the workspace owner can send broadcasts.' },
        { status: 403 }
      );
    }
    const companyId = m.ownedCompanyId;

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.body === 'string' ? body.body.trim() : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const mode = normalizeMode(body?.mode);
    const departmentIds = asStringArray(body?.departmentIds);
    const specializationsRaw = asStringArray(body?.specializations).map((s) => s.toUpperCase());
    const specializations = specializationsRaw.filter((s) => VALID_SPECIALIZATIONS.has(s));
    // Optional province filter — applied on top of any audience mode so the
    // owner can target, say, "engineers in Baghdad" or "Al-Anbar workers in
    // a specific department".
    const provinces = normalizeProvinceList(body?.provinces);
    const includeOwner = body?.includeOwner === true;

    if (!message) {
      return NextResponse.json(
        { success: false, message: 'A non-empty message is required.' },
        { status: 400 }
      );
    }
    if (message.length > 800) {
      return NextResponse.json(
        { success: false, message: 'Message is too long (max 800 characters).' },
        { status: 400 }
      );
    }
    if ((mode === 'departments' || mode === 'both') && departmentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pick at least one department.' },
        { status: 400 }
      );
    }
    if ((mode === 'specializations' || mode === 'both') && specializations.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pick at least one specialization.' },
        { status: 400 }
      );
    }

    // Build the staff filter. Owner is the only requester whose role is
    // COMPANY inside a workspace; we only target staff (roles in the staff
    // set) so the owner is never accidentally selected.
    const filters: Record<string, unknown> = {
      privateCompanyId: companyId,
      status: { not: 'BLOCKED' },
    };
    if (mode === 'departments') {
      filters.privateCompanyDepartmentId = { in: departmentIds };
    } else if (mode === 'specializations') {
      filters.specialization = { in: specializations };
    } else if (mode === 'both') {
      filters.AND = [
        { privateCompanyDepartmentId: { in: departmentIds } },
        { specialization: { in: specializations } },
      ];
    }
    if (provinces.length > 0) {
      // Compose with whatever audience constraint is already in place. Use AND
      // so the province filter narrows (not widens) the recipient set.
      const provinceFilter = { province: { in: provinces } };
      if (Array.isArray(filters.AND)) {
        (filters.AND as unknown[]).push(provinceFilter);
      } else {
        filters.AND = [provinceFilter];
      }
    }

    const recipients: Array<{ id: string }> = await prisma.ticketRequester.findMany({
      where: filters,
      select: { id: true },
    });
    const recipientIds = recipients.map((r) => r.id);
    if (includeOwner) {
      recipientIds.push(auth.payload.requesterId);
    }
    const uniqueRecipientIds = Array.from(new Set(recipientIds));

    if (uniqueRecipientIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No staff matched the selected audience.' },
        { status: 404 }
      );
    }

    // Resolve a friendly company name so the announcement can carry it as a
    // fallback title for clients without explicit titles in their locale.
    const company = await prisma.privateCompany.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name ?? 'Workspace';

    const fallbackTitle = title || companyName;
    const payload = {
      key: 'workspace_announcement' as const,
      vars: { title: fallbackTitle, body: message, companyName },
    };

    let delivered = 0;
    for (const recipientId of uniqueRecipientIds) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'workspace_announcement',
          requesterId: recipientId,
          payload,
          data: { scope: 'private_company', companyId },
        });
        delivered += 1;
      } catch (e) {
        console.error('workspace broadcast failed for', recipientId, e);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${delivered} staff member${delivered === 1 ? '' : 's'}.`,
      delivered,
      total: uniqueRecipientIds.length,
    });
  } catch (err) {
    console.error('POST /api/provisor-private-company/notifications:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to send notification.' },
      { status: 500 }
    );
  }
}
