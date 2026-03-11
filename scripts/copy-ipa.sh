#!/bin/bash
# Copy proviser.ipa to public/app/ for iOS OTA install.
# Usage: ./scripts/copy-ipa.sh [path-to-proviser.ipa]
# Example: ./scripts/copy-ipa.sh ~/Downloads/Runner\ 2026-03-11\ 02-32-27/Apps/proviser.ipa

set -e
cd "$(dirname "$0")/.."
mkdir -p public/app

IPA_SRC="${1:-}"
if [ -z "$IPA_SRC" ]; then
  echo "Usage: ./scripts/copy-ipa.sh <path-to-proviser.ipa>"
  echo "Example: ./scripts/copy-ipa.sh ~/Downloads/Runner\\ 2026-03-11\\ 02-32-27/Apps/proviser.ipa"
  exit 1
fi

if [ ! -f "$IPA_SRC" ]; then
  echo "Error: File not found: $IPA_SRC"
  exit 1
fi

cp "$IPA_SRC" public/app/proviser.ipa
echo "✓ Copied proviser.ipa to public/app/"
echo "  Commit and push to deploy, or run: npm run build && vercel --prod"
