#!/bin/bash
# Run pod install with UTF-8 encoding (fixes CocoaPods on macOS).
# Usage: ./scripts/pod-install.sh  or  cd ios && ../scripts/pod-install.sh

set -e
cd "$(dirname "$0")/../ios"
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
pod install
