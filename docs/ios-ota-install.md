# iOS OTA (Over-the-Air) Distribution for Provisor

This guide covers building and hosting the Provisor app for direct download from your website—no App Store required.

## Prerequisites

- **macOS** with Xcode
- **Apple Developer account** ($99/year) for ad-hoc, or **Apple Enterprise Program** ($299/year) for enterprise
- **Flutter** installed and configured

## Distribution Options

| Method | Device limit | Requirement |
|--------|--------------|-------------|
| **Ad-hoc** | 100 devices (registered UDIDs) | Apple Developer Program |
| **Enterprise** | Unlimited (internal use) | Apple Enterprise Program |

## Step 1: Build the IPA

### Option A: Ad-hoc (up to 100 devices)

1. In Xcode, open `usmart_qc/ios/Runner.xcworkspace`
2. Select your development team and a device
3. **Product → Archive**
4. In Organizer: **Distribute App** → **Ad Hoc** → choose provisioning profile
5. Export the `.ipa` file

### Option B: Enterprise

1. Archive as above
2. **Distribute App** → **Enterprise** → choose enterprise provisioning profile
3. Export the `.ipa` file

### Option C: Flutter CLI (if signing is configured)

```bash
cd usmart_qc
flutter build ipa
# Output: build/ios/ipa/usmart_qc.ipa
```

## Step 2: Host the IPA

1. Copy the IPA to your site’s static folder:
   ```bash
   cp path/to/proviser.ipa public/app/proviser.ipa
   ```

2. Ensure the file is served over **HTTPS** (required for iOS OTA install).

## Step 3: Configure Environment

Set your production URL so the manifest and IPA links work correctly:

```env
# .env.local or production env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

If using Vercel, `VERCEL_URL` is used as fallback (e.g. `https://your-app.vercel.app`).

## Step 4: How It Works

1. User visits the Quality Control service page on their iPhone
2. User taps **Download for iOS**
3. iOS opens `itms-services://?action=download-manifest&url=...`
4. The manifest (`/api/app/ios-manifest`) tells iOS where to fetch the IPA
5. iOS downloads and installs the app

## Troubleshooting

- **"Unable to install"**:
  1. **Manifest images**: iOS 8+ requires `display-image` (57x57) and `full-size-image` (512x512) in the manifest—these are at `/app/icon-57.png` and `/app/icon-512.png`.
  2. **IPA signing**: The IPA must be signed for **Ad Hoc** or **Enterprise**—`flutter build ipa` alone produces an App Store build. Use Xcode: Archive → Distribute App → **Ad Hoc** (or Enterprise), then export.
  3. **Bundle ID must match**: The IPA’s bundle ID must be exactly `com.usmart.usmartQc`. Build from `usmart_qc` (not a different project) and use `scripts/copy-ipa.sh` to copy the exported IPA.
  4. **Device UDID** (Ad Hoc): The device must be in your provisioning profile. Add it in [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles → Devices.
  5. **Developer Mode** (iOS 16+): Enable Settings → Privacy & Security → Developer Mode.
- **Manifest not loading**: Verify `NEXT_PUBLIC_SITE_URL` is set and uses HTTPS
- **404 on IPA**: Check that `public/app/proviser.ipa` exists and is deployed

## Bundle Info

- **Bundle ID**: `com.usmart.usmartQc`
- **App name**: Provisor
