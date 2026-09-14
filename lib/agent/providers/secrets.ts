import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function secretKey(): Buffer {
  const raw =
    process.env.U_AGENT_SECRETS_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-insecure-u-agent-secrets-key';
  return createHash('sha256').update(raw).digest();
}

/** Encrypt API key for DB storage. Format: v1:<iv_b64>:<tag_b64>:<cipher_b64> */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [ver, ivB64, tagB64, dataB64] = stored.split(':');
    if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return out.toString('utf8');
  } catch {
    // Common after rotating U_AGENT_SECRETS_KEY / JWT_SECRET — admin must re-save the key.
    console.warn(
      '[secrets] decryptSecret failed — re-save the API key in Admin (encryption key may have rotated)'
    );
    return null;
  }
}

/** True when an encrypted blob can be decrypted with the current secrets key. */
export function isSecretDecryptable(stored: string | null | undefined): boolean {
  return !!decryptSecret(stored);
}

export function maskApiKey(plainOrEncrypted: string | null | undefined): string | null {
  if (!plainOrEncrypted) return null;
  const plain = plainOrEncrypted.startsWith('v1:')
    ? decryptSecret(plainOrEncrypted)
    : plainOrEncrypted;
  if (!plain) return '••••';
  if (plain.length <= 8) return '••••';
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}
