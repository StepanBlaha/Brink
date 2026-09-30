#!/bin/zsh
# story-video.mp4 (1080x1920, ~15 s): gentle zoom + crossfades; frames 3-5 play the site clips in the card.
set -e
cd "$(dirname "$0")/../.."
F=/opt/homebrew/bin/ffmpeg; W=marketing/social/.work; M=website/public/assets/media
D=(2.7 2.7 3.2 3.2 3.2 2.7)
zoom() { echo "scale=2160:3840,zoompan=z='1+0.045*on/$1':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,format=yuv420p"; }
still() { echo "-loop 1 -framerate 30 -t $2 -i $1"; }
clip() { echo "-ss $2 -t $3 -i $M/$1.mp4"; }
# inputs: 0 flat1, 1 flat2, 2 clip peek, 3 ovl3, 4 clip editor, 5 ovl4, 6 clip capture, 7 ovl5, 8 flat6
$F -v error -y $(still $W/story-01-flat.png 2.7) $(still $W/story-02-flat.png 2.7) \
  $(clip peek-tick 2.5 3.2) $(still $W/story-03-overlay.png 3.2) $(clip editor 3 3.2) $(still $W/story-04-overlay.png 3.2) \
  $(clip capture 1.2 3.2) $(still $W/story-05-overlay.png 3.2) $(still $W/story-06-flat.png 2.7) -filter_complex "
[0:v]$(zoom 81)[a1];[1:v]$(zoom 81)[a2];[8:v]$(zoom 81)[a6];
[2:v]setpts=PTS-STARTPTS,crop=923:750:277:0,scale=960:780,pad=1080:1920:60:720:black,format=rgba[c3];[c3][3:v]overlay=format=auto,$(zoom 96)[a3];
[4:v]setpts=PTS-STARTPTS,crop=923:750:277:0,scale=960:780,pad=1080:1920:60:720:black,format=rgba[c4];[c4][5:v]overlay=format=auto,$(zoom 96)[a4];
[6:v]setpts=PTS-STARTPTS,crop=923:750:150:0,scale=960:780,pad=1080:1920:60:720:black,format=rgba[c5];[c5][7:v]overlay=format=auto,$(zoom 96)[a5];
[a1][a2]xfade=transition=fade:duration=0.5:offset=2.2[x1];[x1][a3]xfade=transition=fade:duration=0.5:offset=4.4[x2];
[x2][a4]xfade=transition=fade:duration=0.5:offset=7.1[x3];[x3][a5]xfade=transition=fade:duration=0.5:offset=9.8[x4];
[x4][a6]xfade=transition=fade:duration=0.5:offset=12.5,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 20 -preset slow \
  -pix_fmt yuv420p -movflags +faststart -an -r 30 marketing/social/story-video.mp4
ls -la marketing/social/story-video.mp4
