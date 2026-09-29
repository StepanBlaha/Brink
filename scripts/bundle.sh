#!/bin/bash
set -euo pipefail

CONFIG="${1:-release}"
SCRATCH_PATH="${SWIFT_SCRATCH_PATH:-.build}"

cd "$(dirname "$0")/.."

# VERSION holds "<marketing> (<build>)", e.g. "0.9.0 (1)".
VERSION_LINE="$(head -n1 VERSION)"
MARKETING_VERSION="$(echo "$VERSION_LINE" | sed -E 's/^([0-9.]+).*/\1/')"
BUILD_NUMBER="$(echo "$VERSION_LINE" | sed -nE 's/.*\(([0-9]+)\).*/\1/p')"
BUILD_NUMBER="${BUILD_NUMBER:-1}"

swift build -c "$CONFIG" --scratch-path "$SCRATCH_PATH"

APP_DIR="build/NotionDock.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
BIN_PATH="$SCRATCH_PATH/$CONFIG/NotionDock"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$BIN_PATH" "$MACOS_DIR/NotionDock"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>NotionDock</string>
    <key>CFBundleIdentifier</key>
    <string>cz.stepanblaha.notiondock</string>
    <key>CFBundleName</key>
    <string>Brink</string>
    <key>CFBundleDisplayName</key>
    <string>Brink</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>NSHumanReadableCopyright</key>
    <string>© 2026 Stepan Blaha. Not affiliated with Notion Labs, Inc.</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$MARKETING_VERSION</string>
    <key>CFBundleVersion</key>
    <string>$BUILD_NUMBER</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
</dict>
</plist>
PLIST

mkdir -p "$APP_DIR/Contents/Resources"
cp branding/AppIcon.icns "$APP_DIR/Contents/Resources/AppIcon.icns"
cp legal/*.md "$APP_DIR/Contents/Resources/"

codesign --force --sign - "$APP_DIR"

echo "Bundled $APP_DIR"
