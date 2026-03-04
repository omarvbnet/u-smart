#!/bin/sh
# Build and run release on a physical iOS device from a path without spaces.
# This avoids the "resource fork, Finder information, or similar detritus not allowed" codesign error
# that can occur when the project path contains spaces (e.g. "U Smart").
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="/tmp/usmart_qc_release_build"
DEVICE_ID="${1:-00008110-001059A93EF3801E}"

echo "Copying project to $BUILD_DIR (no spaces in path)..."
rm -rf "$BUILD_DIR"
cp -R "$PROJECT_DIR" "$BUILD_DIR"

echo "Building and running release on device $DEVICE_ID..."
cd "$BUILD_DIR"
flutter run --release -d "$DEVICE_ID"
