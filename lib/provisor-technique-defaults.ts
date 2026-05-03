/** Fallback when DB has no rows (before seed / admin setup). */
export const DEFAULT_INSPECTION_TECHNIQUES = [
  { slug: 'inspection', labelAr: 'الفحص', labelEn: 'Inspection', sortOrder: 0 },
  { slug: 'supervision', labelAr: 'الإشراف', labelEn: 'Supervision', sortOrder: 1 },
  { slug: 'building', labelAr: 'البناء', labelEn: 'Building', sortOrder: 2 },
  { slug: 'hse', labelAr: 'الصحة والسلامة', labelEn: 'HSE', sortOrder: 3 },
  { slug: 'investigation', labelAr: 'التحقيق', labelEn: 'Investigation', sortOrder: 4 },
  { slug: 'tracking', labelAr: 'التتبع', labelEn: 'Tracking', sortOrder: 5 },
] as const;

export const DEFAULT_MAINTENANCE_TECHNIQUES = [
  { slug: 'fiber_route', labelAr: 'مسار الألياف', labelEn: 'Fiber route', sortOrder: 0 },
  { slug: 'fiber_site', labelAr: 'موقع الألياف', labelEn: 'Fiber site', sortOrder: 1 },
  { slug: 'electrical', labelAr: 'كهرباء', labelEn: 'Electrical', sortOrder: 2 },
  { slug: 'telecom', labelAr: 'اتصالات', labelEn: 'Telecom', sortOrder: 3 },
  { slug: 'ftth', labelAr: 'FTTH', labelEn: 'FTTH', sortOrder: 4 },
] as const;

export const DEFAULT_MAINTENANCE_SLUGS = DEFAULT_MAINTENANCE_TECHNIQUES.map((t) => t.slug);
