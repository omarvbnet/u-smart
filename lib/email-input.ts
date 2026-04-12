/**
 * Normalize pasted emails (RTL/zero-width/fullwidth @) so client + server agree.
 */
export function normalizeEmailInput(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u2060\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/\uFF20/g, '@')
    .trim();
}

export function isValidEmailFormat(raw: string): boolean {
  const e = normalizeEmailInput(raw).toLowerCase();
  if (!e || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
