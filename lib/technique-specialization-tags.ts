/**
 * Optional ticket routing: when [specializationTags] is non-empty on a visitor request,
 * only engineers with a matching RequesterSpecialization see the ticket in the PENDING pool
 * (GET /api/tickets for role ENGINEER). Empty tags = all engineers (province rules still apply).
 */

const REQUESTER_SPEC = new Set(['ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER']);

/** Map common technique slugs → RequesterSpecialization enum values (uppercase). */
const TECHNIQUE_SLUG_TO_SPECS: Record<string, string[]> = {
  civil: ['CIVIL'],
  structural: ['CIVIL'],
  building: ['CIVIL'],
  electrical: ['ELECTRICAL'],
  mechanical: ['MECHANICAL'],
  telecom: ['TELECOM'],
  ftth: ['TELECOM'],
  fiber: ['TELECOM'],
  fiber_route: ['TELECOM'],
  fiber_site: ['TELECOM'],
  programmer: ['PROGRAMMER'],
};

export function normalizeSpecializationTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const x of raw) {
    const u = String(x).trim().toUpperCase();
    if (REQUESTER_SPEC.has(u)) out.add(u);
  }
  return [...out];
}

export function deriveSpecializationTagsFromTechnique(technique: string): string[] {
  const key = technique.trim().toLowerCase();
  const mapped = TECHNIQUE_SLUG_TO_SPECS[key];
  return mapped ? [...mapped] : [];
}
