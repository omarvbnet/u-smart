import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/** Send a confirmation email after newsletter subscription. */
export async function sendSubscriptionConfirmation(
  to: string,
  name?: string
): Promise<boolean> {
  const greeting = name ? escapeHtml(name) : 'عزيزنا المشترك';
  const html = `
    <p>مرحباً ${greeting}،</p>
    <p>شكراً لاشتراكك في نشرتنا. سنرسل لك آخر الأخبار والمحتوى الجديد.</p>
    <p>شكراً،<br/>فريق U-SMART</p>
  `.trim();
  return sendEmail({
    to,
    subject: 'تأكيد الاشتراك في النشرة - U-SMART',
    html,
  });
}

/** Send an HTML email. Returns true if sent, false if SMTP not configured or send failed. */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@localhost';
  try {
    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (e) {
    console.error('SMTP send error:', e);
    return false;
  }
}

type TrainingConfirmationParams = {
  requesterName: string;
  requesterEmail: string;
  serviceTitle: string;
  serviceSlug: string;
  company: string | null;
  message: string | null;
  budget: string | null;
};

/** Send a confirmation email to the requester after they submit a training request. */
export async function sendTrainingRequestConfirmation(
  to: string,
  params: TrainingConfirmationParams
): Promise<boolean> {
  const { requesterName, serviceTitle, serviceSlug, company, message, budget } = params;
  const html = `
    <p>مرحباً ${escapeHtml(requesterName)}،</p>
    <p>تم استلام طلبك للتدريب على الخدمة: <strong>${escapeHtml(serviceTitle)}</strong>.</p>
    ${company ? `<p>الشركة: ${escapeHtml(company)}</p>` : ''}
    ${message ? `<p>الرسالة: ${escapeHtml(message)}</p>` : ''}
    ${budget ? `<p>الميزانية: ${escapeHtml(budget)}</p>` : ''}
    <p>سنتواصل معك قريباً.</p>
    <p>شكراً،<br/>فريق U-SMART</p>
  `.trim();
  return sendEmail({
    to,
    subject: `تأكيد طلب التدريب - ${serviceTitle}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
