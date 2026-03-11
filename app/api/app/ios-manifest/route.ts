import { NextResponse } from 'next/server';

/**
 * Serves the iOS OTA installation manifest (plist) for the Provisor app.
 * Required for ad-hoc / enterprise distribution: users tap "Download for iOS"
 * which opens itms-services://?action=download-manifest&url=... and iOS fetches
 * this manifest to download and install the IPA.
 *
 * Set NEXT_PUBLIC_SITE_URL (or VERCEL_URL) so the IPA URL is absolute HTTPS.
 */
const BUNDLE_ID = 'com.usmart.usmartQc';
const APP_TITLE = 'Provisor';
const VERSION = '1.0.0';

function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
  if (!raw) return 'https://localhost:3000';
  const base = raw.startsWith('http') ? raw : `https://${raw}`;
  return base.replace(/\/$/, '');
}

export async function GET() {
  const baseUrl = getBaseUrl();
  const ipaUrl = `${baseUrl}/app/proviser.ipa`;
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
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
