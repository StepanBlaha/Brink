#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

pkill -x NotionDock || true

./scripts/bundle.sh debug

open build/NotionDock.app
