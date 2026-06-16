/**
 * Host detection for U Smart Studio — the Proviser Electrical Digital Twin.
 * Served at `/studio` (rewritten from `/` on the studio subdomain), mirroring
 * the Proviser app host pattern.
 */
const STUDIO_HOSTS = new Set([
  'studio.usmart-iot.com',
  'studio.localhost',
]);

export function isStudioAppHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  if (STUDIO_HOSTS.has(h)) return true;
  if (h.startsWith('studio.')) return true;
  const envHost = process.env.NEXT_PUBLIC_STUDIO_HOST?.toLowerCase().trim();
  return !!envHost && h === envHost;
}

/** Public base URL for U Smart Studio (links, metadata). */
export function getStudioWebOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STUDIO_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://studio.usmart-iot.com';
}
