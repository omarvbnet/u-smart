import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CoordinatorTaskStatus } from '@prisma/client';

const CRON_SECRET = process.env.CRON_SECRET || process.env.COORDINATOR_CRON_SECRET;

/**
 * Called by Vercel Cron or external scheduler. Generates tasks from job duty templates
 * whose cron expression matches the current run (e.g. daily at 9am).
 *
 * SECRET: Set COORDINATOR_CRON_SECRET (or CRON_SECRET) in env to a value you generate
 * (e.g. `openssl rand -hex 32`). Send it as Authorization: Bearer <secret> or ?secret=<secret>.
 * If unset, the endpoint is open (use only for local testing). See docs/COORDINATOR_CRON_SETUP.md.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret');
  const secret = auth?.replace(/^Bearer\s+/i, '') || auth;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const templates = await prisma.coordinatorJobDutyTemplate.findMany({
      include: { company: { include: { users: { where: { role: 'ADMIN' }, take: 1 } } } },
    });

    const now = new Date();
    const created: string[] = [];

    for (const t of templates) {
      if (!shouldRunCron(t.cron, now)) continue;
      const creatorId = t.company.users[0]?.id;
      if (!creatorId) continue;

      const tt = t.taskTemplate as { title?: string; description?: string; checklist?: unknown } | null;
      const title = (tt?.title as string) || t.name;
      const description = (tt?.description as string) || null;
      const checklist = tt?.checklist ?? undefined;

      const task = await prisma.coordinatorTask.create({
        data: {
          title,
          description,
          status: CoordinatorTaskStatus.PENDING,
          companyId: t.companyId,
          createdById: creatorId,
          dueAt: dueFromFrequency(t.frequency),
          checklist: checklist ?? undefined,
          fileUrls: [],
        },
      });
      created.push(task.id);
    }

    return NextResponse.json({ success: true, generated: created.length, taskIds: created });
  } catch (e) {
    console.error('Cron generate-tasks:', e);
    return NextResponse.json({ success: false, message: 'Generation failed' }, { status: 500 });
  }
}

function shouldRunCron(cron: string, now: Date): boolean {
  if (!cron || cron.trim() === '') return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;
  const runMin = min === '*' ? now.getMinutes() : parseInt(min, 10);
  const runHour = hour === '*' ? now.getHours() : parseInt(hour, 10);
  if (runMin !== now.getMinutes() || runHour !== now.getHours()) return false;
  if (dayOfMonth !== '*' && parseInt(dayOfMonth, 10) !== now.getDate()) return false;
  if (month !== '*' && parseInt(month, 10) !== now.getMonth() + 1) return false;
  if (dayOfWeek !== '*' && parseInt(dayOfWeek, 10) !== now.getDay()) return false;
  return true;
}

function dueFromFrequency(frequency: string): Date {
  const d = new Date();
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 1);
  }
  return d;
}
