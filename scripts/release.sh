#!/bin/bash
# Builds a Release Brink.app (with widget + Share extension) and zips it for GitHub Releases.
# Output: dist/Brink-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(cut -d' ' -f1 VERSION)
xcodegen generate --quiet
xcodebuild -project Brink.xcodeproj -scheme Brink -configuration Release \
  -derivedDataPath build/release -allowProvisioningUpdates build | tail -2

APP="build/release/Build/Products/Release/Brink.app"
mkdir -p dist
rm -f "dist/Brink-$VERSION.zip"
ditto -c -k --keepParent "$APP" "dist/Brink-$VERSION.zip"
echo "Built dist/Brink-$VERSION.zip"
echo "Publish: gh release create v$VERSION dist/Brink-$VERSION.zip --title \"Brink $VERSION\" --notes-file CHANGELOG.md"
echo "Homebrew: set version \"$VERSION\" and sha256 \"$(shasum -a 256 "dist/Brink-$VERSION.zip" | cut -d' ' -f1)\" in ~/Developer/personal/homebrew-tap/Casks/brink.rb, then commit and push"
