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
