/** Enrichment for GET /api/tickets/[id]: site coordinates + checklist template preview. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveTicketSiteCoordinates(prisma: any, siteName: string | null, ownerRequesterId: string | null) {
  if (!siteName?.trim() || !ownerRequesterId?.trim()) return {};
  try {
    const site = await prisma.site.findFirst({
      where: { siteId: siteName.trim(), requesterId: ownerRequesterId },
      select: { latitude: true, longitude: true },
    });
    if (site?.latitude != null && site?.longitude != null) {
      return { siteLatitude: site.latitude, siteLongitude: site.longitude };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function normalizeChecklistTemplateItems(raw: unknown): Array<{ id: string; label: string; weight: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label: string; weight: string }> = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : null;
    const label = typeof o.label === 'string' ? o.label : null;
    if (!id || !label) continue;
    const w = o.weight === 'major' ? 'major' : 'minor';
    out.push({ id, label, weight: w });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveInspectionChecklistTemplate(prisma: any, templateId: string | null | undefined) {
  if (!templateId || !String(templateId).trim()) {
    return { checklistTemplateId: null as string | null, checklistTemplate: null as { id: string; name: string; items: Array<{ id: string; label: string; weight: string }> } | null };
  }
  const id = String(templateId).trim();
  try {
    const tpl = await prisma.inspectionChecklist.findUnique({
      where: { id },
      select: { id: true, name: true, items: true },
    });
    if (!tpl) {
      return { checklistTemplateId: id, checklistTemplate: null };
    }
    const items = normalizeChecklistTemplateItems(tpl.items);
    return {
      checklistTemplateId: id,
      checklistTemplate: { id: tpl.id, name: tpl.name, items },
    };
  } catch {
    return { checklistTemplateId: id, checklistTemplate: null };
  }
}
