import { NextResponse } from 'next/server';

/**
 * Serves the iOS OTA installation manifest (plist) for the Provisor app.
 * Required for ad-hoc / enterprise distribution: users tap "Download for iOS"
 * which opens itms-services://?action=download-manifest&url=... and iOS fetches
 * this manifest to download and install the IPA.
 *
 * Uses the request URL for base so manifest/IPA links match the domain the user visits.
 */
const BUNDLE_ID = 'com.usmart.usmartQc';
const APP_TITLE = 'Provisor';
const VERSION = '1.0.0';

function getBaseUrl(request: Request): string {
  try {
    const url = new URL(request.url);
    if (url.origin && url.origin !== 'null') return url.origin;
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    if (host) return `${proto === 'https' ? 'https' : 'http'}://${host}`.replace(/\/$/, '');
  } catch {
    // fallback
  }
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  if (!raw) return 'https://localhost:3000';
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw}`.replace(/\/$/, '');
}

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  const ipaUrl =
    process.env.NEXT_PUBLIC_QC_APP_IPA_URL?.startsWith('http')
      ? process.env.NEXT_PUBLIC_QC_APP_IPA_URL
      : `${baseUrl}/app/proviser.ipa`;
  const displayImageUrl = `${baseUrl}/app/icon-57.png`;
  const fullSizeImageUrl = `${baseUrl}/app/icon-512.png`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${ipaUrl}</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>display-image</string>
          <key>url</key>
          <string>${displayImageUrl}</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>full-size-image</string>
          <key>url</key>
          <string>${fullSizeImageUrl}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${BUNDLE_ID}</string>
        <key>bundle-version</key>
        <string>${VERSION}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${APP_TITLE}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;

  return new NextResponse(plist, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
