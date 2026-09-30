#!/bin/zsh
# Builds every social asset. Run from the repo root: scripts/social/build.sh
set -e
cd "$(dirname "$0")/../.."
OUT=marketing/social; WORK=marketing/social/.work
mkdir -p $OUT $WORK
swiftc -O -o $WORK/social scripts/social/lib.swift scripts/social/stories.swift scripts/social/carousel.swift \
  scripts/social/cards.swift scripts/social/main.swift 2>&1 | grep -v warning || true
$WORK/social $OUT $WORK
[ "$1" = "video" ] && zsh scripts/social/video.sh
exit 0
