import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

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

/** Send 2FA OTP email for dashboard registration. */
export async function sendOtpEmail(to: string, code: string): Promise<boolean> {
  const safeCode = escapeHtml(code);
  const html = `
    <p style="margin:0 0 16px; color:#475569; font-size:16px;">رمز التحقق الخاص بك لإنشاء لوحة التحكم:</p>
    <p style="margin:0 0 24px; font-size:28px; font-weight:700; letter-spacing:4px; color:#0f172a;">${safeCode}</p>
    <p style="margin:0; color:#64748b; font-size:14px;">صالح لمدة 10 دقائق.</p>
    <p style="margin:16px 0 0; color:#94a3b8; font-size:12px;">فريق U-SMART</p>
  `.trim();
  const text = `رمز التحقق: ${code}\nصالح لمدة 10 دقائق.\nفريق U-SMART`;
  return sendEmail({
    to,
    subject: 'رمز التحقق - U-SMART لوحة التحكم',
    html,
    text,
  });
}

/** Ticket data for completed email (full details). */
export type TicketCompletedData = {
  ticketId: string;
  siteName?: string | null;
  siteCoordinator?: string | null;
  technique: string;
  slaHours?: number | null;
  completedAt?: string | null;
  inspectionResult?: string | null;
  inspectionComments?: string | null;
  maintenanceDescription?: string | null;
  designSpecifications?: string | null;
};

/** Send professional completion email when ticket status = COMPLETED. Includes results, QR code, site ID, ticket ID, and all ticket info. */
export async function sendTicketCompletedEmail(
  to: string,
  data: TicketCompletedData
): Promise<boolean> {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const baseUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const shareUrl = `${baseUrl}/ar/ticket/${data.ticketId}`;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch (e) {
    console.error('QR code generation failed:', e);
  }

  const resultLabels: Record<string, string> = {
    accepted: 'مقبول',
    accepted_with_comments: 'مقبول مع تعليقات',
    not_accepted: 'غير مقبول',
    ncr: 'NCR - غير مطابق للمواصفات',
    in_progress: 'قيد المعالجة',
  };
  const resultText = data.inspectionResult
    ? (resultLabels[data.inspectionResult.toLowerCase()] || data.inspectionResult)
    : '—';

  const techniqueLabels: Record<string, string> = {
    maintenance: 'الصيانة',
    fiber: 'الألياف البصرية',
    cable_systemization: 'تنظيم الكابلات',
    closures: 'الحاويات والعلب',
    splice: 'اللحام الحراري',
    qgis: 'QGIS والخرائط',
    asbuilt_design: 'التصميم والتنفيذ الفعلي',
    inspection: 'الفحص',
    supervision: 'الإشراف',
    hse: 'الصحة والسلامة والبيئة',
    investigation: 'التحقيق',
    tracking: 'التتبع',
  };
  const techniqueText = techniqueLabels[data.technique?.toLowerCase()] || data.technique || '—';

  const rows: string[] = [
    `<tr><td style="padding:8px 0; color:#64748b; font-size:13px; width:140px;">معرّف التذكرة</td><td style="padding:8px 0; color:#0f172a; font-size:14px; font-weight:600;">#${data.ticketId}</td></tr>`,
    `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">الموقع / الموقع ID</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.siteName || '—')}</td></tr>`,
    `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">منسق الموقع</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.siteCoordinator || '—')}</td></tr>`,
    `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">التقنية</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${techniqueText}</td></tr>`,
    data.slaHours != null ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">SLA (ساعات)</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${data.slaHours}</td></tr>` : '',
    data.completedAt ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">تاريخ الإنجاز</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.completedAt)}</td></tr>` : '',
    `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">نتيجة الفحص</td><td style="padding:8px 0; color:#10b981; font-size:14px; font-weight:600;">${escapeHtml(resultText)}</td></tr>`,
    data.inspectionComments ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">تعليقات الفحص</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.inspectionComments)}</td></tr>` : '',
    data.maintenanceDescription ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">وصف الصيانة</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.maintenanceDescription)}</td></tr>` : '',
    data.designSpecifications ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">مواصفات التصميم</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${escapeHtml(data.designSpecifications)}</td></tr>` : '',
  ].filter(Boolean);

  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إتمام التذكرة - U-SMART</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin:0; color:#ffffff; font-size:28px; font-weight:700;">U-SMART</h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.95); font-size:16px;">تم إنجاز تذكرتك بنجاح ✓</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px;">
              <h2 style="margin:0 0 24px; color:#0f172a; font-size:22px; font-weight:600;">ملخص التذكرة</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                ${rows.join('')}
              </table>
              ${qrDataUrl ? `
              <div style="text-align:center; padding:24px 0; border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 12px; color:#64748b; font-size:13px;">امسح رمز QR لمشاهدة التذكرة الكاملة</p>
                <img src="${qrDataUrl}" alt="QR Code" width="180" height="180" style="display:inline-block; border:2px solid #e2e8f0; border-radius:12px;" />
                <p style="margin:12px 0 0; color:#64748b; font-size:12px;">Ticket ID: ${escapeHtml(data.ticketId)}</p>
              </div>
              ` : ''}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
                <tr>
                  <td style="background:#f59e0b; border-radius:10px;">
                    <a href="${shareUrl}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none;">عرض التذكرة الكاملة</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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

  const text = `تم إنجاز تذكرتك بنجاح.\n\nTicket ID: ${data.ticketId}\nالموقع: ${data.siteName || '—'}\nمنسق الموقع: ${data.siteCoordinator || '—'}\nالتقنية: ${techniqueText}\nنتيجة الفحص: ${resultText}\n${data.inspectionComments ? `تعليقات: ${data.inspectionComments}\n` : ''}عرض التذكرة: ${shareUrl}\n\nفريق U-SMART`;
  return sendEmail({
    to,
    subject: `تم إنجاز التذكرة #${data.ticketId.slice(-8)} - U-SMART`,
    html,
    text,
  });
}

/** Send ticket notification email (new ticket or status update). */
export async function sendTicketNotificationEmail(options: {
  to: string;
  type: 'new_ticket' | 'status_changed';
  ticketId: string;
  summary?: string;
  status?: string;
}): Promise<boolean> {
  const { to, type, ticketId, summary, status } = options;
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const baseUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const dashboardUrl = `${baseUrl}/dashboard`;
  const statusLabels: Record<string, string> = {
    PENDING: 'قيد الانتظار',
    ON_SITE: 'فريقنا في الموقع',
    IN_PROGRESS: 'جاري التنفيذ',
    COMPLETED: 'مكتمل',
  };
  const statusText = status ? (statusLabels[status] || status) : '';
  let subject: string;
  let title: string;
  let body: string;
  if (type === 'new_ticket') {
    subject = `تذكرة جديدة #${ticketId.slice(-8)} - U-SMART`;
    title = 'تم إنشاء تذكرة جديدة';
    body = summary
      ? `تم إنشاء تذكرتك بنجاح. ${escapeHtml(summary)}`
      : 'تم إنشاء تذكرتك بنجاح. يمكنك متابعة الحالة من لوحة التحكم.';
  } else {
    subject = `تحديث التذكرة #${ticketId.slice(-8)} - U-SMART`;
    title = 'تحديث حالة التذكرة';
    body = statusText
      ? `حالة تذكرتك الآن: ${statusText}`
      : 'تم تحديث حالة تذكرتك. راجع لوحة التحكم للتفاصيل.';
  }
  const html = `
    <p style="margin:0 0 16px; color:#475569; font-size:16px;">${body}</p>
    <p style="margin:0 0 24px;"><a href="${dashboardUrl}" style="display:inline-block; padding:12px 24px; background:#f59e0b; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">فتح لوحة التحكم</a></p>
    <p style="margin:0; color:#94a3b8; font-size:12px;">فريق U-SMART</p>
  `.trim();
  const text = `${title}\n\n${body}\n\n${dashboardUrl}\n\nفريق U-SMART`;
  return sendEmail({
    to,
    subject,
    html,
    text,
  });
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
