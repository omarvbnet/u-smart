import crypto from 'crypto';

/** Cryptographically secure password suitable for email-based recovery (user must replace on login). */
export function generateTemporaryPassword(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}
