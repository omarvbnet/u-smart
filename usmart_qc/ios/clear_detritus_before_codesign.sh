#!/bin/sh
# Strip Finder/iCloud extended attributes from the built app before codesign.
set +e
export COPYFILE_DISABLE=1

FL_IOS="${PROJECT_DIR}/../build/ios/${CONFIGURATION}-iphoneos"
APPB="${TARGET_BUILD_DIR}/${WRAPPER_NAME}"

/usr/sbin/dot_clean -m "${TARGET_BUILD_DIR}" 2>/dev/null || true
/usr/sbin/dot_clean -m "${FL_IOS}" 2>/dev/null || true
/usr/bin/xattr -cr "${TARGET_BUILD_DIR}" 2>/dev/null || true
/usr/bin/xattr -cr "${FL_IOS}" 2>/dev/null || true
/usr/bin/xattr -cr "${APPB}" 2>/dev/null || true

strip_macho() {
  f="$1"
  t="/tmp/usmart_ditto.$$.$RANDOM"
  if /usr/bin/ditto --norsrc "$f" "$t" 2>/dev/null; then
    /bin/chmod +x "$t" 2>/dev/null || true
    /bin/mv "$t" "$f"
  else
    /bin/rm -f "$t" 2>/dev/null || true
  fi
}

if [ -d "${APPB}/Frameworks" ]; then
  /usr/bin/find "${APPB}/Frameworks" -print0 2>/dev/null | while IFS= read -r -d '' p; do
    /usr/bin/xattr -c "$p" 2>/dev/null || true
  done

  /usr/bin/find "${APPB}/Frameworks" -type f -print0 2>/dev/null | while IFS= read -r -d '' f; do
    if /usr/bin/file "$f" 2>/dev/null | /usr/bin/grep -q "Mach-O"; then
      strip_macho "$f"
    fi
  done

  /usr/bin/xattr -cr "${APPB}/Frameworks" 2>/dev/null || true
fi

if [ -f "${APPB}/Runner" ]; then
  strip_macho "${APPB}/Runner"
fi

/usr/bin/xattr -cr "${APPB}" 2>/dev/null || true
exit 0
