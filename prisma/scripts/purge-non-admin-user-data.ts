/* eslint-disable no-console */
/**
 * Remove all end-user / operational data from the database.
 * Keeps only web-admin accounts (`users` where role = ADMIN) and platform config
 * (statistics, provisor techniques, platform ticket policy, careers, clients).
 *
 * Usage:
 *   # dry run — counts only
 *   npx tsx prisma/scripts/purge-non-admin-user-data.ts
 *
 *   # execute against local DB (DATABASE_URL_LOCAL or DATABASE_URL)
 *   APPLY=1 npx tsx prisma/scripts/purge-non-admin-user-data.ts
 *
 *   # production
 *   TARGET=prod APPLY=1 npx tsx prisma/scripts/purge-non-admin-user-data.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function resolveDatabaseUrl(): string {
  const target = (process.env.TARGET ?? '').toLowerCase();
  const candidates =
    target === 'prod'
      ? [process.env.DATABASE_URL_PROD, process.env.DATABASE_URL]
      : [
          process.env.DATABASE_URL_LOCAL,
          process.env.DATABASE_URL,
          process.env.DATABASE_URL_PROD,
        ];
  const url = candidates.find((u) => typeof u === 'string' && u.trim().length > 0);
  if (!url) {
    throw new Error(
      'No DATABASE_URL found. Set DATABASE_URL_LOCAL or DATABASE_URL_PROD in .env.'
    );
  }
  return url;
}

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';

async function count(prisma: PrismaClient, label: string, fn: () => Promise<number>) {
  const n = await fn();
  console.log(`  ${label}: ${n}`);
  return n;
}

async function del(
  prisma: PrismaClient,
  label: string,
  fn: () => Promise<{ count: number }>
) {
  if (!APPLY) return 0;
  try {
    const { count } = await fn();
    console.log(`  deleted ${label}: ${count}`);
    return count;
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'P2021') {
      console.log(`  skipped ${label}: table not in database`);
      return 0;
    }
    throw e;
  }
}

async function main() {
  const url = resolveDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  console.log(`Target: ${url.replace(/:[^:@]+@/, ':***@')}`);
  console.log(APPLY ? 'Mode: APPLY (destructive)' : 'Mode: dry run (set APPLY=1 to execute)\n');

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });
  const adminIds = admins.map((u) => u.id);

  console.log(`Admin users kept (${admins.length}):`);
  for (const a of admins) console.log(`  - ${a.email}`);
  console.log('');

  const nonAdminUsers = await prisma.user.count({
    where: adminIds.length ? { id: { notIn: adminIds } } : {},
  });

  console.log('Counts before purge:');
  await count(prisma, 'non-admin users', () => Promise.resolve(nonAdminUsers));
  await count(prisma, 'ticket_requesters', () => prisma.ticketRequester.count());
  await count(prisma, 'visitor_requests (tickets)', () => prisma.visitorRequest.count());
  await count(prisma, 'private_companies', () => prisma.privateCompany.count());
  await count(prisma, 'coordinator_companies', () => prisma.coordinatorCompany.count());
  await count(prisma, 'notifications', () => prisma.notification.count());

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with APPLY=1 to delete.');
    await prisma.$disconnect();
    return;
  }

  // Prisma Accelerate caps interactive transactions at 15s — run each delete separately.
  console.log('\nPurging (sequential deletes)…');

  const steps: Array<[string, () => Promise<{ count: number }>]> = [
    // ── Tickets & ticket children ─────────────────────────────────────
    ['ticket_status_logs', () => prisma.ticketStatusLog.deleteMany()],
    ['ticket_comments', () => prisma.ticketComment.deleteMany()],
    ['ticket_evidence', () => prisma.ticketEvidence.deleteMany()],
    ['coordinator_ticket_charges', () => prisma.coordinatorTicketCharge.deleteMany()],
    ['private_company_ticket_expenses', () => prisma.privateCompanyTicketExpense.deleteMany()],
    ['private_company_material_movements', () => prisma.privateCompanyMaterialMovement.deleteMany()],
    ['private_company_material_items', () => prisma.privateCompanyMaterialItem.deleteMany()],
    ['private_company_material_requests', () => prisma.privateCompanyMaterialRequest.deleteMany()],
    ['private_company_staff_material_budgets', () => prisma.privateCompanyStaffMaterialBudget.deleteMany()],
    ['private_company_materials', () => prisma.privateCompanyMaterial.deleteMany()],
    ['private_company_checklists', () => prisma.privateCompanyChecklist.deleteMany()],
    ['private_company_techniques', () => prisma.privateCompanyTechnique.deleteMany()],
    ['private_company_departments', () => prisma.privateCompanyDepartment.deleteMany()],
    ['visitor_requests', () => prisma.visitorRequest.deleteMany()],
    ['private_companies', () => prisma.privateCompany.deleteMany()],
    ['site_shares', () => prisma.siteShare.deleteMany()],
    ['site_visitor_links', () => prisma.siteVisitorLink.deleteMany()],
    ['sites', () => prisma.site.deleteMany()],
    ['companies', () => prisma.company.deleteMany()],
    ['company_requests', () => prisma.companyRequest.deleteMany()],
    ['registration_requests', () => prisma.registrationRequest.deleteMany()],
    ['ticket_requesters', () => prisma.ticketRequester.deleteMany()],
    ['coordinator_system_action_logs', () => prisma.coordinatorSystemActionLog.deleteMany()],
    ['coordinator_outreach_messages', () => prisma.coordinatorOutreachMessage.deleteMany()],
    ['coordinator_subtasks', () => prisma.coordinatorSubtask.deleteMany()],
    ['coordinator_comments', () => prisma.coordinatorComment.deleteMany()],
    ['coordinator_tasks', () => prisma.coordinatorTask.deleteMany()],
    ['coordinator_audit_logs', () => prisma.coordinatorAuditLog.deleteMany()],
    ['coordinator_voice_logs', () => prisma.coordinatorVoiceLog.deleteMany()],
    ['coordinator_voice_call_records', () => prisma.coordinatorVoiceCallRecord.deleteMany()],
    ['coordinator_payments', () => prisma.coordinatorPayment.deleteMany()],
    ['coordinator_invoices', () => prisma.coordinatorInvoice.deleteMany()],
    ['coordinator_subscriptions', () => prisma.coordinatorSubscription.deleteMany()],
    ['coordinator_contacts', () => prisma.coordinatorContact.deleteMany()],
    ['coordinator_kpis', () => prisma.coordinatorKPI.deleteMany()],
    ['coordinator_reports', () => prisma.coordinatorReport.deleteMany()],
    ['coordinator_external_systems', () => prisma.coordinatorExternalSystem.deleteMany()],
    ['coordinator_social_accounts', () => prisma.coordinatorSocialAccount.deleteMany()],
    ['coordinator_job_duty_templates', () => prisma.coordinatorJobDutyTemplate.deleteMany()],
    ['coordinator_job_results', () => prisma.coordinatorJobResult.deleteMany()],
    ['coordinator_generated_applications', () => prisma.coordinatorGeneratedApplication.deleteMany()],
    ['coordinator_profiles', () => prisma.coordinatorProfile.deleteMany()],
    ['coordinator_notifications', () => prisma.coordinatorNotification.deleteMany()],
    ['coordinator_conversations', () => prisma.coordinatorConversation.deleteMany()],
    ['coordinator_users', () => prisma.coordinatorUser.deleteMany()],
    ['coordinator_companies', () => prisma.coordinatorCompany.deleteMany()],
    ['team_members', () => prisma.teamMember.deleteMany()],
    ['teams', () => prisma.team.deleteMany()],
    ['employees', () => prisma.employee.deleteMany()],
    ['inspection_checklists', () => prisma.inspectionChecklist.deleteMany()],
    ['notifications', () => prisma.notification.deleteMany()],
    ['contacts', () => prisma.contact.deleteMany()],
    ['subscribers', () => prisma.subscriber.deleteMany()],
    ['applications', () => prisma.application.deleteMany()],
    ['training_requests', () => prisma.trainingRequest.deleteMany()],
    ['product_requests', () => prisma.productRequest.deleteMany()],
    ['cv_exports', () => prisma.cvExport.deleteMany()],
    ['email_otps', () => prisma.emailOtp.deleteMany()],
    ['phone_otps', () => prisma.phoneOtp.deleteMany()],
  ];

  if (adminIds.length) {
    steps.push(
      ['projects (non-admin)', () => prisma.project.deleteMany({ where: { userId: { notIn: adminIds } } })],
      ['services (non-admin)', () => prisma.service.deleteMany({ where: { userId: { notIn: adminIds } } })],
      ['testimonials (non-admin)', () => prisma.testimonial.deleteMany({ where: { userId: { notIn: adminIds } } })],
      ['products (non-admin)', () => prisma.product.deleteMany({ where: { userId: { notIn: adminIds } } })],
      ['non-admin users', () => prisma.user.deleteMany({ where: { id: { notIn: adminIds } } })]
    );
  } else {
    steps.push(
      ['projects', () => prisma.project.deleteMany()],
      ['services', () => prisma.service.deleteMany()],
      ['testimonials', () => prisma.testimonial.deleteMany()],
      ['products', () => prisma.product.deleteMany()],
      ['all users (no ADMIN found)', () => prisma.user.deleteMany()]
    );
  }

  for (const [label, fn] of steps) {
    await del(prisma, label, fn);
  }

  const remainingUsers = await prisma.user.findMany({
    select: { email: true, role: true },
    orderBy: { email: 'asc' },
  });

  console.log('\nDone. Remaining users:');
  for (const u of remainingUsers) console.log(`  - ${u.email} (${u.role})`);

  console.log('\nKept: statistics, provisor_techniques, provisor_platform_settings, careers, clients.');
  console.log('Kept: CMS projects/services/products/testimonials owned by admin users only.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
