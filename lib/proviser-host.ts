/** Hostnames that serve the Proviser web app at `/proviser` (rewritten from `/` on subdomain). */
const PROVISER_HOSTS = new Set([
  'proviser.usmart-iot.com',
  'provisor.usmart-iot.com',
  'proviser.localhost',
]);

export function isProviserAppHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  if (PROVISER_HOSTS.has(h)) return true;
  if (h.startsWith('proviser.') || h.startsWith('provisor.')) return true;
  const envHost = process.env.NEXT_PUBLIC_PROVISER_HOST?.toLowerCase().trim();
  return !!envHost && h === envHost;
}

/** Public base URL for Proviser web (links, metadata). */
export function getProviserWebOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PROVISER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://proviser.usmart-iot.com';
}
