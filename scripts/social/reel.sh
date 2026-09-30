#!/bin/zsh
# reel.mp4: hero.mp4 (29 s) cropped vertically around the notch, panning to the capture bar, with caption overlays.
set -e
cd "$(dirname "$0")/../.."
F=/opt/homebrew/bin/ffmpeg; W=marketing/social/.work
# name start end file
C=("hook 0.2 2.2 cap-hook" "cap1 2.4 5.4 cap-1" "cap2 5.7 10.5 cap-2" "cap3 10.8 18.0 cap-3" "cap4 18.6 24.6 cap-4" "end 25.2 29 cap-end")
IN=(); FG="[0:v]scale=-2:1920:flags=lanczos,crop=1080:1920:'1992-994*(st(0,clip((t-18.3)/1.2,0,1))*0+ld(0)*ld(0)*(3-2*ld(0))-(st(1,clip((t-24.2)/1.2,0,1))*0+ld(1)*ld(1)*(3-2*ld(1))))':0,format=yuv420p[b0];"
i=1
for c in $C; do
  set -- ${=c}; s=$2; e=$3
  IN+=(-loop 1 -framerate 30 -t $(( e - s + 0.1 )) -i $W/$4.png)
  if [ $1 = end ]; then fo=""; else fo=",fade=t=out:st=$(( e - s - 0.3 )):d=0.3:alpha=1"; fi
  FG+="[$i:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1${fo},setpts=PTS+$s/TB[o$i];[b$((i-1))][o$i]overlay=format=auto[b$i];"
  i=$((i+1))
done
FG+="[b$((i-1))]format=yuv420p[v]"
$F -v error -y -i website/public/assets/media/hero.mp4 $IN -filter_complex "$FG" -map "[v]" -c:v libx264 -crf 20 -preset slow \
  -maxrate 3M -bufsize 6M -pix_fmt yuv420p -movflags +faststart -an -r 30 -t 29 marketing/social/reel.mp4
ls -la marketing/social/reel.mp4
