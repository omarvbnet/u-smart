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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse SMTP_FROM / optional display name; envelope always uses SMTP_USER when set. */
function resolveMailFrom(override?: string): { from: string; envelopeFrom: string; replyTo: string } {
  const authUser = (process.env.SMTP_USER || '').trim().replace(/\s+/g, '');
  const raw = (override || process.env.SMTP_FROM || '').trim().replace(/\s+/g, ' ');
  const displayName = (process.env.SMTP_FROM_NAME || '').trim().replace(/\s+/g, ' ');

  let name = displayName;
  let email = authUser;

  if (raw) {
    const bracket = raw.match(/^(.+?)\s*<([^>]+)>$/);
    if (bracket) {
      if (!name) name = bracket[1].trim().replace(/^["']|["']$/g, '');
      email = bracket[2].trim();
    } else if (EMAIL_RE.test(raw)) {
      email = raw;
    } else {
      const embedded = raw.match(/([^\s<>"']+@[^\s<>"']+)$/);
      if (embedded && EMAIL_RE.test(embedded[1])) {
        email = embedded[1];
        if (!name) {
          const prefix = raw.slice(0, raw.length - embedded[1].length).trim();
          if (prefix) name = prefix.replace(/^["']|["']$/g, '');
        }
      }
    }
  }

  if (!email) email = authUser || 'noreply@localhost';
  const envelopeFrom = authUser || email;
  const headerEmail = authUser && email !== authUser ? authUser : email;
  const from =
    name && !name.includes('@')
      ? `"${name.replace(/"/g, '\\"')}" <${headerEmail}>`
      : headerEmail;

  return { from, envelopeFrom, replyTo: headerEmail };
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

/** Send OTP email for forgot password reset. */
export async function sendForgotPasswordOtp(to: string, code: string): Promise<boolean> {
  const safeCode = escapeHtml(code);
  const html = `
    <p style="margin:0 0 16px; color:#475569; font-size:16px;">رمز إعادة تعيين كلمة المرور:</p>
    <p style="margin:0 0 24px; font-size:28px; font-weight:700; letter-spacing:4px; color:#0f172a;">${safeCode}</p>
    <p style="margin:0; color:#64748b; font-size:14px;">صالح لمدة 10 دقائق.</p>
    <p style="margin:16px 0 0; color:#94a3b8; font-size:12px;">فريق U-SMART</p>
  `.trim();
  const text = `رمز إعادة تعيين كلمة المرور: ${code}\nصالح لمدة 10 دقائق.\nفريق U-SMART`;
  return sendEmail({
    to,
    subject: 'إعادة تعيين كلمة المرور - U-SMART',
    html,
    text,
  });
}

/** After email OTP verification: deliver generated login username + temporary password. */
export async function sendRecoveryCredentialsEmail(
  to: string,
  loginUsername: string,
  temporaryPassword: string
): Promise<boolean> {
  const safeUser = escapeHtml(loginUsername);
  const safePw = escapeHtml(temporaryPassword);
  const html = `
    <p style="margin:0 0 16px; color:#475569; font-size:16px;">تم التحقق من بريدك. استخدم البيانات التالية لتسجيل الدخول، ثم سيتم طلب تغيير كلمة المرور فوراً لأسباب أمنية.</p>
    <p style="margin:0 0 8px; color:#64748b; font-size:14px;">اسم المستخدم / معرّف الدخول:</p>
    <p style="margin:0 0 20px; font-size:18px; font-weight:700; color:#0f172a; word-break:break-all;">${safeUser}</p>
    <p style="margin:0 0 8px; color:#64748b; font-size:14px;">كلمة المرور المؤقتة:</p>
    <p style="margin:0 0 24px; font-size:18px; font-weight:700; letter-spacing:2px; color:#0f172a; word-break:break-all;">${safePw}</p>
    <p style="margin:0; color:#94a3b8; font-size:12px;">فريق U-SMART</p>
  `.trim();
  const text = `اسم المستخدم: ${loginUsername}\nكلمة المرور المؤقتة: ${temporaryPassword}\nسُيُطلب منك تغيير كلمة المرور بعد تسجيل الدخول.\nفريق U-SMART`;
  return sendEmail({
    to,
    subject: 'بيانات الدخول المؤقتة - U-SMART',
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
    building: 'البناء',
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

/** Notify a recipient (requester or engineer) that the admin has resolved a conflict on their ticket. */
export async function sendConflictResolutionEmail(options: {
  to: string;
  recipientRole: 'requester' | 'engineer';
  ticketId: string;
  siteName?: string | null;
  resolution: string;
  comment?: string | null;
  newStatus?: string | null;
}): Promise<boolean> {
  const { to, recipientRole, ticketId, siteName, resolution, comment, newStatus } = options;
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const baseUrl = raw.startsWith('http') ? raw : raw ? `https://${raw}` : 'https://usmart-iot.com';
  const ticketUrl = `${baseUrl}/en/ticket/${ticketId}`;

  const resolutionLabel: Record<string, string> = {
    accepted: 'Accepted',
    accepted_with_comments: 'Accepted with comments',
    not_accepted: 'Not accepted',
    ncr: 'NCR — Non-conforming',
    keep_same: 'Keep original result',
    re_inspection: 'Re-inspection required',
    re_maintain: 'Re-maintain (back to pending)',
    no_need: 'No further maintenance needed',
  };
  const resultText = resolutionLabel[resolution] ?? resolution;
  const safeSite = escapeHtml(siteName || '—');
  const safeComment = comment ? escapeHtml(comment) : '';
  const safeStatus = newStatus ? escapeHtml(newStatus) : '';
  const greeting =
    recipientRole === 'requester'
      ? 'You reported a conflict on this ticket and the admin has just resolved it.'
      : 'You handled this ticket and the admin has just resolved the reported conflict.';
  const isReinspection = resolution === 're_inspection' || resolution === 're_maintain';

  const subject = isReinspection
    ? `[U-SMART] Re-inspection required — ticket #${ticketId.slice(-8)}`
    : `[U-SMART] Conflict resolved — ticket #${ticketId.slice(-8)}`;

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <tr><td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr><td style="background: linear-gradient(135deg, ${isReinspection ? '#0369a1 0%, #0ea5e9' : '#475569 0%, #0f172a'} 100%); padding: 28px 36px;">
            <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">${escapeHtml(isReinspection ? 'Re-inspection ordered' : 'Conflict resolved')}</h1>
            <p style="margin:6px 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Ticket #${escapeHtml(ticketId.slice(-8))}</p>
          </td></tr>
          <tr><td style="padding: 28px 36px; color:#0f172a;">
            <p style="margin:0 0 18px; font-size:15px; color:#334155;">${escapeHtml(greeting)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px; border-collapse:collapse;">
              <tr><td style="padding:8px 0; color:#64748b; font-size:13px; width:160px;">Site</td><td style="padding:8px 0; color:#0f172a; font-size:14px; font-weight:600;">${safeSite}</td></tr>
              <tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Final result</td><td style="padding:8px 0; color:${isReinspection ? '#0ea5e9' : '#0f172a'}; font-size:14px; font-weight:700; text-transform:capitalize;">${escapeHtml(resultText)}</td></tr>
              ${safeStatus ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px;">Ticket status</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${safeStatus}</td></tr>` : ''}
              ${safeComment ? `<tr><td style="padding:8px 0; color:#64748b; font-size:13px; vertical-align:top;">Admin comment</td><td style="padding:8px 0; color:#0f172a; font-size:14px;">${safeComment}</td></tr>` : ''}
            </table>
            <p style="margin:0 0 22px;"><a href="${ticketUrl}" style="display:inline-block; padding:12px 22px; background:#0ea5e9; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600;">Open ticket</a></p>
            <p style="margin:0; color:#94a3b8; font-size:12px;">U-SMART · automatic notification</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  `.trim();
  const text = `${isReinspection ? 'Re-inspection ordered' : 'Conflict resolved'}\n\n${greeting}\n\nSite: ${siteName || '—'}\nFinal result: ${resultText}${newStatus ? `\nTicket status: ${newStatus}` : ''}${comment ? `\nAdmin comment: ${comment}` : ''}\n\n${ticketUrl}\n\nU-SMART`;
  return sendEmail({ to, subject, html, text });
}

/** Recipient email when another requester shares a site with them. */
export async function sendSiteSharedEmail(options: {
  to: string;
  fromDisplayName: string;
  siteLabel: string;
  includeTickets: boolean;
}): Promise<boolean> {
  const { to, fromDisplayName, siteLabel, includeTickets } = options;
  const safeFrom = escapeHtml(fromDisplayName);
  const safeSite = escapeHtml(siteLabel);
  const access = includeTickets
    ? 'You have access including linked tickets in the Provisor app.'
    : 'Shared as site details only (no linked tickets visibility).';
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const baseUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const subject = `[Provisor] ${safeFrom} shared a site with you — ${safeSite}`;
  const html = `
    <p style="margin:0 0 12px; color:#0f172a; font-size:18px; font-weight:600;">Site shared</p>
    <p style="margin:0 0 16px; color:#475569; font-size:15px;"><strong>${safeFrom}</strong> shared site <strong>${safeSite}</strong> with your account.</p>
    <p style="margin:0 0 20px; color:#475569; font-size:15px;">${escapeHtml(access)}</p>
    <p style="margin:0 0 24px;"><a href="${baseUrl}" style="display:inline-block; padding:12px 22px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Open Provisor</a></p>
    <p style="margin:0; color:#94a3b8; font-size:12px;">Provisor — Quality control & inspection</p>
  `.trim();
  const text = `Site shared\n\n${fromDisplayName} shared site "${siteLabel}" with you.\n\n${access}\n\n${baseUrl}`;
  return sendEmail({ to, subject, html, text });
}

/** Send status update email for Clean Energy visitor request (non-dashboard requester). */
export async function sendCleanEnergyRequestStatusEmail(options: {
  to: string;
  requestId: string;
  status: string;
  currentAmps?: number | null;
  kwh?: number | null;
  estimatedPrice?: number | null;
}): Promise<boolean> {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const baseUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const ticketUrl = `${baseUrl}/admin/visitor-requests/${options.requestId}`;
  const statusLabels: Record<string, string> = {
    PENDING: 'Pending',
    ON_SITE: 'On site',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
  };
  const html = `
    <p style="margin:0 0 12px; color:#111827; font-size:16px;"><strong>Clean Energy request update</strong></p>
    <p style="margin:0 0 14px; color:#374151;">Your request status is now: <strong>${escapeHtml(statusLabels[options.status] || options.status)}</strong></p>
    <table style="border-collapse:collapse; margin:0 0 14px;">
      ${row('Request ID', options.requestId)}
      ${options.currentAmps != null ? row('Current (A)', options.currentAmps) : ''}
      ${options.kwh != null ? row('Battery (kWh)', options.kwh) : ''}
      ${options.estimatedPrice != null ? row('Estimated budget ($)', options.estimatedPrice) : ''}
      ${row('Tracking URL', ticketUrl)}
    </table>
    <p style="margin:0; color:#6b7280; font-size:12px;">U-SMART Team</p>
  `;
  return sendEmail({
    to: options.to,
    subject: `Clean Energy request update #${options.requestId.slice(-8)} - U-SMART`,
    html,
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

/** Default retry config for email sends. */
const EMAIL_RETRY_ATTEMPTS = 3;
const EMAIL_RETRY_DELAY_MS = 2000;

/** Send an HTML email. Returns true if sent, false if SMTP not configured or send failed after retries. */
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

  const { from, envelopeFrom, replyTo } = resolveMailFrom(options.from);
  const text = options.text ?? htmlToPlainText(options.html);

  let lastError: unknown;
  for (let attempt = 1; attempt <= EMAIL_RETRY_ATTEMPTS; attempt++) {
    try {
      await transporter.sendMail({
        from,
        envelope: { from: envelopeFrom, to: options.to },
        to: options.to,
        subject: options.subject,
        text,
        html: options.html,
        headers: {
          'X-Mailer': 'U-SMART',
          'Reply-To': replyTo,
          'Message-ID': `<${Date.now()}.${Math.random().toString(36).slice(2)}@${typeof process.env.SMTP_HOST === 'string' ? process.env.SMTP_HOST.replace(/^smtp\./, '') : 'usmart'}>`,
        },
      });
      return true;
    } catch (e) {
      lastError = e;
      console.error(`SMTP send error (attempt ${attempt}/${EMAIL_RETRY_ATTEMPTS}):`, e);
      if (attempt < EMAIL_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, EMAIL_RETRY_DELAY_MS));
      }
    }
  }
  console.error('SMTP send failed after all retries');
  return false;
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

/** Email address that receives all tickets/applications/requests notifications. */
const TICKETS_EMAIL = (process.env.TICKETS_EMAIL || 'tickets@usmart-iot.com').trim();

/** Send notification to tickets@usmart-iot.com (or TICKETS_EMAIL). Full HTML body. */
export async function sendTicketsNotification(subject: string, htmlBody: string, textBody?: string): Promise<boolean> {
  if (!TICKETS_EMAIL) return false;
  return sendEmail({
    to: TICKETS_EMAIL,
    subject: `[U-SMART] ${subject}`,
    html: htmlBody,
    text: textBody ?? htmlToPlainText(htmlBody),
  });
}

function row(label: string, value: unknown): string {
  const v = value == null ? '—' : String(value);
  return `<tr><td style="padding:6px 12px 6px 0; color:#64748b; font-size:13px; vertical-align:top; width:160px;">${escapeHtml(label)}</td><td style="padding:6px 0; color:#0f172a; font-size:14px;">${escapeHtml(v)}</td></tr>`;
}

/** Notify tickets@ of new job application (full info). */
export async function notifyTicketsApplication(data: { id: string; name: string; email: string; phone: string; coverLetter: string | null; resumeUrl: string; careerTitle?: string }): Promise<void> {
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New job application</strong></p>
    <table style="border-collapse:collapse;">${row('ID', data.id)}${row('Name', data.name)}${row('Email', data.email)}${row('Phone', data.phone)}${row('Career', data.careerTitle || '—')}${row('Resume', data.resumeUrl)}${data.coverLetter ? row('Cover letter', data.coverLetter) : ''}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New application: ${data.name}`, html).catch((e) => console.error('Tickets notification (application):', e));
}

/** Notify tickets@ of new company/dashboard request (full info). */
export async function notifyTicketsCompanyRequest(data: { id: string; companyName: string; pocName: string; pocEmail?: string | null; pocPhone: string; serviceSlug: string; certificateUrl?: string | null }): Promise<void> {
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New company / dashboard request</strong></p>
    <table style="border-collapse:collapse;">${row('Request ID', data.id)}${row('Company', data.companyName)}${row('POC name', data.pocName)}${row('POC email', data.pocEmail || '—')}${row('POC phone', data.pocPhone)}${row('Service', data.serviceSlug)}${data.certificateUrl ? row('Certificate', data.certificateUrl) : ''}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New company request: ${data.companyName}`, html).catch((e) => console.error('Tickets notification (company request):', e));
}

/** Notify tickets@ of new visitor request (full info). */
export async function notifyTicketsVisitorRequest(data: {
  id: string;
  serviceSlug: string;
  name?: string | null;
  email?: string | null;
  phone: string;
  company?: string | null;
  province: string;
  technique: string;
  buildingType?: string | null;
  ticketUrl?: string | null;
  price?: number | string | null;
  currentAmps?: number | string | null;
  kwh?: number | string | null;
  /** Extra label/value rows (e.g. clean energy IP ratings + design snapshot). */
  extraRows?: { label: string; value: string | number }[];
}): Promise<void> {
  const baseUrl = (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
    return raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  })();
  const ticketUrl = data.ticketUrl ?? `${baseUrl}/admin/visitor-requests/${data.id}`;
  const extra =
    Array.isArray(data.extraRows) && data.extraRows.length > 0
      ? data.extraRows.map((r) => row(r.label, r.value))
      : [];
  const rows = [
    row('ID', data.id),
    row('Ticket URL', ticketUrl),
    row('Service', data.serviceSlug),
    row('Name', data.name || '—'),
    row('Email', data.email || '—'),
    row('Phone', data.phone),
    row('Company', data.company || '—'),
    row('Province', data.province),
    row('Technique', data.technique),
    data.buildingType ? row('Building type', data.buildingType) : '',
    data.currentAmps != null ? row('Current (A)', data.currentAmps) : '',
    data.kwh != null ? row('Battery kWh', data.kwh) : '',
    data.price != null ? row('Estimated price ($)', data.price) : '',
    ...extra,
  ].filter(Boolean);
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New visitor / service request</strong></p>
    <table style="border-collapse:collapse;">${rows.join('')}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New visitor request: ${data.serviceSlug}`, html).catch((e) => console.error('Tickets notification (visitor request):', e));
}

/** Notify tickets@ of new ticket (dashboard/enterprise ticket). */
export async function notifyTicketsTicket(data: { id: string; siteName?: string; siteCoordinator?: string; technique: string; requesterName?: string | null; phone: string; status?: string }): Promise<void> {
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New dashboard ticket</strong></p>
    <table style="border-collapse:collapse;">${row('Ticket ID', data.id)}${row('Site name', data.siteName || '—')}${row('Site coordinator', data.siteCoordinator || '—')}${row('Technique', data.technique)}${row('Requester', data.requesterName || '—')}${row('Phone', data.phone)}${row('Status', data.status || 'PENDING')}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New ticket: ${data.siteName || data.id}`, html).catch((e) => console.error('Tickets notification (ticket):', e));
}

/** Notify tickets@ of new training request (full info). */
export async function notifyTicketsTrainingRequest(data: { id: string; serviceSlug: string; serviceTitle: string; requesterName: string; requesterEmail: string; requesterPhone: string; company?: string | null; message?: string | null; budget?: string | null }): Promise<void> {
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New training request</strong></p>
    <table style="border-collapse:collapse;">${row('ID', data.id)}${row('Service', data.serviceTitle)}${row('Slug', data.serviceSlug)}${row('Name', data.requesterName)}${row('Email', data.requesterEmail)}${row('Phone', data.requesterPhone)}${row('Company', data.company || '—')}${data.message ? row('Message', data.message) : ''}${data.budget ? row('Budget', data.budget) : ''}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New training request: ${data.serviceTitle}`, html).catch((e) => console.error('Tickets notification (training):', e));
}

/** Notify tickets@ of new Provisor registration request (full info). */
export async function notifyTicketsRegistrationRequest(data: {
  id: string;
  legalName: string;
  phone: string;
  email: string;
  province: string;
  evidenceUrl: string;
  role: string;
  specialization?: string;
}): Promise<void> {
  const roleLabels: Record<string, string> = {
    COMPANY: 'Company',
    ENGINEER: 'Engineer',
    TECHNICIAN: 'Technician',
    PERSONAL: 'Personal',
  };
  const roleText = roleLabels[data.role] || data.role;
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New Provisor registration request</strong></p>
    <table style="border-collapse:collapse;">${row('Request ID', data.id)}${row('Legal name', data.legalName)}${row('Email', data.email)}${row('Phone', data.phone)}${row('Province', data.province)}${row('Role', roleText)}${data.specialization ? row('Specialization', data.specialization) : ''}${row('Evidence', data.evidenceUrl)}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New registration: ${data.legalName} (${roleText})`, html).catch((e) => console.error('Tickets notification (registration):', e));
}

/** Notify tickets@ of a new Provisor staff (engineer/technician) registration request. */
export async function notifyTicketsStaffRegistration(data: {
  id: string;
  legalName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  role: string;
  specialization?: string | null;
  province: string;
  idDocumentUrl: string;
  certificateUrls: string[];
}): Promise<void> {
  const roleLabels: Record<string, string> = {
    ENGINEER: 'Engineer',
    TECHNICIAN: 'Technician',
  };
  const roleText = roleLabels[data.role] || data.role;
  const baseUrl = getBaseUrl();
  const reviewUrl = `${baseUrl}/admin/staff-registrations`;
  const certRows = data.certificateUrls.length
    ? data.certificateUrls.map((u, i) => row(`Certificate ${i + 1}`, u)).join('')
    : row('Certificates', '—');
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New Provisor staff registration request</strong></p>
    <table style="border-collapse:collapse;">${row('Request ID', data.id)}${row('Legal name', data.legalName)}${row('Date of birth', data.dateOfBirth)}${row('Education', roleText)}${data.specialization ? row('Specialization', data.specialization) : ''}${row('Email', data.email)}${row('Phone', data.phone)}${row('Province', data.province)}${row('ID document', data.idDocumentUrl)}${certRows}${row('Review', reviewUrl)}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New staff registration: ${data.legalName} (${roleText})`, html).catch((e) =>
    console.error('Tickets notification (staff registration):', e)
  );
}

/**
 * After admin approves a Provisor staff registration, deliver the generated
 * sign-in username + temporary password and explain how to log in to the
 * Provisor mobile app.
 */
export async function sendProviserStaffApprovedEmail(args: {
  to: string;
  recipientName: string | null;
  role: string;
  specialization?: string | null;
  username: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const to = args.to.trim();
  if (!to || !to.includes('@')) return false;

  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const siteUrl = raw.startsWith('http') ? raw : raw ? `https://${raw}` : 'https://usmart-iot.com';
  const logoUrl = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL?.trim();
  const name = args.recipientName?.trim() || 'there';
  const roleLabel = args.role === 'ENGINEER' ? 'Engineer' : args.role === 'TECHNICIAN' ? 'Technician' : args.role;
  const roleLine = `${roleLabel}${args.specialization ? ` · ${args.specialization}` : ''}`;
  const subject = 'Provisor — your staff account is approved';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;text-align:center;">
            ${
              logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="U-SMART Provisor" width="180" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
            <div style="margin-top:12px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Field staff</div>`
                : `<div style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:0.5px;">U-SMART</div>
            <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Field staff</div>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <div style="margin:0 0 20px;padding:14px 18px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;text-align:center;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#065f46;">🎉 Registration approved</p>
            </div>
            <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">Hello ${escapeHtml(name)},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Your request to join as Provisor staff has been approved. Use the credentials below to sign in to the <strong>Provisor</strong> mobile app.</p>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Role</p>
            <p style="margin:0 0 20px;font-size:15px;color:#0f172a;font-weight:600;">${escapeHtml(roleLine)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <td style="padding:12px 16px;font-size:13px;color:#64748b;width:38%;">Username</td>
                <td style="padding:12px 16px;font-size:15px;font-weight:600;color:#0f172a;font-family:Consolas,monospace;">${escapeHtml(args.username)}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Temporary password</td>
                <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#b45309;font-family:Consolas,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(args.temporaryPassword)}</td>
              </tr>
            </table>
            <div style="margin-top:22px;padding:14px 16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#9a3412;">Important — security</p>
              <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:13px;line-height:1.55;">
                <li>Do not share your password in chat, screenshots, or social media.</li>
                <li>Change your password from the app after your first sign-in.</li>
              </ul>
            </div>
            <p style="margin:24px 0 0;font-size:14px;color:#475569;">Open the <strong>Provisor</strong> app, choose <strong>Password sign-in</strong>, and enter your username and temporary password.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Visit website</a>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} U-SMART · Provisor</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `Hello ${name},`,
    '',
    'Your request to join as Provisor staff has been approved.',
    `Role: ${roleLine}`,
    '',
    `Username: ${args.username}`,
    `Temporary password: ${args.temporaryPassword}`,
    '',
    'Open the Provisor app, choose Password sign-in, and enter your username and temporary password.',
    'Change your password after your first sign-in.',
    '',
    `Website: ${siteUrl}`,
    '',
    '© U-SMART Provisor',
  ].join('\n');

  return sendEmail({ to, subject, html, text });
}

/** Notify tickets@ of new product request (full info). */
export async function notifyTicketsProductRequest(data: { productTitle: string; productType: string; name: string; email: string; phone: string; message?: string | null }): Promise<void> {
  const html = `
    <p style="margin:0 0 16px; font-size:16px; color:#0f172a;"><strong>New product / order request</strong></p>
    <table style="border-collapse:collapse;">${row('Product', data.productTitle)}${row('Type', data.productType)}${row('Name', data.name)}${row('Email', data.email)}${row('Phone', data.phone)}${data.message ? row('Message', data.message) : ''}</table>
    <p style="margin:16px 0 0; color:#64748b; font-size:12px;">U-SMART Notifications</p>`;
  sendTicketsNotification(`New product request: ${data.productTitle}`, html).catch((e) => console.error('Tickets notification (product request):', e));
}

/** Build base URL for links and logo. Prefer production domain for reliable image loading. */
function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  return raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
}

/** Logo URL for emails. Use LOGO_URL env for explicit URL, otherwise baseUrl/icon.png. */
function getLogoUrl(): string {
  const explicit = (process.env.LOGO_URL || '').trim();
  if (explicit && explicit.startsWith('http')) return explicit;
  return `${getBaseUrl()}/icon.png`;
}

/** Professional email to user when company dashboard account is approved. Contains username, password, congrats message, and change-password note. */
export async function sendCompanyAccountApprovedEmail(
  to: string,
  params: { name: string; username: string; password: string }
): Promise<boolean> {
  const { name, username, password } = params;
  const baseUrl = getBaseUrl();
  const logoUrl = getLogoUrl();
  const dashboardUrl = `${baseUrl}/dashboard`;
  const safeName = escapeHtml(name || 'عزيزنا العميل');

  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تهانينا! تم تفعيل حسابك - U-SMART</title>
</head>
<body style="margin:0; padding:0; background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 40%, #0f172a 100%); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 40%, #0f172a 100%); min-height:100vh;">
    <tr>
      <td align="center" style="padding: 48px 24px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px; width:100%; background:#ffffff; border-radius:28px; overflow:hidden; box-shadow:0 32px 64px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);">
          <!-- Header with logo & congrats -->
          <tr>
            <td style="background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); padding: 44px 40px 36px; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin-bottom: 20px;">
                <tr><td style="width: 96px; height: 96px; background: #f59e0b; border-radius: 24px; text-align: center; vertical-align: middle; line-height: 96px;">
                  <img src="${logoUrl}" alt="U-SMART" width="80" height="80" style="display:block; margin: 0 auto; border-radius: 20px; max-width: 80px; max-height: 80px;" />
                </td></tr>
              </table>
              <h1 style="margin: 0; color: #fbbf24; font-size: 28px; font-weight: 800; letter-spacing: 1px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">U-SMART</h1>
              <p style="margin: 6px 0 0; color: #e2e8f0; font-size: 15px;">Smart Solutions &amp; Innovation</p>
              <div style="margin-top: 24px; padding: 16px 24px; background: rgba(34,197,94,0.25); border-radius: 16px; border: 1px solid #22c55e; display: inline-block;">
                <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700;">🎉 تهانينا من فريق U-SMART!</p>
                <p style="margin: 6px 0 0; color: #dcfce7; font-size: 15px;">تمت الموافقة على طلبك — حساب لوحة التحكم جاهز الآن</p>
              </div>
            </td>
          </tr>
          <!-- Greeting & credentials -->
          <tr>
            <td style="padding: 40px 40px 36px; background: #ffffff;">
              <h2 style="margin: 0 0 20px; color: #0f172a; font-size: 24px; font-weight: 700;">مرحباً ${safeName}،</h2>
              <p style="margin: 0 0 28px; color: #334155; font-size: 17px; line-height: 1.75;">يسر فريق U-SMART أن يهنئك بموافقتنا على طلب إنشاء لوحة التحكم. يمكنك الآن تسجيل الدخول باستخدام البيانات التالية:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 20px; border: 2px solid #cbd5e1; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 28px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 20px;">
                          <p style="margin: 0 0 6px; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">اسم المستخدم</p>
                          <p style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700; font-family: 'Consolas', 'Monaco', monospace; letter-spacing: 0.5px;">${escapeHtml(username)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <p style="margin: 0 0 6px; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">كلمة المرور</p>
                          <p style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700; font-family: 'Consolas', 'Monaco', monospace; letter-spacing: 1px;">${escapeHtml(password)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="margin-bottom: 28px; padding: 22px 28px; background: #fef3c7; border-radius: 16px; border-right: 5px solid #d97706;">
                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 700;">⚠️ تنبيه أمني مهم</p>
                <p style="margin: 0; color: #451a03; font-size: 15px; line-height: 1.65;">ننصحك بشدة بتغيير كلمة المرور فور أول تسجيل دخول من لوحة التحكم لضمان أمان حسابك وحماية بياناتك.</p>
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                <tr>
                  <td style="background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); border-radius: 14px; box-shadow: 0 4px 14px rgba(217,119,6,0.4);">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener" style="display: inline-block; padding: 18px 40px; color: #ffffff; font-size: 17px; font-weight: 700; text-decoration: none;">تسجيل الدخول إلى لوحة التحكم</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer with team signature -->
          <tr>
            <td style="background: #f1f5f9; padding: 32px 40px; text-align: center; border-top: 2px solid #e2e8f0;">
              <p style="margin: 0; color: #334155; font-size: 15px; font-weight: 600;">بالتوفيق من فريق U-SMART 💙</p>
              <p style="margin: 10px 0 0; color: #475569; font-size: 13px;">© ${new Date().getFullYear()} U-SMART. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `تهانينا من فريق U-SMART!\n\nمرحباً ${name || 'عميلنا'}،\n\nيسر فريق U-SMART أن يهنئك بموافقتنا على طلب إنشاء لوحة التحكم. حسابك جاهز الآن.\n\nاسم المستخدم: ${username}\nكلمة المرور: ${password}\n\nتنبيه مهم: ننصحك بتغيير كلمة المرور فور أول تسجيل دخول.\n\nتسجيل الدخول: ${dashboardUrl}\n\nبالتوفيق من فريق U-SMART`;
  return sendEmail({
    to,
    subject: 'تم تفعيل حسابك — U-SMART لوحة التحكم',
    html,
    text,
  });
}

export async function sendRequesterVerificationApprovedEmail(
  to: string,
  params: { name: string; role: string; specialization?: string | null; username: string }
): Promise<boolean> {
  const role = params.role.toUpperCase();
  const label =
    role === 'ENGINEER' ? 'Engineer' : role === 'TECHNICIAN' ? 'Technician' : params.role;
  const specializationText = params.specialization ? ` (${params.specialization})` : '';
  const html = `
    <p style="margin:0 0 12px; font-size:16px; color:#0f172a;"><strong>Verification approved</strong></p>
    <p style="margin:0 0 12px; color:#334155;">Hello ${escapeHtml(params.name || 'User')},</p>
    <p style="margin:0 0 12px; color:#334155;">
      Your ${escapeHtml(label)} account${escapeHtml(specializationText)} has been approved and verified.
    </p>
    <p style="margin:0 0 12px; color:#334155;">
      Username: <strong>${escapeHtml(params.username)} ✅ Verified</strong>
    </p>
    <p style="margin:0; color:#64748b; font-size:12px;">U-SMART Team</p>
  `.trim();
  return sendEmail({
    to,
    subject: 'Your account verification was approved - U-SMART',
    html,
  });
}

export async function sendRequesterVerificationRejectedEmail(
  to: string,
  params: { name: string; role: string; reason: string }
): Promise<boolean> {
  const role = params.role.toUpperCase();
  const label =
    role === 'ENGINEER' ? 'Engineer' : role === 'TECHNICIAN' ? 'Technician' : params.role;
  const html = `
    <p style="margin:0 0 12px; font-size:16px; color:#0f172a;"><strong>Verification rejected</strong></p>
    <p style="margin:0 0 12px; color:#334155;">Hello ${escapeHtml(params.name || 'User')},</p>
    <p style="margin:0 0 12px; color:#334155;">
      Your ${escapeHtml(label)} verification request was rejected.
    </p>
    <p style="margin:0 0 8px; color:#334155;"><strong>Reason:</strong></p>
    <p style="margin:0 0 12px; color:#334155;">${escapeHtml(params.reason)}</p>
    <p style="margin:0; color:#64748b; font-size:12px;">Please update your documents/details and submit a new request.</p>
  `.trim();
  return sendEmail({
    to,
    subject: 'Your account verification was rejected - U-SMART',
    html,
  });
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

/**
 * Branded credential email for private-workspace staff (new account or password reset).
 * Sends only when `to` is a non-empty email and SMTP is configured.
 */
export async function sendPrivateWorkspaceCredentialsEmail(args: {
  to: string;
  recipientName: string | null;
  workspaceName: string;
  username: string;
  temporaryPassword: string;
  isPasswordReset: boolean;
}): Promise<boolean> {
  const to = args.to.trim();
  if (!to || !to.includes('@')) return false;

  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const siteUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const logoUrl = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL?.trim();
  const name = args.recipientName?.trim() || 'there';
  const subject = args.isPasswordReset
    ? 'Provisor — your workspace sign-in was reset'
    : 'Welcome to your Provisor private workspace';

  const intro = args.isPasswordReset
    ? 'Your workspace administrator reset your password. Use the new temporary password below to sign in to the Provisor mobile app.'
    : 'Your workspace administrator created an account for you on Provisor. Use the credentials below to sign in to the Provisor mobile app.';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;text-align:center;">
            ${
              logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="U-SMART Provisor" width="180" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
            <div style="margin-top:12px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Private workspace</div>`
                : `<div style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:0.5px;">U-SMART</div>
            <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Private workspace</div>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">Hello ${escapeHtml(name)},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Workspace</p>
            <p style="margin:0 0 20px;font-size:15px;color:#0f172a;font-weight:600;">${escapeHtml(args.workspaceName)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <td style="padding:12px 16px;font-size:13px;color:#64748b;width:38%;">Username</td>
                <td style="padding:12px 16px;font-size:15px;font-weight:600;color:#0f172a;font-family:Consolas,monospace;">${escapeHtml(args.username)}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Temporary password</td>
                <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#b45309;font-family:Consolas,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(args.temporaryPassword)}</td>
              </tr>
            </table>
            <div style="margin-top:22px;padding:14px 16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#9a3412;">Important — security</p>
              <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:13px;line-height:1.55;">
                <li>Do not forward this email or share your password in chat, screenshots, or social media.</li>
                <li>Anyone with these credentials can access your workspace account until you change the password.</li>
                <li>You will be asked to choose a new password after your first successful sign-in.</li>
              </ul>
            </div>
            <p style="margin:24px 0 0;font-size:14px;color:#475569;">Open the <strong>Provisor</strong> app, choose <strong>Private role sign-in</strong>, and enter your username and temporary password.</p>
            <p style="margin:16px 0 0;font-size:13px;color:#64748b;">If you did not expect this message, contact your workspace owner immediately.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Visit website</a>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} U-SMART · Provisor</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `Hello ${name},`,
    '',
    intro,
    '',
    `Workspace: ${args.workspaceName}`,
    `Username: ${args.username}`,
    `Temporary password: ${args.temporaryPassword}`,
    '',
    'Security: Do not share this email or your password. Change it after first sign-in.',
    '',
    `Website: ${siteUrl}`,
    '',
    '© U-SMART Provisor',
  ].join('\n');

  return sendEmail({ to, subject, html, text });
}

/**
 * Sends a workspace owner the activation code for a ticket plan they purchased.
 * Used by the admin "generate activation code" flow.
 */
export async function sendActivationCodeEmail(args: {
  to: string;
  recipientName: string | null;
  companyName: string;
  code: string;
  planLabel: string;
  ticketCredits: number;
  unlimitedUntil: Date | string | null;
}): Promise<boolean> {
  const to = args.to.trim();
  if (!to || !to.includes('@')) return false;

  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const siteUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const logoUrl = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL?.trim();
  const name = args.recipientName?.trim() || 'there';
  const subject = 'Provisor — your ticket plan activation code';

  const until = args.unlimitedUntil ? new Date(args.unlimitedUntil) : null;
  const benefit = until && !Number.isNaN(until.getTime())
    ? `Unlimited tickets until ${until.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`
    : `${args.ticketCredits.toLocaleString()} additional tickets`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;text-align:center;">
            ${
              logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="U-SMART Provisor" width="180" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
            <div style="margin-top:12px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Ticket plans</div>`
                : `<div style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:0.5px;">U-SMART</div>
            <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Ticket plans</div>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">Hello ${escapeHtml(name)},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Your ticket plan for <strong>${escapeHtml(args.companyName)}</strong> is ready. Enter the activation code below in the Provisor app to unlock your tickets.</p>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Plan</p>
            <p style="margin:0 0 6px;font-size:15px;color:#0f172a;font-weight:600;">${escapeHtml(args.planLabel)}</p>
            <p style="margin:0 0 20px;font-size:14px;color:#475569;">${escapeHtml(benefit)}</p>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Activation code</p>
            <div style="margin:0 0 4px;padding:18px;background:#f8fafc;border:1px dashed #94a3b8;border-radius:12px;text-align:center;font-size:24px;font-weight:800;letter-spacing:3px;color:#0f172a;font-family:Consolas,monospace;">${escapeHtml(args.code)}</div>
            <div style="margin-top:22px;padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1e3a8a;">How to activate</p>
              <ol style="margin:0;padding-left:18px;color:#1e40af;font-size:13px;line-height:1.55;">
                <li>Open the <strong>Provisor</strong> app and go to <strong>Ticket Plans</strong>.</li>
                <li>Enter the activation code above and tap <strong>Activate</strong>.</li>
              </ol>
            </div>
            <div style="margin-top:18px;padding:14px 16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
              <p style="margin:0;font-size:13px;color:#7c2d12;line-height:1.55;">This code only works for <strong>${escapeHtml(args.companyName)}</strong> and can be used once. Please keep it private.</p>
            </div>
            <p style="margin:16px 0 0;font-size:13px;color:#64748b;">If you did not request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Visit website</a>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} U-SMART · Provisor</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `Hello ${name},`,
    '',
    `Your ticket plan for ${args.companyName} is ready.`,
    `Plan: ${args.planLabel} (${benefit})`,
    '',
    `Activation code: ${args.code}`,
    '',
    'How to activate: open the Provisor app, go to Ticket Plans, enter the code and tap Activate.',
    `This code only works for ${args.companyName} and can be used once.`,
    '',
    `Website: ${siteUrl}`,
    '',
    '© U-SMART Provisor',
  ].join('\n');

  return sendEmail({ to, subject, html, text });
}

/**
 * Notify a company owner that their request to upgrade into a private workspace
 * was approved. Sent from the admin private-companies approve action.
 */
export async function sendPrivateWorkspaceApprovedEmail(args: {
  to: string;
  recipientName: string | null;
  workspaceName: string;
}): Promise<boolean> {
  const to = args.to.trim();
  if (!to || !to.includes('@')) return false;

  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  const siteUrl = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
  const logoUrl = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL?.trim();
  const name = args.recipientName?.trim() || 'there';
  const workspace = args.workspaceName.trim() || 'your workspace';
  const subject = 'Provisor — your private workspace is approved';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;text-align:center;">
            ${
              logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="U-SMART Provisor" width="180" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
            <div style="margin-top:12px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Private workspaces</div>`
                : `<div style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:0.5px;">U-SMART</div>
            <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">Provisor · Private workspaces</div>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            <div style="margin:0 0 20px;padding:14px 18px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;text-align:center;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#065f46;">🎉 Request approved</p>
            </div>
            <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">Hello ${escapeHtml(name)},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Great news — your request to upgrade to a private workspace, <strong>${escapeHtml(workspace)}</strong>, has been approved. You can now build your departments, invite staff, and start managing tickets in the Provisor app.</p>
            <div style="margin-top:8px;padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1e3a8a;">Next steps</p>
              <ol style="margin:0;padding-left:18px;color:#1e40af;font-size:13px;line-height:1.55;">
                <li>Open the <strong>Provisor</strong> app and go to your workspace.</li>
                <li>Create departments and add managers, owners, and staff.</li>
                <li>Start creating and assigning tickets.</li>
              </ol>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Visit website</a>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} U-SMART · Provisor</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `Hello ${name},`,
    '',
    `Your request to upgrade to a private workspace, ${workspace}, has been approved.`,
    'You can now build your departments, invite staff, and start managing tickets in the Provisor app.',
    '',
    'Next steps:',
    '1. Open the Provisor app and go to your workspace.',
    '2. Create departments and add managers, owners, and staff.',
    '3. Start creating and assigning tickets.',
    '',
    `Website: ${siteUrl}`,
    '',
    '© U-SMART Provisor',
  ].join('\n');

  return sendEmail({ to, subject, html, text });
}
