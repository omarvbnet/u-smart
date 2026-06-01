import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import { decodeProfileSkills } from '@/lib/coordinator-access';
import {
  cancelScheduledDeletionIfPending,
  purgeExpiredAccountDeletions,
  scheduleTicketRequesterDeletion,
  ACCOUNT_DELETION_GRACE_DAYS,
} from '@/lib/ticket-requester-account-deletion';

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, user: null });
  }
  const payload = auth.payload;

  await purgeExpiredAccountDeletions().catch((e) =>
    console.error('purgeExpiredAccountDeletions on GET me:', e)
  );

  if (payload.identitySource === 'coordinator_user') {
    try {
      const user = await (prisma as any).coordinatorUser.findUnique({
        where: { id: payload.requesterId },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          role: true,
          status: true,
          mustChangePassword: true,
          preferredLocale: true,
          companyId: true,
          company: { select: { name: true } },
          profile: {
            select: { skills: true },
          },
        },
      });
      if (!user) return NextResponse.json({ success: false, user: null });
      const access = decodeProfileSkills(user.profile?.skills ?? [], user.role ?? 'COORDINATOR');

      const username =
        (typeof user.username === 'string' && user.username.trim()) ||
        (typeof user.email === 'string' && user.email.includes('@') ? user.email.split('@')[0] : '') ||
        `coord_${user.id.slice(-6)}`;

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username,
          name: user.name,
          phone: null,
          company: user.company?.name ?? null,
          companyCertificationUrl: null,
          status: user.status ?? 'ACTIVE',
          hasUpdatedCredentials: user.mustChangePassword !== true,
          mustChangePassword: user.mustChangePassword === true,
          serviceSlug: 'quality-control-supervision',
          role: user.role ?? 'COORDINATOR',
          province: null,
          provinceFilterActive: true,
          companyId: user.companyId ?? null,
          departments: access.departments,
          privileges: access.privileges,
          preferredLocale: user.preferredLocale ?? null,
        },
      });
    } catch {
      return NextResponse.json({ success: false, user: null });
    }
  }

  type RequesterRow = { id: string; username: string; name: string | null; phone: string; company: string | null; serviceSlug: string; role?: string };
  let requester: RequesterRow | null = null;
  try {
    const row = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        serviceSlug: true,
        role: true,
      },
    });
    requester = row as RequesterRow | null;
  } catch {
    return NextResponse.json({ success: false, user: null });
  }
  if (!requester) {
    return NextResponse.json({ success: false, user: null });
  }

  try {
    await cancelScheduledDeletionIfPending(payload.requesterId);
  } catch {
    return NextResponse.json({ success: false, user: null });
  }

  // Optional fields - may not exist in generated client
  let companyCertificationUrl: string | null = null;
  let status = 'ACTIVE';
  let hasUpdatedCredentials = false;
  let province: string | null = null;
  let provinceFilterActive = true;
  let mustChangePassword = false;
  let preferredLocale: string | null = null;
  let specialization: string | null = null;
  let verificationStatus: string = 'PENDING';
  let photoUrl: string | null = null;
  let contactEmail: string | null = null;
  let privateCompanyId: string | null = null;
  let privateCompanyOwnedId: string | null = null;
  try {
    const extended = await (prisma.ticketRequester as unknown as {
      findUnique: (args: { where: { id: string }; select: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    }).findUnique({
      where: { id: payload.requesterId },
      select: {
        companyCertificationUrl: true,
        status: true,
        hasUpdatedCredentials: true,
        mustChangePassword: true,
        preferredLocale: true,
        province: true,
        provinceFilterActive: true,
        specialization: true,
        verificationStatus: true,
        photoUrl: true,
        contactEmail: true,
        privateCompanyId: true,
        privateCompanyOwned: { select: { id: true } },
      },
    });
    if (extended) {
      companyCertificationUrl = (extended.companyCertificationUrl as string | null) ?? null;
      status = (extended.status as string | null) ?? 'ACTIVE';
      hasUpdatedCredentials = extended.hasUpdatedCredentials === true;
      mustChangePassword = extended.mustChangePassword === true;
      preferredLocale = (extended.preferredLocale as string | null) ?? null;
      province = (extended.province as string | null) ?? null;
      provinceFilterActive = (extended.provinceFilterActive as boolean | null) ?? true;
      specialization = (extended.specialization as string | null) ?? null;
      verificationStatus = (extended.verificationStatus as string | null) ?? 'PENDING';
      photoUrl = typeof extended.photoUrl === 'string' && (extended.photoUrl as string).trim().length > 0
        ? (extended.photoUrl as string)
        : null;
      contactEmail = typeof extended.contactEmail === 'string' && (extended.contactEmail as string).trim().length > 0
        ? (extended.contactEmail as string)
        : null;
      privateCompanyId = (extended.privateCompanyId as string | null) ?? null;
      const owned = extended.privateCompanyOwned as { id: string } | null | undefined;
      privateCompanyOwnedId = owned?.id ?? null;
    }
  } catch {
    /* use defaults */
  }
  const serviceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';
  const role = requester.role ?? 'COMPANY';
  let linkedCoordinatorCompanyId: string | null = null;
  if (String(role).toUpperCase() === 'COMPANY') {
    linkedCoordinatorCompanyId = await getLinkedCoordinatorCompanyId(prisma, {
      id: requester.id,
      username: requester.username,
      email: (requester as { email?: string | null }).email ?? null,
      role,
    });
  }
  // Eligibility for editing the contact-email tile in the Flutter profile
  // screen: COMPANY requesters and anyone tied to a private-company workspace
  // (member or owner). All other roles see the tile read-only / hidden.
  const isCompany = String(role).toUpperCase() === 'COMPANY';
  const inPrivateCompany = Boolean(privateCompanyId || privateCompanyOwnedId);
  const canEditContactEmail = isCompany || inPrivateCompany;

  // Auth/identity email (distinct from contactEmail). Exposed so PERSONAL users
  // can see whether they have a verified email and add one to unlock the
  // company-account upgrade request.
  const authEmailRaw = (requester as { email?: string | null }).email ?? null;
  const authEmail =
    typeof authEmailRaw === 'string' && authEmailRaw.includes('@')
      ? authEmailRaw
      : null;

  return NextResponse.json({
    success: true,
    user: {
      id: requester.id,
      username: requester.username,
      name: requester.name,
      phone: requester.phone,
      company: requester.company ?? null,
      companyCertificationUrl,
      status,
      hasUpdatedCredentials,
      serviceSlug,
      role,
      province,
      provinceFilterActive,
      companyId: null,
      mustChangePassword,
      preferredLocale,
      specialization,
      verificationStatus,
      photoUrl,
      email: authEmail,
      hasEmail: authEmail != null,
      contactEmail,
      canEditContactEmail,
      privateCompanyId: privateCompanyId ?? null,
      ...(linkedCoordinatorCompanyId ? { linkedCoordinatorCompanyId } : {}),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator users are managed by your company owner.' },
      { status: 403 }
    );
  }

  try {
    const { scheduledDeletionAt: deleteAt } = await scheduleTicketRequesterDeletion(
      auth.payload.requesterId
    );
    const res = NextResponse.json({
      success: true,
      scheduled: true,
      scheduledDeletionAt: deleteAt,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      message: `Account scheduled for deletion. If you do not sign in within ${ACCOUNT_DELETION_GRACE_DAYS} days, your data will be permanently removed. Sign in anytime before then to cancel.`,
    });
    res.cookies.delete(REQUESTER_COOKIE_NAME);
    return res;
  } catch (err) {
    console.error('DELETE /api/auth/requester-me:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to schedule account deletion' },
      { status: 500 }
    );
  }
}
