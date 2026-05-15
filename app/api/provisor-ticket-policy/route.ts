import { NextResponse } from 'next/server';
import { loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';

/**
 * GET /api/provisor-ticket-policy
 * Public read for mobile app (company, personal, workspace users).
 */
export async function GET() {
  const policy = await loadPlatformTicketPolicy();
  return NextResponse.json({
    success: true,
    cancellationReasons: policy.cancellationReasons,
    resubmitReasons: policy.resubmitReasons,
  });
}
