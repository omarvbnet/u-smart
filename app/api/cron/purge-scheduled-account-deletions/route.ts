import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredAccountDeletions } from '@/lib/ticket-requester-account-deletion';

/**
 * Optional cron: permanently delete accounts whose 7-day grace ended without login.
 * Secure with CRON_SECRET header when configured.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const purged = await purgeExpiredAccountDeletions();
    return NextResponse.json({ success: true, purged });
  } catch (err) {
    console.error('GET /api/cron/purge-scheduled-account-deletions:', err);
    return NextResponse.json({ success: false, message: 'Purge failed' }, { status: 500 });
  }
}
