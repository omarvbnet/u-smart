#!/bin/bash
# Build release versions of the Provisor (usmart_qc) app for web hosting.
# Both APK (Android) and IPA (iOS) are copied to public/app/ for direct download from your site.
# Run from project root: ./scripts/build-release-apps.sh

set -e
cd "$(dirname "$0")/.."
mkdir -p public/app

cd usmart_qc

echo "Building Android release APK..."
flutter build apk --release

APK_PATH="build/app/outputs/flutter-apk/app-release.apk"
if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" ../public/app/usmart_qc.apk
  echo "Android APK copied to public/app/usmart_qc.apk"
else
  echo "APK not found at $APK_PATH"
  exit 1
fi

echo ""
echo "Building iOS release (requires macOS, Xcode, and Apple Developer account)..."

# Force modern Xcode path unless caller already provided DEVELOPER_DIR.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d "/Applications/Xcode.app/Contents/Developer" ]; then
  export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
fi

if command -v xcodebuild >/dev/null 2>&1; then
  XCODE_VERSION_RAW="$(xcodebuild -version | awk 'NR==1{print $2}')"
  XCODE_MAJOR="${XCODE_VERSION_RAW%%.*}"
  if [ -z "$XCODE_MAJOR" ] || [ "$XCODE_MAJOR" -lt 26 ]; then
    echo "ERROR: App Store uploads now require iOS 26 SDK (Xcode 26+)."
    echo "Current Xcode: ${XCODE_VERSION_RAW:-unknown}. Please switch to Xcode 26 or newer."
    echo "Example: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    exit 1
  fi
fi

if flutter build ipa 2>/dev/null; then
  IPA_PATH="build/ios/ipa/usmart_qc.ipa"
  if [ -f "$IPA_PATH" ]; then
    cp "$IPA_PATH" ../public/app/proviser.ipa
    echo "iOS IPA copied to public/app/proviser.ipa"
    echo "Set NEXT_PUBLIC_QC_APP_IOS_URL=/app/proviser.ipa in .env.local"
  fi
else
  echo "iOS build skipped (requires codesigning). Use Xcode to archive and export proviser.ipa, then place it in public/app/proviser.ipa"
fi

echo ""
echo "Done. Both apps are hosted at /app/ for direct download from your webpage."
