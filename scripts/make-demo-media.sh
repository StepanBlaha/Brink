#!/bin/bash
# Turns a demo recording (scripts/record-demo.sh) into the marketing media:
#   marketing/screenshots/*.png            App Store Mac screenshots, 2880x1800, captioned
#   website/public/assets/media/hero.{mp4,webm}   20–30 s loop, 1600 px, no audio (+ hero-poster.jpg)
#   website/public/assets/media/{peek-tick,editor,capture}.{mp4,gif}   5–8 s feature clips
# Usage: scripts/make-demo-media.sh <work folder with raw.mov, times.txt, shots/>
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="${1:?work folder}"
FF=/opt/homebrew/bin/ffmpeg
FFPROBE=/opt/homebrew/bin/ffprobe
SHOTS=marketing/screenshots
MEDIA=website/public/assets/media
mkdir -p "$SHOTS" "$MEDIA"
[ -s "$WORK/raw.mov" ] || { echo "missing $WORK/raw.mov" >&2; exit 1; }

# --- Timeline: seconds from the start of raw.mov for each marker ------------------------------
# screencapture needs a moment before its first frame; LATENCY shifts the markers to match.
LATENCY="${DEMO_LATENCY:-0.5}"
t() {
    awk -v n="$1" -v lat="$LATENCY" '$1=="rec_start"{s=$2} $1==n{printf "%.2f", $2-s-lat; exit}' "$WORK/times.txt"
}
add() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", a+b}'; }
sub() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", a-b}'; }

# --- Screenshots -------------------------------------------------------------------------------
still() { # <shot name> <output name> <caption>
    if [ -s "$WORK/shots/$1.png" ]; then
        swift scripts/demo-still.swift "$WORK/shots/$1.png" "$SHOTS/$2.png" "$3"
        echo "  $SHOTS/$2.png"
    else
        echo "  (missing still $1)" >&2
    fi
}
echo "Screenshots:"
still 1-peek    01-hover-peek   "Your pages, on the edge."
still 2-tasks   02-task-panel   "Check it off. Stay in flow."
still 3-editor  03-editor       "A Notion-style editor, one hover away."
still 4-slash   04-slash-menu   "Type / for any block."
still 5-capture 05-quick-capture "Capture in under three seconds."
still 6-menubar 06-menu-bar     "In the menu bar, too."

# --- Hero loop ---------------------------------------------------------------------------------
# 16:10 crop anchored at the top (keeps the menu bar). Peek → editor → capture → menu bar (the
# task-panel segment is left out; the peek already shows a tick), sped up to land under 30 s.
CROP="crop=iw:trunc(iw*10/16/2)*2:0:0"
A1=$(sub "$(t seg-peek)" 0.6); A2=$(t seg-tasks)
B1=$(add "$(t seg-editor)" 0.05); B2=$(add "$(t seg-outro)" 1.9)
LEN=$(awk -v a="$A2" -v b="$A1" -v c="$B2" -v d="$B1" 'BEGIN{printf "%.2f", (a-b)+(c-d)}')
SPEED=$(awk -v l="$LEN" 'BEGIN{s=l/29; if (s<1) s=1; printf "%.3f", s}')
echo "Hero: $A1-$A2 + $B1-$B2 s ($LEN s at ${SPEED}x)"
part() { # <start> <end> <out>: a lossless-ish intermediate at constant 60 fps
    $FF -v error -y -ss "$1" -i "$WORK/raw.mov" -an -t "$(sub "$2" "$1")" -vf "setpts=PTS-STARTPTS,fps=60,$CROP" \
        -c:v libx264 -preset veryfast -crf 12 -pix_fmt yuv420p "$3"
}
part "$A1" "$A2" "$WORK/hero-a.mp4"
part "$B1" "$B2" "$WORK/hero-b.mp4"
$FF -v error -y -i "$WORK/hero-a.mp4" -i "$WORK/hero-b.mp4" -an -filter_complex \
    "[0:v][1:v]concat=n=2:v=1:a=0,setpts=PTS/$SPEED,fps=30,scale=1600:-2:flags=lanczos[v]" -map "[v]" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -profile:v high -movflags +faststart "$MEDIA/hero.mp4"
$FF -v error -y -i "$MEDIA/hero.mp4" -an -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 "$MEDIA/hero.webm"
POSTER_AT=$(awk -v p="$(t 1-peek)" -v s="$A1" -v k="$SPEED" 'BEGIN{printf "%.2f", (p-s)/k + 0.2}')
$FF -v error -y -ss "$POSTER_AT" -i "$MEDIA/hero.mp4" -frames:v 1 -q:v 3 "$MEDIA/hero-poster.jpg"

# --- Feature clips (real time, zoomed on the action) -------------------------------------------
clip() { # <name> <start> <duration> <speed> <crop filter>
    local name="$1" start="$2" dur="$3" speed="$4" crop="$5"
    local out_len; out_len=$(awk -v d="$dur" -v k="$speed" 'BEGIN{printf "%.2f", d/k}')
    $FF -v error -y -ss "$start" -i "$WORK/raw.mov" -an -t "$out_len" \
        -vf "setpts=PTS-STARTPTS,$crop,setpts=PTS/$speed,fps=30,scale=1200:-2:flags=lanczos" \
        -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "$MEDIA/$name.mp4"
    $FF -v error -y -ss "$(awk -v l="$out_len" 'BEGIN{printf "%.2f", l*0.62}')" -i "$MEDIA/$name.mp4" -frames:v 1 -q:v 3 "$MEDIA/$name-poster.jpg"
    $FF -v error -y -i "$MEDIA/$name.mp4" \
        -vf "fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
        "$MEDIA/$name.gif"
}
# Right half, vertically centered on the notch.
RIGHT="crop=trunc(iw*0.56/2)*2:trunc(iw*0.56*10/16/2)*2:iw-trunc(iw*0.56/2)*2:(ih-trunc(iw*0.56*10/16/2)*2)/2"
# Top center, where quick capture opens.
TOP="crop=trunc(iw*0.6/2)*2:trunc(iw*0.6*10/16/2)*2:trunc(iw*0.2):0"
clip peek-tick "$(add "$(t seg-peek)" 0.3)" 7.4 1 "$RIGHT"
EDIT_START=$(add "$(t seg-editor)" 3.6)
EDIT_LEN=$(sub "$(add "$(t 4-slash)" 1.2)" "$EDIT_START")
clip editor "$EDIT_START" "$EDIT_LEN" "$(awk -v l="$EDIT_LEN" 'BEGIN{s=l/7.8; if (s<1) s=1; printf "%.3f", s}')" "$RIGHT"
CAP_START=$(add "$(t seg-capture)" 0.2)
clip capture "$CAP_START" "$(sub "$(t seg-menubar)" "$CAP_START")" 1 "$TOP"

echo "Media:"
for f in "$MEDIA"/*; do
    printf "  %-40s %6s KB  " "$f" "$(( $(stat -f %z "$f") / 1024 ))"
    case "$f" in *.mp4|*.webm|*.gif) $FFPROBE -v error -show_entries stream=width,height:format=duration -of csv=p=0 "$f" | tr '\n' ' ';; esac
    echo
done
