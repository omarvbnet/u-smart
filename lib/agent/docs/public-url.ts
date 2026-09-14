import { getProviserWebOrigin } from '@/lib/proviser-host';

/** Rewrite storage URLs so users/share links use the Proviser domain. */
export function toProviserPublicFileUrl(storageUrl: string): {
  publicUrl: string;
  storageUrl: string;
} {
  const origin = getProviserWebOrigin();
  if (!storageUrl) {
    return { publicUrl: origin, storageUrl };
  }
  if (storageUrl.startsWith('/')) {
    return { publicUrl: `${origin}${storageUrl}`, storageUrl };
  }
  // Already on Proviser / main domain — keep.
  if (
    storageUrl.includes('proviser.usmart-iot.com') ||
    storageUrl.includes('provisor.usmart-iot.com') ||
    storageUrl.includes('usmart-iot.com/api/public/')
  ) {
    return { publicUrl: storageUrl, storageUrl };
  }
  const token = Buffer.from(storageUrl, 'utf8').toString('base64url');
  return {
    publicUrl: `${origin}/api/public/u-agent-file/${token}`,
    storageUrl,
  };
}

export function decodeProviserPublicFileToken(token: string): string | null {
  try {
    const url = Buffer.from(token, 'base64url').toString('utf8');
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}
