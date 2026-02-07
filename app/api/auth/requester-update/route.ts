import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const payload = verifyRequesterToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { status: true },
    });
    const status = (requester as { status?: string } | null)?.status ?? 'ACTIVE';
    if (status === 'BLOCKED') {
      return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
    }

    const body = await req.json();
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
    if (phone !== undefined) data.phone = phone || '';
    if (company !== undefined) data.company = company || null;
    if (companyCertificationUrl !== undefined) data.companyCertificationUrl = companyCertificationUrl;
    data.hasUpdatedCredentials = true;

    const hasChange = newUsername.length >= 3 || newPassword.length >= 6 || name !== undefined || phone !== undefined || company !== undefined || companyCertificationUrl !== undefined;
    if (!hasChange) {
      return NextResponse.json(
        { success: false, message: 'Provide at least: new username (min 3 chars), new password (min 6 chars), name, phone, company, or certification URL' },
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
