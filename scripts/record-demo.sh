#!/bin/bash
# Records Brink's marketing media in DEMO MODE (fake sample data only; never your Notion).
#   1. builds build/Brink.app (no launch), 2. writes the demo trigger file,
#   3. launches the app, which runs a scripted timeline with a fake cursor over a fake desktop,
#   4. records the main display (screencapture -v) and takes stills when the app asks for them,
#   5. hands the raw capture to scripts/make-demo-media.sh (screenshots, videos, GIFs).
# Needs Screen Recording permission for the terminal running this. Don't touch the mouse or
# keyboard while it records (about a minute). Usage: scripts/record-demo.sh [--skip-build]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SCRIPT_NAME="${DEMO_SCRIPT:-full}"

if [ "${1:-}" != "--skip-build" ]; then
    ./scripts/run-xcode.sh --build-only
fi

# Screen Recording check: a still of the main display must work.
if ! screencapture -x -m /tmp/brink-rec-check.png 2>/dev/null || [ ! -s /tmp/brink-rec-check.png ]; then
    echo "screencapture failed: grant Screen Recording to this terminal first." >&2
    exit 1
fi

WORK="$(mktemp -d /tmp/brink-demo.XXXXXX)"
MARKERS="$WORK/markers"
mkdir -p "$MARKERS" "$WORK/shots"
echo "Work folder: $WORK"

TRIGGER="$HOME/Library/Application Support/NotionDock/demo-mode.json"
mkdir -p "$(dirname "$TRIGGER")"
WAS_RUNNING=0
if pgrep -x Brink >/dev/null || pgrep -x NotionDock >/dev/null; then WAS_RUNNING=1; fi
pkill -x Brink || true
pkill -x NotionDock || true
sleep 1

cleanup() {
    rm -f "$TRIGGER"
    [ -n "${REC_PID:-}" ] && kill "$REC_PID" 2>/dev/null || true
}
trap cleanup EXIT

printf '{"script": "%s", "markerDirectory": "%s"}\n' "$SCRIPT_NAME" "$MARKERS" > "$TRIGGER"
open "$ROOT/build/Brink.app"

# The app sets up its backdrop and warms its caches, then says "ready".
for _ in $(seq 1 600); do [ -e "$MARKERS/shot-ready" ] && break; sleep 0.1; done
[ -e "$MARKERS/shot-ready" ] || { echo "Brink never became ready (demo mode not triggered?)" >&2; exit 1; }

now() { python3 -c 'import time; print(f"{time.time():.3f}")'; }
# screencapture -v only writes a playable file when its -V duration runs out (signals discard
# the recording), so it records a fixed length; the app keeps its backdrop up until it ends.
REC_SECONDS="${DEMO_SECONDS:-60}"
screencapture -v -V "$REC_SECONDS" -x "$WORK/raw.mov" &
REC_PID=$!
REC_START="$(now)"
echo "rec_start $REC_START" > "$WORK/times.txt"
sleep 1.5
touch "$MARKERS/shot-go"
echo "go $(now)" >> "$WORK/times.txt"

# Serve the app's requests: shot-<name> → a still (or, for seg-*, just a timestamp).
SEEN=" "
while true; do
    for marker in "$MARKERS"/shot-*; do
        [ -e "$marker" ] || continue
        name="${marker##*/shot-}"
        case "$name" in ready|go|*-done) continue ;; esac
        case "$SEEN" in *" $name "*) continue ;; esac
        SEEN="$SEEN$name "
        echo "$name $(now)" >> "$WORK/times.txt"
        case "$name" in
            done) ;;
            seg-*) ;;
            *) screencapture -x -m "$WORK/shots/$name.png"; touch "$MARKERS/shot-$name-done" ;;
        esac
    done
    case "$SEEN" in *" done "*) break ;; esac
    if ! pgrep -x Brink >/dev/null; then echo "Brink quit early" >&2; break; fi
    sleep 0.05
done

wait "$REC_PID" 2>/dev/null || true
REC_PID=""
touch "$MARKERS/shot-done-done"
for _ in $(seq 1 50); do pgrep -x Brink >/dev/null || break; sleep 0.1; done
pkill -x Brink 2>/dev/null || true
rm -f "$TRIGGER"
echo "Recorded $WORK/raw.mov"

./scripts/make-demo-media.sh "$WORK"

if [ "$WAS_RUNNING" = 1 ]; then open "$ROOT/build/Brink.app"; fi
