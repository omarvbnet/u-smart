import { NextRequest, NextResponse } from 'next/server';
import {
  cancellationsGuard,
  canConfigureCancellationReasons,
  loadCancellationSettings,
  normalizeCancellationReasons,
  serializeCancellationSettings,
} from '@/lib/private-company-cancellations';
import { loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/cancellations/settings
 * PATCH body: { reasons: string[] }
 * Owner, manager, or coordinator can manage workspace cancellation reasons.
 */
export async function GET(req: NextRequest) {
  const guard = await cancellationsGuard(req);
  if (!guard.ok) return guard.response;

  const row = await loadCancellationSettings(guard.companyId);
  const workspace = serializeCancellationSettings(row ?? { ticketCancellationReasons: [] });
  const platform = await loadPlatformTicketPolicy();

  return NextResponse.json({
    success: true,
    settings: workspace,
    platformReasons: platform.cancellationReasons,
    canConfigure: canConfigureCancellationReasons(guard),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await cancellationsGuard(req);
  if (!guard.ok) return guard.response;

  if (!canConfigureCancellationReasons(guard)) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner, manager, or coordinator can configure cancellation reasons.',
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (body?.reasons === undefined) {
    return NextResponse.json({ success: false, message: 'reasons array is required.' }, { status: 400 });
  }

  const reasons = normalizeCancellationReasons(body.reasons);
  await prisma.privateCompany.update({
    where: { id: guard.companyId },
    data: { ticketCancellationReasons: reasons },
  });

  return NextResponse.json({
    success: true,
    settings: { reasons },
  });
}
