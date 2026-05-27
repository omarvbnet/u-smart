import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { normalizeEmailInput, isValidEmailFormat } from '@/lib/email-input';

/**
 * Update a requester's public/business contact email surfaced on the
 * Flutter profile screen. Separate from the unique auth/identity `email`
 * column so toggling it cannot lock the user out of login.
 *
 * Eligibility: COMPANY role OR any private-company-workspace member/owner.
 * All other roles get 403.
 *
 * Backward-compatible: older Flutter builds that don't know about this
 * endpoint keep working — the value is null by default and the rest of
 * the system treats it as optional metadata.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_LEN = 254;

function jsonBody(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function loadRequesterEligibility(requesterId: string): Promise<{
  exists: boolean;
  eligible: boolean;
  contactEmail: string | null;
}> {
  try {
    const row = await (prisma.ticketRequester as unknown as {
      findUnique: (args: { where: { id: string }; select: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    }).findUnique({
      where: { id: requesterId },
      select: {
        role: true,
        privateCompanyId: true,
        contactEmail: true,
        privateCompanyOwned: { select: { id: true } },
      },
    });
    if (!row) return { exists: false, eligible: false, contactEmail: null };
    const role = String((row.role as string | null) ?? '').toUpperCase();
    const inPrivateCompany = Boolean(
      (row.privateCompanyId as string | null) ||
        (row.privateCompanyOwned as { id: string } | null)?.id
    );
    return {
      exists: true,
      eligible: role === 'COMPANY' || inPrivateCompany,
      contactEmail: (row.contactEmail as string | null) ?? null,
    };
  } catch (err) {
    console.error('contact-email load eligibility:', err);
    return { exists: false, eligible: false, contactEmail: null };
  }
}

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return jsonBody({ success: false, message: 'Not authenticated' }, 401);
  if (auth.payload.identitySource === 'coordinator_user') {
    return jsonBody(
      { success: false, message: 'Coordinator users manage their contact info via their company.' },
      403
    );
  }
  const info = await loadRequesterEligibility(auth.payload.requesterId);
  if (!info.exists) return jsonBody({ success: false, message: 'Account not found' }, 404);
  return jsonBody({
    success: true,
    contactEmail: info.contactEmail,
    canEdit: info.eligible,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return jsonBody({ success: false, message: 'Not authenticated' }, 401);
  if (auth.payload.identitySource === 'coordinator_user') {
    return jsonBody(
      { success: false, message: 'Coordinator users manage their contact info via their company.' },
      403
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonBody({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const raw = (body as { contactEmail?: unknown } | null)?.contactEmail;
  const isClearing = raw === null || (typeof raw === 'string' && raw.trim() === '');
  let normalized: string | null = null;

  if (!isClearing) {
    if (typeof raw !== 'string') {
      return jsonBody({ success: false, message: 'contactEmail must be a string' }, 400);
    }
    const cleaned = normalizeEmailInput(raw).toLowerCase();
    if (cleaned.length > MAX_LEN) {
      return jsonBody({ success: false, message: 'Email is too long' }, 400);
    }
    if (!isValidEmailFormat(cleaned)) {
      return jsonBody({ success: false, message: 'Enter a valid email address' }, 400);
    }
    normalized = cleaned;
  }

  const info = await loadRequesterEligibility(auth.payload.requesterId);
  if (!info.exists) return jsonBody({ success: false, message: 'Account not found' }, 404);
  if (!info.eligible) {
    return jsonBody(
      {
        success: false,
        message:
          'Contact email is available for company and private-company workspace members only.',
      },
      403
    );
  }

  try {
    await (prisma.ticketRequester as unknown as {
      update: (args: { where: { id: string }; data: { contactEmail: string | null } }) => Promise<unknown>;
    }).update({
      where: { id: auth.payload.requesterId },
      data: { contactEmail: normalized },
    });
    return jsonBody({ success: true, contactEmail: normalized });
  } catch (err) {
    console.error('PATCH /api/profile/contact-email:', err);
    return jsonBody({ success: false, message: 'Failed to update contact email' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return jsonBody({ success: false, message: 'Not authenticated' }, 401);
  if (auth.payload.identitySource === 'coordinator_user') {
    return jsonBody(
      { success: false, message: 'Coordinator users manage their contact info via their company.' },
      403
    );
  }
  const info = await loadRequesterEligibility(auth.payload.requesterId);
  if (!info.exists) return jsonBody({ success: false, message: 'Account not found' }, 404);
  if (!info.eligible) {
    return jsonBody(
      { success: false, message: 'Not allowed to manage a contact email for this role.' },
      403
    );
  }
  try {
    await (prisma.ticketRequester as unknown as {
      update: (args: { where: { id: string }; data: { contactEmail: string | null } }) => Promise<unknown>;
    }).update({
      where: { id: auth.payload.requesterId },
      data: { contactEmail: null },
    });
    return jsonBody({ success: true, contactEmail: null });
  } catch (err) {
    console.error('DELETE /api/profile/contact-email:', err);
    return jsonBody({ success: false, message: 'Failed to clear contact email' }, 500);
  }
}

export async function OPTIONS() {
  return jsonBody({ success: true });
}
