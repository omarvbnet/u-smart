import { NextRequest, NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { listActiveReasons, type PlatformReasonAudience, type PlatformReasonKind } from '@/lib/platform-reasons';

const KINDS = ['MAINTENANCE', 'EXPENSE'] as const;
const AUDIENCES = ['INDIVIDUAL', 'COMPANY'] as const;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const sp = new URL(req.url).searchParams;
  const kind = String(sp.get('kind') ?? '').toUpperCase();
  const audienceParam = String(sp.get('audience') ?? '').toUpperCase();
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ success: false, message: 'Invalid kind' }, { status: 400 });
  }
  const audience: PlatformReasonAudience = (AUDIENCES as readonly string[]).includes(audienceParam)
    ? (audienceParam as PlatformReasonAudience)
    : 'INDIVIDUAL';
  const reasons = await listActiveReasons({ kind: kind as PlatformReasonKind, audience });
  return NextResponse.json({
    success: true,
    reasons: reasons.map((r) => ({
      id: r.id,
      label: r.label,
      description: r.description,
      audience: r.audience,
    })),
  });
}
