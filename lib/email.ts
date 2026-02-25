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

/** Build professional welcome email HTML (table-based for email clients). */
function buildWelcomeEmailHtml(greeting: string): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const siteUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const safeGreeting = escapeHtml(greeting);
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to U-SMART</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin:0; color:#f59e0b; font-size:28px; font-weight:700; letter-spacing:1px;">U-SMART</h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:14px;">Smart Solutions &amp; Innovation</p>
            </td>
          </tr>
          <!-- Welcome block -->
          <tr>
            <td style="padding: 40px 40px 32px;">
              <h2 style="margin:0 0 24px; color:#0f172a; font-size:24px; font-weight:600;">مرحباً ${safeGreeting} 👋</h2>
              <p style="margin:0 0 16px; color:#475569; font-size:16px; line-height:1.6;">شكراً لاشتراكك في نشرتنا الإخبارية. أنت الآن جزء من مجتمع U-SMART.</p>
              <p style="margin:0 0 24px; color:#475569; font-size:16px; line-height:1.6;">سنرسل لك آخر الأخبار، المشاريع الجديدة، والعروض الحصرية — مباشرة إلى بريدك.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0;">
                <tr>
                  <td style="background:#f59e0b; border-radius:10px;">
                    <a href="${siteUrl}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none;">زيارة الموقع</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px; background:#e2e8f0;"></div>
            </td>
          </tr>
          <!-- What to expect -->
          <tr>
            <td style="padding: 24px 40px 40px;">
              <p style="margin:0 0 12px; color:#64748b; font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">ما الذي تتوقعه:</p>
              <ul style="margin:0; padding-right:20px; color:#475569; font-size:15px; line-height:1.8;">
                <li>أخبار المشاريع والحلول الذكية</li>
                <li>نصائح وتحديثات تقنية</li>
                <li>عروض وعروض حصرية للمشتركين</li>
              </ul>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc; padding: 24px 40px; text-align:center; border-top:1px solid #e2e8f0;">
              <p style="margin:0; color:#64748b; font-size:13px;">فريق U-SMART</p>
              <p style="margin:6px 0 0; color:#94a3b8; font-size:12px;">© ${new Date().getFullYear()} U-SMART. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/** Send a professional welcome email after newsletter subscription. */
export async function sendSubscriptionConfirmation(
  to: string,
  name?: string
): Promise<boolean> {
  const greeting = name && name.trim() ? name.trim() : 'عزيزنا المشترك';
  const html = buildWelcomeEmailHtml(greeting);
  const text = `مرحباً ${greeting}،\n\nشكراً لاشتراكك في نشرتنا. سنرسل لك آخر الأخبار والمحتوى الجديد.\n\nفريق U-SMART`;
  return sendEmail({
    to,
    subject: 'مرحباً بك في U-SMART — تأكيد الاشتراك',
    html,
    text,
  });
}

/** Send an HTML email. Returns true if sent, false if SMTP not configured or send failed. */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('SMTP not configured: set SMTP_HOST, SMTP_USER, SMTP_PASS in env');
    return false;
  }

  const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@localhost';
  const text = options.text ?? htmlToPlainText(options.html);

  try {
    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text,
      html: options.html,
      headers: {
        'X-Mailer': 'U-SMART',
        'Reply-To': from,
        'Message-ID': `<${Date.now()}.${Math.random().toString(36).slice(2)}@${typeof process.env.SMTP_HOST === 'string' ? process.env.SMTP_HOST.replace(/^smtp\./, '') : 'usmart'}>`,
      },
    });
    return true;
  } catch (e) {
    console.error('SMTP send error:', e);
    return false;
  }
}

/** Strip HTML to a simple plain-text version (reduces spam score when sent as multipart). */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
