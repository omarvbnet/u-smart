import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma as _prisma } from '@/lib/prisma';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';

const prisma = _prisma as any;

/** Provisions or resolves the coordinator company used for legacy ticket_requester checklist scope. */
export async function ensureLegacyRequesterCompany(requesterId: string): Promise<string | null> {
  const requester = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, username: true, email: true, role: true, name: true, company: true },
  });
  if (!requester) return null;

  const username = (requester.username ?? '').trim();
  const email = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
  if (username || email) {
    const existingOwner = await prisma.coordinatorUser.findFirst({
      where: {
        OR: [
          ...(username ? [{ username: { equals: username, mode: 'insensitive' as const } }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: { companyId: true },
    });
    if (existingOwner?.companyId) return existingOwner.companyId;
  }

  const linked = await getLinkedCoordinatorCompanyId(_prisma, {
    id: requester.id,
    username: requester.username ?? '',
    email: requester.email ?? null,
    role: requester.role ?? null,
  });
  if (linked) return linked;

  const companyName =
    (typeof requester.company === 'string' && requester.company.trim()) ||
    (typeof requester.name === 'string' && requester.name.trim()) ||
    requester.username ||
    `Company ${requester.id.slice(-6)}`;
  const deterministicSlug = `lc-${requester.id}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 48);

  const existingBySlug = await prisma.coordinatorCompany.findUnique({
    where: { slug: deterministicSlug },
    select: { id: true },
  });
  if (existingBySlug?.id) {
    const hasOwner = await prisma.coordinatorUser.findFirst({
      where: { companyId: existingBySlug.id },
      select: { id: true },
    });
    if (hasOwner) return existingBySlug.id;
    const ownerUsername = `owner${requester.id.replace(/[^a-z0-9]/gi, '').slice(0, 10)}${Math.floor(100 + Math.random() * 900)}`;
    const ownerEmail =
      (typeof requester.email === 'string' && requester.email.trim().toLowerCase()) ||
      `${ownerUsername}@legacy-company.local`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
    await prisma.coordinatorUser.create({
      data: {
        username: ownerUsername,
        email: ownerEmail,
        name: requester.name ?? companyName,
        passwordHash,
        role: 'COMPANY_OWNER',
        status: 'ACTIVE',
        mustChangePassword: true,
        companyId: existingBySlug.id,
      },
      select: { id: true },
    });
    return existingBySlug.id;
  }

  let companyId: string | null = null;
  try {
    const created = await prisma.coordinatorCompany.create({
      data: { name: companyName, slug: deterministicSlug },
      select: { id: true },
    });
    companyId = created.id;
  } catch {
    const fallback = await prisma.coordinatorCompany.findUnique({
      where: { slug: deterministicSlug },
      select: { id: true },
    });
    companyId = fallback?.id ?? null;
  }
  if (!companyId) return null;

  const ownerUsername = `owner${requester.id.replace(/[^a-z0-9]/gi, '').slice(0, 10)}${Math.floor(100 + Math.random() * 900)}`;
  const ownerEmail =
    (typeof requester.email === 'string' && requester.email.trim().toLowerCase()) ||
    `${ownerUsername}@legacy-company.local`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
  await prisma.coordinatorUser.create({
    data: {
      username: ownerUsername,
      email: ownerEmail,
      name: requester.name ?? companyName,
      passwordHash,
      role: 'COMPANY_OWNER',
      status: 'ACTIVE',
      mustChangePassword: true,
      companyId,
    },
    select: { id: true },
  });
  return companyId;
}
