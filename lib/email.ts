/**
 * Transactional emails (subscription confirmations, training request confirmations)
 * with U-SMART branded layout and logo. Uses Resend API (same as notify-subscribers).
 */

const RESEND_API = 'https://api.resend.com/emails';

function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (url) {
    return url.startsWith('http') ? url : `https://${url}`;
  }
  return 'https://usmart-iot.com';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Wraps body content in U-SMART branded layout with logo and footer. */
function brandedLayout(bodyHtml: string): string {
  const siteUrl = getSiteUrl();
  const logoUrl = `${siteUrl}/logo/usmart.PNG`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>U-SMART</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color:#ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 24px 32px; background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); text-align: center;">
              <a href="${siteUrl}" style="display: inline-block; text-decoration: none;">
                <img src="${logoUrl}" alt="U-SMART" width="160" height="48" style="display: block; max-width: 160px; height: auto;" />
              </a>
              <p style="margin: 12px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.7); letter-spacing: 0.05em;">
                Smart Homes · Networking · Software Solutions
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 32px 32px; color: #334155; font-size: 15px; line-height: 1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 24px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 4px 0;">U-SMART – Pioneering digital transformation through innovation and excellence.</p>
              <p style="margin: 0;"><a href="${siteUrl}" style="color: #0ea5e9; text-decoration: none;">usmart-iot.com</a> · Iraq, Kirkuk</p>
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

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'U-SMART <contact@usmart-iot.com>';
  if (!apiKey) {
    console.warn('email: RESEND_API_KEY not set, skipping send');
    return false;
  }
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend send error:', res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Resend send error:', e);
    return false;
  }
}

/** Send a professional confirmation email when someone subscribes to the newsletter. */
export async function sendSubscriptionConfirmation(email: string, name?: string | null): Promise<boolean> {
  const siteUrl = getSiteUrl();
  const greeting = name && name.trim() ? `Hi ${escapeHtml(name.trim())},` : 'Hi there,';

  const body = `
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 16px 0;">Thank you for subscribing to U-SMART updates. You will receive news about our projects, services, and company updates.</p>
    <p style="margin: 0 0 20px 0;">If you did not subscribe, you can ignore this email.</p>
    <p style="margin: 0;">
      <a href="${siteUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(90deg, #0891b2, #06b6d4); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">Visit U-SMART</a>
    </p>
  `;

  const html = brandedLayout(body);
  return sendViaResend(email, 'You’re subscribed – U-SMART', html);
}

export type TrainingRequestEmailData = {
  requesterName: string;
  requesterEmail: string;
  serviceTitle: string;
  serviceSlug?: string;
  company?: string | null;
  message?: string | null;
  budget?: string | null;
};

/** Send a professional confirmation email when someone submits a training request. */
export async function sendTrainingRequestConfirmation(
  to: string,
  data: TrainingRequestEmailData
): Promise<boolean> {
  const siteUrl = getSiteUrl();
  const name = (data.requesterName || 'there').trim();
  const serviceTitle = escapeHtml(data.serviceTitle || 'Training');

  let details = `
    <tr><td style="padding: 6px 0; color: #64748b;">Service</td><td style="padding: 6px 0; font-weight: 600;">${serviceTitle}</td></tr>
  `;
  if (data.company) {
    details += `<tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="padding: 6px 0;">${escapeHtml(data.company)}</td></tr>`;
  }
  if (data.message) {
    details += `<tr><td style="padding: 6px 0; color: #64748b;">Message</td><td style="padding: 6px 0;">${escapeHtml(data.message)}</td></tr>`;
  }
  if (data.budget) {
    details += `<tr><td style="padding: 6px 0; color: #64748b;">Budget / notes</td><td style="padding: 6px 0;">${escapeHtml(data.budget)}</td></tr>`;
  }

  const body = `
    <p style="margin: 0 0 16px 0;">Hi ${escapeHtml(name)},</p>
    <p style="margin: 0 0 20px 0;">We have received your training request. Our team will review it and get back to you shortly.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 20px 0; font-size: 14px;">
      ${details}
    </table>
    <p style="margin: 0 0 20px 0;">If you have any questions in the meantime, reply to this email or contact us at <a href="mailto:contact@usmart-iot.com" style="color: #0ea5e9;">contact@usmart-iot.com</a>.</p>
    <p style="margin: 0;">
      <a href="${siteUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(90deg, #0891b2, #06b6d4); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">Visit U-SMART</a>
    </p>
  `;

  const html = brandedLayout(body);
  return sendViaResend(to, `Training request received – ${serviceTitle} | U-SMART`, html);
}
