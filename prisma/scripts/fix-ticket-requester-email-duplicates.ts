/* eslint-disable no-console */
/**
 * Diagnose & optionally fix duplicate non-null emails on ticket_requesters
 * which were blocking the unique-index migration `20260507210000_ticket_requester_email_unique`.
 *
 * Usage:
 *   # dry run — just print groups (uses DATABASE_URL_LOCAL by default)
 *   npx tsx prisma/scripts/fix-ticket-requester-email-duplicates.ts
 *
 *   # run against PRODUCTION
 *   TARGET=prod npx tsx prisma/scripts/fix-ticket-requester-email-duplicates.ts
 *
 *   # actually NULL-out the older duplicates (keeps the most recently updated row's email)
 *   TARGET=prod APPLY=1 npx tsx prisma/scripts/fix-ticket-requester-email-duplicates.ts
 *
 * After APPLY=1 finishes with zero remaining duplicates, run:
 *   npx prisma migrate resolve --rolled-back "20260507210000_ticket_requester_email_unique"
 *   npx prisma migrate deploy
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
      'No DATABASE_URL found. Set DATABASE_URL_LOCAL or DATABASE_URL_PROD in .env (or pass DATABASE_URL).'
    );
  }
  return url;
}

async function main() {
  const apply = process.env.APPLY === '1';
  const datasourceUrl = resolveDatabaseUrl();
  const prisma = new PrismaClient({ datasourceUrl });
  const isProd = (process.env.TARGET ?? '').toLowerCase() === 'prod';
  console.log(`Connected to: ${isProd ? 'PRODUCTION' : 'LOCAL'} (${maskUrl(datasourceUrl)})`);

  console.log(apply ? '🔧 APPLY mode — duplicates will be cleaned' : '🔍 Dry run (set APPLY=1 to clean)');

  type Group = { email: string; count: bigint };
  const groups = await prisma.$queryRawUnsafe<Group[]>(
    `SELECT email, COUNT(*) AS count
       FROM "ticket_requesters"
      WHERE email IS NOT NULL AND email <> ''
      GROUP BY email
      HAVING COUNT(*) > 1
      ORDER BY count DESC`
  );

  if (groups.length === 0) {
    console.log('✅ No duplicate non-null emails. You can resolve the migration and redeploy.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${groups.length} duplicate email group(s):`);
  for (const g of groups) {
    const rows = await prisma.ticketRequester.findMany({
      where: { email: g.email },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(`\n• ${g.email} (${rows.length})`);
    rows.forEach((r, i) => {
      const tag = i === 0 ? 'KEEP' : 'NULL';
      console.log(
        `   [${tag}] ${r.id}  @${r.username}  ${r.name ?? ''}  ${r.phone ?? ''}  upd=${r.updatedAt.toISOString()}`
      );
    });

    if (apply && rows.length > 1) {
      const idsToClear = rows.slice(1).map((r) => r.id);
      const result = await prisma.ticketRequester.updateMany({
        where: { id: { in: idsToClear } },
        data: { email: null },
      });
      console.log(`   → cleared email on ${result.count} row(s).`);
    }
  }

  if (!apply) {
    console.log(
      '\nℹ️  Re-run with APPLY=1 to NULL the older duplicates (the most recently updated row keeps its email).'
    );
  } else {
    console.log('\n✅ Done. Now run:\n' +
      '   npx prisma migrate resolve --rolled-back "20260507210000_ticket_requester_email_unique"\n' +
      '   npx prisma migrate deploy');
  }

  await prisma.$disconnect();
}

function maskUrl(u: string): string {
  try {
    if (u.startsWith('prisma+postgres://') || u.startsWith('prisma://')) {
      // accelerate URL — only show host
      const url = new URL(u.replace(/^prisma\+/, ''));
      return `${url.protocol}//${url.host}`;
    }
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<unparseable url>';
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
