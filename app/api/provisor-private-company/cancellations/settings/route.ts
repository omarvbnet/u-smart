import { NextRequest, NextResponse } from 'next/server';
import { cancellationsGuard } from '@/lib/private-company-cancellations';
import { loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';

/**
 * GET /api/provisor-private-company/cancellations/settings
 * Read-only: reasons are configured in admin → Ticket cancel / resubmit.
 */
export async function GET(req: NextRequest) {
  const guard = await cancellationsGuard(req);
  if (!guard.ok) return guard.response;

  const policy = await loadPlatformTicketPolicy();
  return NextResponse.json({
    success: true,
    settings: { reasons: policy.cancellationReasons },
    canConfigure: false,
    configuredByAdmin: true,
  });
}

export async function PATCH() {
  return NextResponse.json(
    {
      success: false,
      message:
        'Cancellation reasons are managed in the admin panel (Ticket cancel / resubmit), not in the workspace.',
    },
    { status: 403 }
  );
}
