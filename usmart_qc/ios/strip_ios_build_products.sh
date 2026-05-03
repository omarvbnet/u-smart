#!/usr/bin/env bash
# Ditto-strip Mach-O under the shared iOS product dir BEFORE CocoaPods embed runs.
# Pods signs frameworks inline; phases that run after embed are too late.
set +e
export COPYFILE_DISABLE=1
PRODUCTS="${BUILT_PRODUCTS_DIR:-}"
if [ -z "$PRODUCTS" ] || [ ! -d "$PRODUCTS" ]; then
  exit 0
fi

strip_macho() {
  local f="$1"
  [ -f "$f" ] || return 0
  /usr/bin/file "$f" 2>/dev/null | /usr/bin/grep -q "Mach-O" || return 0
  local t
  t=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/ios_strip.XXXXXXXX")
  if ! /usr/bin/ditto --norsrc "$f" "$t"; then
    /bin/rm -f "$t"
    return 0
  fi
  /bin/chmod +x "$t" 2>/dev/null || true
  if ! /bin/mv "$t" "$f"; then
    /bin/rm -f "$t"
    return 0
  fi
  /usr/bin/xattr -cr "$f" 2>/dev/null || true
}

while IFS= read -r -d '' f; do
  strip_macho "$f"
done < <(/usr/bin/find "$PRODUCTS" -type f -print0 2>/dev/null)

/usr/sbin/dot_clean -m "$PRODUCTS" 2>/dev/null || true
/usr/bin/xattr -cr "$PRODUCTS" 2>/dev/null || true
exit 0
