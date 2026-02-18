import { prisma } from '@/lib/prisma';

export type CompanyContext = {
  companyId: string;
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byPriority: Record<string, number>;
    recent: Array<{
      id: string;
      title: string;
      status: string;
      source: string | null;
      priority: string | null;
      hasFeedback: boolean;
      inboundReplyTo: string | null;
      awaitingFeedbackFrom: string | null;
      createdAt: string;
    }>;
  };
  kpis: {
    total: number;
    byStatus: Record<string, number>;
    list: Array<{
      name: string;
      status: string;
      actualValue: number;
      targetValue: number;
      unit: string | null;
    }>;
  };
  reports: Array<{
    id: string;
    title: string;
    type: string;
    periodFrom: string;
    periodTo: string;
  }>;
  audit: Array<{
    action: string;
    resource: string | null;
    resourceId: string | null;
    createdAt: string;
  }>;
  voice: {
    callRecordsLast7Days: number;
    voiceLogsTotal: number;
  };
  jobDuties: { total: number };
  socialAccounts: { total: number; platforms: string[] };
  contacts: Array<{ name: string; phone: string }>;
};

/**
 * Build a summary of all company data for the AI agent (read-only context).
 */
export async function buildCompanyContext(companyId: string): Promise<CompanyContext> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    tasks,
    taskCounts,
    kpis,
    reports,
    auditLogs,
    callRecordsCount,
    voiceLogsCount,
    jobDutyCount,
    socialAccounts,
    contacts,
  ] = await Promise.all([
    prisma.coordinatorTask.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        source: true,
        priority: true,
        coordinatorFeedback: true,
        inboundReplyTo: true,
        awaitingFeedbackFrom: true,
        createdAt: true,
      },
    }),
    prisma.coordinatorTask.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { id: true },
    }),
    prisma.coordinatorKPI.findMany({
      where: { companyId },
      select: { name: true, status: true, actualValue: true, targetValue: true, unit: true },
    }),
    prisma.coordinatorReport.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, type: true, periodFrom: true, periodTo: true },
    }),
    prisma.coordinatorAuditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { action: true, resource: true, resourceId: true, createdAt: true },
    }),
    prisma.coordinatorVoiceCallRecord.count({ where: { companyId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.coordinatorVoiceLog.count({
      where: { user: { companyId } },
    }),
    prisma.coordinatorJobDutyTemplate.count({ where: { companyId } }),
    prisma.coordinatorSocialAccount.findMany({
      where: { companyId },
      select: { platform: true },
    }),
    prisma.coordinatorContact.findMany({
      where: { companyId },
      select: { name: true, phone: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  taskCounts.forEach((g) => {
    byStatus[g.status] = g._count.id;
  });
  const taskSourceGroup = await prisma.coordinatorTask.groupBy({
    by: ['source'],
    where: { companyId },
    _count: { id: true },
  });
  const bySource: Record<string, number> = {};
  taskSourceGroup.forEach((g) => {
    bySource[g.source ?? 'manual'] = g._count.id;
  });
  const taskPriorityGroup = await prisma.coordinatorTask.groupBy({
    by: ['priority'],
    where: { companyId },
    _count: { id: true },
  });
  const byPriority: Record<string, number> = {};
  taskPriorityGroup.forEach((g) => {
    byPriority[g.priority ?? 'normal'] = g._count.id;
  });

  const kpiByStatus: Record<string, number> = {};
  kpis.forEach((k) => {
    const s = k.status;
    kpiByStatus[s] = (kpiByStatus[s] ?? 0) + 1;
  });

  return {
    companyId,
    tasks: {
      total: await prisma.coordinatorTask.count({ where: { companyId } }),
      byStatus,
      bySource,
      byPriority,
      recent: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        source: t.source,
        priority: t.priority,
        hasFeedback: !!(t.coordinatorFeedback && t.coordinatorFeedback.trim().length > 0),
        inboundReplyTo: t.inboundReplyTo,
        awaitingFeedbackFrom: t.awaitingFeedbackFrom,
        createdAt: t.createdAt.toISOString(),
      })),
    },
    kpis: {
      total: kpis.length,
      byStatus: kpiByStatus,
      list: kpis.map((k) => ({
        name: k.name,
        status: k.status,
        actualValue: k.actualValue,
        targetValue: k.targetValue,
        unit: k.unit,
      })),
    },
    reports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      periodFrom: r.periodFrom.toISOString(),
      periodTo: r.periodTo.toISOString(),
    })),
    audit: auditLogs.map((a) => ({
      action: a.action,
      resource: a.resource,
      resourceId: a.resourceId,
      createdAt: a.createdAt.toISOString(),
    })),
    voice: {
      callRecordsLast7Days: callRecordsCount,
      voiceLogsTotal: voiceLogsCount,
    },
    jobDuties: { total: jobDutyCount },
    socialAccounts: {
      total: socialAccounts.length,
      platforms: [...new Set(socialAccounts.map((s) => s.platform))],
    },
    contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })),
  };
}

/** Serialize context to a string for the AI prompt (compact). */
export function contextToPromptText(ctx: CompanyContext): string {
  const parts: string[] = [];
  parts.push(`Tasks: total ${ctx.tasks.total}. By status: ${JSON.stringify(ctx.tasks.byStatus)}. By source: ${JSON.stringify(ctx.tasks.bySource)}. By priority: ${JSON.stringify(ctx.tasks.byPriority)}.`);
  parts.push(`Recent tasks (up to 20): ${ctx.tasks.recent.map((t) => `[${t.id.slice(-6)}] ${t.title} | ${t.status} | source:${t.source ?? 'manual'} | inboundReplyTo:${t.inboundReplyTo || 'no'} | awaitingFeedbackFrom:${t.awaitingFeedbackFrom || 'no'}`).join('; ')}`);
  parts.push(`KPIs: total ${ctx.kpis.total}. By status: ${JSON.stringify(ctx.kpis.byStatus)}. List: ${ctx.kpis.list.map((k) => `${k.name}=${k.actualValue}/${k.targetValue} (${k.status})`).join('; ')}`);
  parts.push(`Reports (last 5): ${ctx.reports.map((r) => `${r.title} (${r.type})`).join('; ')}`);
  parts.push(`Recent audit: ${ctx.audit.map((a) => `${a.action} ${a.resource ?? ''} ${a.resourceId ?? ''}`).join('; ')}`);
  parts.push(`Voice: call records last 7 days: ${ctx.voice.callRecordsLast7Days}; voice logs total: ${ctx.voice.voiceLogsTotal}.`);
  parts.push(`Job duty templates: ${ctx.jobDuties.total}. Social accounts: ${ctx.socialAccounts.total} (${ctx.socialAccounts.platforms.join(', ') || 'none'}).`);
  const contactList = ctx.contacts.map((c) => `${c.name}=${c.phone}`).join('; ') || 'none';
  const inboundByTask = ctx.tasks.recent
    .filter((t) => t.inboundReplyTo)
    .map((t) => `#${t.id.slice(-6)}=${t.inboundReplyTo}`)
    .join('; ');
  const inboundLine = inboundByTask ? ` Inbound (task ref=number): ${inboundByTask}.` : '';
  parts.push(`ALL WhatsApp numbers: ${contactList}.${inboundLine} Use these when asked to contact someone. Match by name (contacts) or by task ref (e.g. "راسل صاحب المهمة #ABC123" → use number for #ABC123).`);
  return parts.join('\n');
}
