#!/bin/bash
# Workaround Desktop/iCloud: Mach-O binaries can carry resource forks that pass
# `xattr -cr` but still break codesign — `ditto --norsrc` clears them reliably.
export COPYFILE_DISABLE=1

strip_flutter_engine() {
  local xc="${FLUTTER_ROOT}/bin/cache/artifacts/engine/ios/Flutter.xcframework"
  if [[ ! -d "$xc" ]]; then
    return 0
  fi
  find "$xc" -type f -name Flutter -print0 2>/dev/null |
    while IFS= read -r -d '' eng; do
      local tx
      tx="$(mktemp /tmp/flutter_eng_strip.XXXXXXXX)"
      /usr/bin/ditto --norsrc "$eng" "$tx" && chmod +x "$tx" && /bin/mv "$tx" "$eng"
    done
}

strip_app_binaries_in() {
  local root="$1"
  [[ -d "$root" ]] || return 0
  find "$root" -path '*/App.framework/App' -type f -print0 2>/dev/null |
    while IFS= read -r -d '' f; do
      local t
      t="$(mktemp /tmp/flutter_app_strip.XXXXXXXX)"
      /usr/bin/ditto --norsrc "$f" "$t" && chmod +x "$t" && /bin/mv "$t" "$f"
    done
}

FL_IOS="${PROJECT_DIR}/../build/ios/${CONFIGURATION}-iphoneos"
strip_flutter_engine
strip_app_binaries_in "${FLUTTER_APPLICATION_PATH}/.dart_tool/flutter_build"
mkdir -p "${FL_IOS}" 2>/dev/null
/usr/sbin/dot_clean -m "${FL_IOS}" 2>/dev/null || true
xattr -cr "${FL_IOS}" 2>/dev/null || true
xattr -cr "${FLUTTER_APPLICATION_PATH}" 2>/dev/null || true
xattr -cr "${FLUTTER_APPLICATION_PATH}/build" 2>/dev/null || true
xattr -cr "${BUILT_PRODUCTS_DIR}" 2>/dev/null || true
xattr -cr "${FLUTTER_ROOT}/bin/cache/artifacts/engine/ios" 2>/dev/null || true

flutter_backend() {
  /bin/sh "$FLUTTER_ROOT/packages/flutter_tools/bin/xcode_backend.sh" build
}

strip_app_binaries_in "${FLUTTER_APPLICATION_PATH}/.dart_tool/flutter_build"
strip_app_binaries_in "${FL_IOS}"
flutter_backend
rc=$?

if [[ "$rc" -ne 0 ]]; then
  strip_app_binaries_in "${FLUTTER_APPLICATION_PATH}/.dart_tool/flutter_build"
  strip_app_binaries_in "${FL_IOS}"
  flutter_backend
  rc=$?
fi

exit "$rc"
