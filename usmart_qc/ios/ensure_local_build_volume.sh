#!/bin/sh
# Flutter passes BUILD_DIR=<project>/build/ios to xcodebuild, so all Mach-O ends up
# under build/. On iCloud-synced Desktop paths, codesign often fails with
# "resource fork, Finder information, or similar detritus not allowed".
# This script makes build/ a symlink to /tmp/... (local APFS) when safe to do so.
set +e

[ -n "${PROJECT_DIR}" ] || exit 0
case "$(uname -s 2>/dev/null)" in
Darwin) ;;
*) exit 0 ;;
esac

ROOT="$(cd "${PROJECT_DIR}/.." && pwd -P 2>/dev/null)" || exit 0
BUILD="${ROOT}/build"
export COPYFILE_DISABLE=1

# Only auto-redirect paths that commonly sync via iCloud.
case "$ROOT" in
*/Desktop/*) ;;
*)
  if [ "${FLUTTER_IOS_LOCAL_BUILD:-}" != "1" ]; then
    exit 0
  fi
  ;;
esac

KEY="$(printf '%s' "$ROOT" | /usr/bin/shasum -a 256 2>/dev/null | /usr/bin/awk '{print $1}')"
[ -n "$KEY" ] || KEY="$(/usr/sbin/md5 -qs "$ROOT" 2>/dev/null)"
[ -n "$KEY" ] || KEY="default"
TARGET="/tmp/usmart_qc_flutter_build_${KEY}"
/bin/mkdir -p "${TARGET}" 2>/dev/null || exit 0

if [ ! -e "${BUILD}" ]; then
  /bin/ln -s "${TARGET}" "${BUILD}" 2>/dev/null
  exit 0
fi

if [ -L "${BUILD}" ]; then
  CUR="$(/usr/bin/readlink "${BUILD}" 2>/dev/null)"
  if [ "${CUR}" = "${TARGET}" ] && [ -d "${TARGET}" ]; then
    exit 0
  fi
  if [ -d "${CUR}" ] 2>/dev/null; then
    exit 0
  fi
  /bin/rm -f "${BUILD}" 2>/dev/null
  /bin/ln -s "${TARGET}" "${BUILD}" 2>/dev/null
  exit 0
fi

if [ -d "${BUILD}" ] && [ ! -L "${BUILD}" ]; then
  case "$ROOT" in
  */Desktop/*)
    # Flutter may recreate build/ on Desktop before Xcode runs; always relocate.
    /bin/mkdir -p "${TARGET}" || exit 0
    /usr/bin/ditto --norsrc "${BUILD}" "${TARGET}" 2>/dev/null ||
      /bin/cp -RpX "${BUILD}" "${TARGET}" 2>/dev/null
    /bin/rm -rf "${BUILD}"
    /bin/ln -s "${TARGET}" "${BUILD}" 2>/dev/null
    ;;
  *)
    if [ "${FLUTTER_IOS_USE_LOCAL_BUILD:-}" = "1" ]; then
      /bin/mkdir -p "${TARGET}" || exit 0
      /usr/bin/ditto --norsrc "${BUILD}" "${TARGET}" 2>/dev/null ||
        /bin/cp -RpX "${BUILD}" "${TARGET}" 2>/dev/null
      /bin/rm -rf "${BUILD}"
      /bin/ln -s "${TARGET}" "${BUILD}" 2>/dev/null
    else
      echo >&2 "usmart_qc: for reliable iOS codesign, use: FLUTTER_IOS_USE_LOCAL_BUILD=1 flutter run   or move the repo off Desktop/iCloud."
    fi
    ;;
  esac
fi

exit 0
