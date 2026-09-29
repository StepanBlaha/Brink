#!/bin/bash
# Builds the signed Xcode variant (app + widget + Share extension) and launches it.
# The SwiftPM path (scripts/run.sh) keeps working but has no widget/share extension.
set -euo pipefail

CONFIG="${1:-Debug}"
cd "$(dirname "$0")/.."

xcodegen generate --quiet

mkdir -p build
LOG="build/xcodebuild.log"
if ! xcodebuild -project Brink.xcodeproj -scheme Brink -configuration "$CONFIG" \
    -derivedDataPath build/xcode -allowProvisioningUpdates build > "$LOG" 2>&1; then
    grep -E "error:" "$LOG" | sort -u >&2 || tail -30 "$LOG" >&2
    echo "xcodebuild failed (full log: $LOG)" >&2
    exit 1
fi

PRODUCT="build/xcode/Build/Products/$CONFIG/Brink.app"
[ -d "$PRODUCT" ] || { echo "Build failed: $PRODUCT missing" >&2; exit 1; }

pkill -x NotionDock || true
pkill -x Brink || true

rm -rf build/Brink.app
ditto "$PRODUCT" build/Brink.app
# Make sure LaunchServices / PlugInKit see the fresh extensions.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f build/Brink.app || true

open build/Brink.app
