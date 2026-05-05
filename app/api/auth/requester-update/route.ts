import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

const ALLOW_UI_LOCALES = new Set(['en', 'ar', 'tr', 'ku']);

function parsePreferredLocale(body: Record<string, unknown>): string | null {
  const v =
    typeof body.preferredLocale === 'string'
      ? body.preferredLocale.trim().toLowerCase()
      : typeof body.locale === 'string'
        ? body.locale.trim().toLowerCase()
        : '';
  if (ALLOW_UI_LOCALES.has(v)) return v;
  return null;
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const payload = auth.payload;

    if (payload.identitySource === 'coordinator_user') {
      const body = await req.json() as Record<string, unknown>;
      const prefLocale = parsePreferredLocale(body);
      const newUsername = typeof body.username === 'string' ? body.username.trim() : '';
      const newPassword = typeof body.password === 'string' ? body.password : '';
      const name = typeof body.name === 'string' ? body.name.trim() : undefined;

      const user = await (prisma as any).coordinatorUser.findUnique({
        where: { id: payload.requesterId },
        select: { id: true, companyId: true, status: true },
      });
      if (!user) {
        return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
      }
      if (user.status === 'BLOCKED') {
        return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
      }

      const data: Record<string, unknown> = {};
      if (newUsername.length >= 3) {
        const existing = await (prisma as any).coordinatorUser.findFirst({
          where: { username: { equals: newUsername, mode: 'insensitive' } },
          select: { id: true },
        });
        if (existing && existing.id !== payload.requesterId) {
          return NextResponse.json(
            { success: false, message: 'Username already taken' },
            { status: 400 }
          );
        }
        data.username = newUsername;
      }
      if (newPassword.length >= 6) {
        data.passwordHash = await bcrypt.hash(newPassword, 10);
      }
      if (name !== undefined) data.name = name || null;
      data.mustChangePassword = false;
      if (prefLocale !== null) data.preferredLocale = prefLocale;

      const hasChange =
        newUsername.length >= 3 || newPassword.length >= 6 || name !== undefined || prefLocale !== null;
      if (!hasChange) {
        return NextResponse.json(
          { success: false, message: 'Provide at least: preferredLocale, new username, new password, or name' },
          { status: 400 }
        );
      }

      const updated = await (prisma as any).coordinatorUser.update({
        where: { id: payload.requesterId },
        data,
        select: { id: true, username: true, name: true, role: true, companyId: true, preferredLocale: true },
      });
      return NextResponse.json({
        success: true,
        user: {
          id: updated.id,
          username: updated.username,
          name: updated.name,
          role: updated.role,
          companyId: updated.companyId,
          preferredLocale: updated.preferredLocale ?? null,
        },
      });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { status: true },
    });
    const status = (requester as { status?: string } | null)?.status ?? 'ACTIVE';
    if (status === 'BLOCKED') {
      return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const prefLocale = parsePreferredLocale(body);
    const newUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const newPassword = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
    const company = typeof body.company === 'string' ? body.company.trim() : undefined;
    const companyCertificationUrl = typeof body.companyCertificationUrl === 'string' ? body.companyCertificationUrl.trim() || null : undefined;

    const data: { username?: string; passwordHash?: string; name?: string; phone?: string; company?: string; companyCertificationUrl?: string | null; hasUpdatedCredentials?: boolean } = {};
    if (newUsername.length >= 3) {
      const existing = await prisma.ticketRequester.findUnique({
        where: { username: newUsername },
      });
      if (existing && existing.id !== payload.requesterId) {
        return NextResponse.json(
          { success: false, message: 'Username already taken' },
          { status: 400 }
        );
      }
      data.username = newUsername;
    }
    if (newPassword.length >= 6) {
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    if (name !== undefined) data.name = name || null;
    if (phone !== undefined) {
      const phoneCheck = await checkPhoneUnique(prisma, phone, { requesterId: payload.requesterId });
      if (phoneCheck.taken) {
        return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone number already in use' }, { status: 400 });
      }
      data.phone = phone || '';
    }
    if (company !== undefined) data.company = company || null;
    if (companyCertificationUrl !== undefined) data.companyCertificationUrl = companyCertificationUrl;

    const credentialOrProfileChange =
      newUsername.length >= 3 ||
      newPassword.length >= 6 ||
      name !== undefined ||
      phone !== undefined ||
      company !== undefined ||
      companyCertificationUrl !== undefined;
    if (credentialOrProfileChange) data.hasUpdatedCredentials = true;
    if (prefLocale !== null) (data as Record<string, unknown>).preferredLocale = prefLocale;

    const hasChange = credentialOrProfileChange || prefLocale !== null;
    if (!hasChange) {
        return NextResponse.json(
        {
          success: false,
          message:
            'Provide at least: preferredLocale (en/ar/tr/ku), new username (min 3 chars), new password (min 6 chars), name, phone, company, or certification URL',
        },
        { status: 400 }
      );
    }

    let updated;
    try {
      updated = await prisma.ticketRequester.update({
        where: { id: payload.requesterId },
        data,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('hasUpdatedCredentials') || msg.includes('Unknown argument') || msg.includes('company') || msg.includes('companyCertificationUrl') || msg.includes('status')) {
        const safe: Record<string, unknown> = {};
        if (data.username) safe.username = data.username;
        if (data.passwordHash) safe.passwordHash = data.passwordHash;
        if (name !== undefined) safe.name = name || null;
        if (phone !== undefined) safe.phone = phone || '';
        if (company !== undefined) safe.company = company || null;
        if (companyCertificationUrl !== undefined) safe.companyCertificationUrl = companyCertificationUrl;
        if (prefLocale !== null) safe.preferredLocale = prefLocale;
        updated = await prisma.ticketRequester.update({
          where: { id: payload.requesterId },
          data: safe as { username?: string; passwordHash?: string; name?: string | null; phone?: string; company?: string | null; companyCertificationUrl?: string | null },
        });
      } else {
        throw err;
      }
    }

    const u = updated as { id: string; username: string; name: string | null; phone?: string; company?: string | null; companyCertificationUrl?: string | null };
    return NextResponse.json({
      success: true,
      user: {
        id: u.id,
        username: u.username,
        name: u.name,
        phone: u.phone ?? '',
        company: u.company ?? null,
        companyCertificationUrl: u.companyCertificationUrl ?? null,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('PATCH /api/auth/requester-update:', err?.message ?? err);
    return NextResponse.json(
      { success: false, message: 'Failed to update account' },
      { status: 500 }
    );
  }
}
