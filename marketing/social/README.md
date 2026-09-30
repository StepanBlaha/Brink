# Brink social assets

Demo data only (dusk wallpaper, sample pages). Regenerate everything with `scripts/social/build.sh video`
(stills), then `scripts/social/reel.sh` (reel). Text is rendered with Swift/AppKit, then composed with ffmpeg.

## Instagram Stories (1080x1920, 250 px top and bottom kept free)
| File | Use |
|---|---|
| story-01.png | Hook: "I opened Notion 40x a day just to tick one task." |
| story-02.png | "So I built a notch for it." (notch strip crop, screenshot 01) |
| story-03.png | "Hover to peek. Tick in place." (task panel crop, screenshot 02) |
| story-04.png | "A Notion-style editor, one hover away." (editor crop, screenshot 03) |
| story-05.png | "Capture from any app. Option Shift Space." (quick capture crop, screenshot 05) |
| story-06.png | CTA: icon, "Free and open source.", brinknotch.site, empty rounded area for a link sticker |
| story-video.mp4 | 1080x1920, 15.2 s, H.264, no audio: the six frames with zoom and crossfades, frames 3-5 play the site clips |

## Reel / TikTok / Shorts
| File | Use |
|---|---|
| reel.mp4 | 1080x1920, 29 s, H.264, faststart, no audio (add trending audio in-app). hero.mp4 cropped to the notch, pans to the capture bar, captions on the beats, end card |
| reel-cover.png | 1080x1920 cover frame |

## Carousel (IG and LinkedIn, 1080x1350)
| File | Use |
|---|---|
| carousel-01.png | Cover: name and tagline |
| carousel-02.png | The problem |
| carousel-03.png ... 06.png | Features: peek, tick, editor, capture |
| carousel-07.png | CTA: free, MIT, macOS 14+, brinknotch.site, not-affiliated note |

## X / LinkedIn
| File | Use |
|---|---|
| x-card.png | 1600x900 link card, "Your pages, on the edge." |
| hero-still.png | 1600x1000 clean still from hero.mp4 (editor open, no caption) |

`brink-square-1080.mp4` was already in this folder and is not produced by these scripts.
