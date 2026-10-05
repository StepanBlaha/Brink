#!/bin/bash
# Renders the manifest templates for a published Windows release.
# Usage: windows/packaging/winget/render.sh <version> <SHA256SUMS.txt>
# Output: windows/packaging/winget/out/StepanBlaha.Brink/<version>/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")"
V="${1:?version, e.g. 0.10.0}"; SUMS="${2:?path to SHA256SUMS.txt}"
X64=$(grep "Brink-Setup-$V-x64.exe" "$SUMS" | cut -d' ' -f1 | tr a-f A-F)
ARM=$(grep "Brink-Setup-$V-arm64.exe" "$SUMS" | cut -d' ' -f1 | tr a-f A-F)
[ -n "$X64" ] && [ -n "$ARM" ] || { echo "hash missing in $SUMS" >&2; exit 1; }
OUT="out/StepanBlaha.Brink/$V"; mkdir -p "$OUT"
for f in StepanBlaha.Brink*.yaml; do
  sed -e "s/__VERSION__/$V/g" -e "s/__SHA256_X64__/$X64/" -e "s/__SHA256_ARM64__/$ARM/" \
      -e "s/__DATE__/$(date -u +%F)/" "$f" > "$OUT/$f"
done
echo "Rendered $OUT. On Windows run: winget validate --manifest $OUT"
