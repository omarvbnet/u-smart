import { NextRequest, NextResponse } from 'next/server';
import {
  getStaffLiveLocationGuard,
  listActiveStaffLiveLocations,
  serializeStaffLiveLocation,
  upsertStaffLiveLocation,
} from '@/lib/staff-live-locations';

function parseCoord(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** POST — report current GPS while on a QField map (workspace members). */
export async function POST(req: NextRequest) {
  const g = await getStaffLiveLocationGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const latitude = parseCoord(body.latitude);
  const longitude = parseCoord(body.longitude);
  if (latitude == null || longitude == null) {
    return NextResponse.json(
      { success: false, message: 'latitude and longitude are required.' },
      { status: 400 }
    );
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ success: false, message: 'Invalid coordinates.' }, { status: 400 });
  }

  const accuracyRaw = parseCoord(body.accuracy);
  const accuracy =
    accuracyRaw != null && accuracyRaw >= 0 && accuracyRaw < 5000 ? accuracyRaw : null;

  try {
    await upsertStaffLiveLocation(
      guard.requesterId,
      guard.companyId,
      latitude,
      longitude,
      accuracy
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/provisor-private-company/live-locations:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update location.' },
      { status: 500 }
    );
  }
}

/** GET — team live locations (owners / managers see staff with names). */
export async function GET(req: NextRequest) {
  const g = await getStaffLiveLocationGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;

  try {
    const rows = guard.canViewTeam
      ? await listActiveStaffLiveLocations(guard.companyId, guard.requesterId)
      : [];

    return NextResponse.json({
      success: true,
      canViewTeam: guard.canViewTeam,
      canViewNames: guard.canViewNames,
      locations: rows.map((row) =>
        serializeStaffLiveLocation(row, { includeName: guard.canViewNames })
      ),
    });
  } catch (err) {
    console.error('GET /api/provisor-private-company/live-locations:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load team locations.' },
      { status: 500 }
    );
  }
}
