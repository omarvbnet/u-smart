import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLE_MAP = {
  COMPANY: 'COMPANY_OWNER',
  ENGINEER: 'QUALITY_ENGINEER',
  TECHNICIAN: 'TECHNICIAN',
  PERSONAL: 'COORDINATOR',
  WORKER: 'TECHNICIAN',
};

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

async function ensureCompanyForRequester(requester) {
  const fallbackCompanyName = requester.company || requester.name || `Company ${requester.id.slice(-6)}`;
  const fallbackSlug = slugify(fallbackCompanyName) || `company-${requester.id.slice(-6)}`;

  let company = await prisma.coordinatorCompany.findFirst({
    where: { slug: fallbackSlug },
    select: { id: true, slug: true },
  });

  if (!company) {
    company = await prisma.coordinatorCompany.create({
      data: {
        name: fallbackCompanyName,
        slug: `${fallbackSlug}-${requester.id.slice(-4)}`,
        freeTicketsLimit: 50,
      },
      select: { id: true, slug: true },
    });
  }
  return company;
}

async function migrateRequester(requester) {
  const company = await ensureCompanyForRequester(requester);
  const existingUser = await prisma.coordinatorUser.findFirst({
    where: {
      OR: [
        { username: { equals: requester.username, mode: 'insensitive' } },
        ...(requester.email ? [{ email: { equals: requester.email, mode: 'insensitive' }, companyId: company.id }] : []),
      ],
    },
    select: { id: true },
  });
  if (existingUser) return { migrated: false, reason: 'already_exists' };

  const role = ROLE_MAP[requester.role] || 'COORDINATOR';
  const passwordHash = requester.passwordHash || await bcrypt.hash(`Temp${Date.now()}!`, 10);
  await prisma.coordinatorUser.create({
    data: {
      username: requester.username,
      email: requester.email || `${requester.username}@migrated.local`,
      name: requester.name || requester.username,
      passwordHash,
      role,
      companyId: company.id,
      status: requester.status === 'BLOCKED' ? 'BLOCKED' : requester.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      mustChangePassword: requester.hasUpdatedCredentials !== true,
    },
  });

  await prisma.visitorRequest.updateMany({
    where: { requesterId: requester.id, coordinatorCompanyId: null },
    data: {
      coordinatorCompanyId: company.id,
      taskCategory: 'QUALITY',
    },
  });

  return { migrated: true, companyId: company.id };
}

async function main() {
  const requesters = await prisma.ticketRequester.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      company: true,
      status: true,
      passwordHash: true,
      hasUpdatedCredentials: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  for (const requester of requesters) {
    const res = await migrateRequester(requester);
    if (res.migrated) migrated++;
    else skipped++;
  }

  console.log(`Migration finished. migrated=${migrated} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
