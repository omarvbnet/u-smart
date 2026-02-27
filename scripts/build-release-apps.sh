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
if flutter build ipa 2>/dev/null; then
  IPA_PATH="build/ios/ipa/usmart_qc.ipa"
  if [ -f "$IPA_PATH" ]; then
    cp "$IPA_PATH" ../public/app/usmart_qc.ipa
    echo "iOS IPA copied to public/app/usmart_qc.ipa"
    echo "Set NEXT_PUBLIC_QC_APP_IOS_URL=/app/usmart_qc.ipa in .env.local"
  fi
else
  echo "iOS build skipped (requires codesigning). Use Xcode to archive and export IPA for ad-hoc or enterprise, then place usmart_qc.ipa in public/app/"
fi

echo ""
echo "Done. Both apps are hosted at /app/ for direct download from your webpage."
