import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SAMPLE = {
  companyName: 'Sample Provider Company',
  companySlug: 'sample-provider-company',
  owner: {
    username: 'sampleowner',
    email: 'owner.sample@usmart.com',
    password: 'Owner@12345',
    name: 'Sample Company Owner',
  },
  coordinator: {
    username: 'samplecoord',
    email: 'coord.sample@usmart.com',
    password: 'Coord@12345',
    name: 'Sample Coordinator',
  },
  quality: {
    username: 'samplequality',
    email: 'quality.sample@usmart.com',
    password: 'Quality@12345',
    name: 'Sample Quality Engineer',
  },
};

async function upsertCoordinatorUser(companyId, role, profile) {
  const passwordHash = await bcrypt.hash(profile.password, 10);
  let mappedRole = role;
  if (role === 'COMPANY_OWNER' || role === 'QUALITY_ENGINEER' || role === 'SUPERVISION_ENGINEER') {
    mappedRole = 'COORDINATOR';
  }
  const baseData = {
    email: profile.email,
    name: profile.name,
    passwordHash,
    role: mappedRole,
    companyId,
  };
  try {
    await prisma.coordinatorUser.upsert({
      where: { companyId_email: { companyId, email: profile.email } },
      update: { ...baseData, status: 'ACTIVE', mustChangePassword: false, username: profile.username },
      create: { ...baseData, status: 'ACTIVE', mustChangePassword: false, username: profile.username },
    });
  } catch {
    try {
      const existing = await prisma.coordinatorUser.findFirst({
        where: { companyId, email: profile.email },
        select: { id: true },
      });
      if (existing) {
        await prisma.coordinatorUser.update({
          where: { id: existing.id },
          data: baseData,
        });
      } else {
        await prisma.coordinatorUser.create({
          data: baseData,
        });
      }
    } catch (error) {
      console.warn(`Skipped coordinator user seed for ${profile.email}:`, String(error));
    }
  }
}

async function main() {
  let company;
  try {
    company = await prisma.coordinatorCompany.upsert({
      where: { slug: SAMPLE.companySlug },
      update: {
        name: SAMPLE.companyName,
        freeTicketsLimit: 50,
        freeTicketsUsed: 0,
        activeTicketPlan: null,
      },
      create: {
        slug: SAMPLE.companySlug,
        name: SAMPLE.companyName,
        freeTicketsLimit: 50,
        freeTicketsUsed: 0,
      },
    });
  } catch {
    company = await prisma.coordinatorCompany.upsert({
      where: { slug: SAMPLE.companySlug },
      update: { name: SAMPLE.companyName },
      create: {
        slug: SAMPLE.companySlug,
        name: SAMPLE.companyName,
      },
    });
  }

  await upsertCoordinatorUser(company.id, 'COMPANY_OWNER', SAMPLE.owner);
  await upsertCoordinatorUser(company.id, 'COORDINATOR', SAMPLE.coordinator);
  await upsertCoordinatorUser(company.id, 'QUALITY_ENGINEER', SAMPLE.quality);

  const legacyPassword = 'Company@12345';
  const legacyPasswordHash = await bcrypt.hash(legacyPassword, 10);
  const legacyRequester = await prisma.ticketRequester.upsert({
    where: { username: SAMPLE.owner.username },
    update: {
      passwordHash: legacyPasswordHash,
      name: SAMPLE.owner.name,
      email: SAMPLE.owner.email,
      phone: '+9647700001234',
      company: SAMPLE.companyName,
      role: 'COMPANY',
      serviceSlug: 'quality-control-supervision',
      status: 'ACTIVE',
    },
    create: {
      username: SAMPLE.owner.username,
      passwordHash: legacyPasswordHash,
      name: SAMPLE.owner.name,
      email: SAMPLE.owner.email,
      phone: '+9647700001234',
      company: SAMPLE.companyName,
      role: 'COMPANY',
      serviceSlug: 'quality-control-supervision',
      status: 'ACTIVE',
    },
  });
  try {
    await prisma.company.upsert({
      where: { requesterId: legacyRequester.id },
      update: {
        companyName: SAMPLE.companyName,
        pocName: SAMPLE.owner.name,
        pocPhone: '+9647700001234',
        serviceSlug: 'quality-control-supervision',
      },
      create: {
        companyName: SAMPLE.companyName,
        pocName: SAMPLE.owner.name,
        pocPhone: '+9647700001234',
        serviceSlug: 'quality-control-supervision',
        requesterId: legacyRequester.id,
      },
    });
  } catch (error) {
    console.warn('Skipped legacy company profile upsert:', String(error));
  }

  try {
    await prisma.inspectionChecklist.upsert({
      where: { id: 'sample-qc-checklist' },
      update: {
        name: 'Sample QC Checklist',
        companyId: company.id,
        taskCategory: 'QUALITY',
        techniqueTypes: ['inspection', 'supervision'],
        items: [
          { id: 'item-1', label: 'Check site safety', weight: 'major' },
          { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
          { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
        ],
      },
      create: {
        id: 'sample-qc-checklist',
        name: 'Sample QC Checklist',
        companyId: company.id,
        taskCategory: 'QUALITY',
        techniqueTypes: ['inspection', 'supervision'],
        items: [
          { id: 'item-1', label: 'Check site safety', weight: 'major' },
          { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
          { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
        ],
      },
    });
  } catch {
    await prisma.inspectionChecklist.upsert({
      where: { id: 'sample-qc-checklist' },
      update: {
        name: 'Sample QC Checklist',
        items: [
          { id: 'item-1', label: 'Check site safety', weight: 'major' },
          { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
          { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
        ],
      },
      create: {
        id: 'sample-qc-checklist',
        name: 'Sample QC Checklist',
        items: [
          { id: 'item-1', label: 'Check site safety', weight: 'major' },
          { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
          { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
        ],
      },
    });
  }

  await prisma.companyRequest.upsert({
    where: { id: 'sample-company-request-pending' },
    update: {
      companyName: 'Pending Demo Telecom',
      pocName: 'Ali Demo',
      pocEmail: 'ali.demo@company.com',
      pocPhone: '+9647711111111',
      certificateUrl: null,
      serviceSlug: 'quality-control-supervision',
      status: 'PENDING',
    },
    create: {
      id: 'sample-company-request-pending',
      companyName: 'Pending Demo Telecom',
      pocName: 'Ali Demo',
      pocEmail: 'ali.demo@company.com',
      pocPhone: '+9647711111111',
      certificateUrl: null,
      serviceSlug: 'quality-control-supervision',
      status: 'PENDING',
    },
  });

  console.log('Sample provider seed completed.');
  console.log(`Company owner (legacy login): ${SAMPLE.owner.username} / ${legacyPassword}`);
  console.log(`Company owner (coordinator): ${SAMPLE.owner.username} / ${SAMPLE.owner.password}`);
  console.log(`Coordinator: ${SAMPLE.coordinator.username} / ${SAMPLE.coordinator.password}`);
  console.log(`Quality engineer: ${SAMPLE.quality.username} / ${SAMPLE.quality.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
