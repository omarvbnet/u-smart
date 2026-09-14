import { NextRequest, NextResponse } from 'next/server';
import { decodeProviserPublicFileToken } from '@/lib/agent/docs/public-url';

/**
 * GET /api/public/u-agent-file/:token
 * Redirects to the underlying Blob/storage URL while exposing a Proviser domain link.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length > 4000) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 400 });
  }
  const target = decodeProviserPublicFileToken(token);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Invalid file link' }, { status: 400 });
  }
  let host = '';
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid file URL' }, { status: 400 });
  }
  const allowed =
    host.endsWith('.blob.vercel-storage.com') ||
    host.endsWith('usmart-iot.com') ||
    host === 'localhost' ||
    host.endsWith('.public.blob.vercel-storage.com');
  if (!allowed) {
    return NextResponse.json({ success: false, message: 'Host not allowed' }, { status: 403 });
  }
  return NextResponse.redirect(target, 302);
}
