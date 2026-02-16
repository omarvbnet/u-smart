import { prisma } from '@/lib/prisma';

function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (url) {
    return url.startsWith('http') ? url : `https://${url}`;
  }
  return 'https://usmart-iot.com';
}

type NewProject = { id: string; title: string; slug: string; description?: string | null };
type NewService = { id: string; title: string; slug: string; description?: string | null };

function buildProjectEmail(project: NewProject): { subject: string; html: string } {
  const siteUrl = getSiteUrl();
  const link = `${siteUrl}/en/projects/${project.slug}`;
  const title = project.title || 'New Project';
  const desc = (project.description || '').slice(0, 200);
  return {
    subject: `New on U-SMART: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0A0A0F;">New project published</h2>
        <p><strong>${escapeHtml(title)}</strong></p>
        ${desc ? `<p>${escapeHtml(desc)}…</p>` : ''}
        <p><a href="${link}" style="color: #2563eb;">View project →</a></p>
        <p style="color: #6b7280; font-size: 12px;">U-SMART – You received this because you subscribed to our updates.</p>
      </div>
    `,
  };
}

function buildServiceEmail(service: NewService): { subject: string; html: string } {
  const siteUrl = getSiteUrl();
  const link = `${siteUrl}/en/services/${service.slug}`;
  const title = service.title || 'New Service';
  const desc = (service.description || '').slice(0, 200);
  return {
    subject: `New on U-SMART: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0A0A0F;">New service published</h2>
        <p><strong>${escapeHtml(title)}</strong></p>
        ${desc ? `<p>${escapeHtml(desc)}…</p>` : ''}
        <p><a href="${link}" style="color: #2563eb;">View service →</a></p>
        <p style="color: #6b7280; font-size: 12px;">U-SMART – You received this because you subscribed to our updates.</p>
      </div>
    `,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Notify all active subscribers about new content. Call after creating a project or service. Uses SMTP (Nodemailer). */
export async function notifySubscribers(
  type: 'project' | 'service',
  item: NewProject | NewService
): Promise<void> {
  try {
    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
      select: { email: true },
    });
    if (subscribers.length === 0) return;

    const { subject, html } = type === 'project'
      ? buildProjectEmail(item as NewProject)
      : buildServiceEmail(item as NewService);

    const { sendEmail } = await import('@/lib/email');
    for (const { email } of subscribers) {
      await sendEmail({ to: email, subject, html });
    }
  } catch (error) {
    console.error('notifySubscribers error:', error);
  }
}
