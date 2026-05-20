/** Enrichment for GET /api/tickets/[id]: site coordinates + checklist template preview. */

/** Coordinates stored on ticket JSON (`company`) when the requester pinned the site at creation. */
export function embeddedTicketSiteCoords(parsed: unknown): { siteLatitude: number; siteLongitude: number } | Record<string, never> {
  if (!parsed || typeof parsed !== 'object') return {};
  const p = parsed as Record<string, unknown>;
  if (!p._ticket) return {};
  const la = p.siteLatitude;
  const lo = p.siteLongitude;
  if (typeof la === 'number' && typeof lo === 'number' && Number.isFinite(la) && Number.isFinite(lo)) {
    return { siteLatitude: la, siteLongitude: lo };
  }
  return {};
}

/** Coordinates from a workspace site row (private company site catalog). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveWorkspaceSiteCoordinates(
  prisma: any,
  companyId: string | null | undefined,
  siteCode: string | null | undefined
): Promise<{ siteLatitude: number; siteLongitude: number } | Record<string, never>> {
  const cid = companyId?.trim();
  const code = siteCode?.trim();
  if (!cid || !code) return {};
  try {
    const site = await prisma.privateCompanySite.findFirst({
      where: {
        companyId: cid,
        siteCode: code,
        confirmationStatus: 'CONFIRMED',
      },
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
    if (tpl) {
      const items = normalizeChecklistTemplateItems(tpl.items);
      return {
        checklistTemplateId: id,
        checklistTemplate: { id: tpl.id, name: tpl.name, items },
      };
    }
  } catch {
    /* inspection_checklists query failed — try workspace checklist */
  }
  // Workspace templates live in `private_company_checklists` (same id stored on the ticket).
  try {
    const pc = await prisma.privateCompanyChecklist?.findUnique?.({
      where: { id },
      select: { id: true, name: true, items: true },
    });
    if (pc) {
      const items = normalizeChecklistTemplateItems(pc.items);
      return {
        checklistTemplateId: id,
        checklistTemplate: { id: pc.id, name: pc.name, items },
      };
    }
  } catch {
    /* table may be absent on legacy DB */
  }
  return { checklistTemplateId: id, checklistTemplate: null };
}

/**
 * Job site coordinates for proximity checks: embedded on ticket JSON first,
 * then linked Site row for the ticket requester.
 */
export async function resolveTicketSitePointForVisitor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client from route handlers
  prisma: any,
  args: {
    companyJson: string | null | undefined;
    siteName: string | null | undefined;
    requesterId: string | null | undefined;
    privateCompanyId?: string | null | undefined;
  }
): Promise<{ lat: number; lng: number } | null> {
  try {
    const p = typeof args.companyJson === 'string' ? JSON.parse(args.companyJson) : {};
    const embed = embeddedTicketSiteCoords(p);
    if ('siteLatitude' in embed) {
      return { lat: embed.siteLatitude, lng: embed.siteLongitude };
    }
  } catch {
    /* ignore */
  }
  const fromWorkspace = await resolveWorkspaceSiteCoordinates(
    prisma,
    args.privateCompanyId ?? null,
    args.siteName ?? null
  );
  if ('siteLatitude' in fromWorkspace) {
    return { lat: fromWorkspace.siteLatitude, lng: fromWorkspace.siteLongitude };
  }
  const fromSite = await resolveTicketSiteCoordinates(prisma, args.siteName ?? null, args.requesterId ?? null);
  if ('siteLatitude' in fromSite) {
    return { lat: fromSite.siteLatitude, lng: fromSite.siteLongitude };
  }
  return null;
}
