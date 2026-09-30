// Usage (from repo root): social <out-dir> <work-dir>
import AppKit
let a = CommandLine.arguments
guard a.count >= 3 else { print("usage: social out work"); exit(1) }
let out = a[1], work = a[2]
for n in 1...6 { storyFrame(n).save(String(format: "%@/story-%02d.png", out, n)) }
for n in 3...5 { storyFrame(n, video: true).save(String(format: "%@/story-%02d-overlay.png", work, n)) }
for n in [1, 2, 6] { storyFrame(n).save(String(format: "%@/story-%02d-flat.png", work, n)) }
for n in 1...7 { carouselSlide(n).save(String(format: "%@/carousel-%02d.png", out, n)) }
xCard().save("\(out)/x-card.png")
reelCover().save("\(out)/reel-cover.png")
for (i, s) in ["Hover", "Peek + tick", "Notion-style editor", "Capture anywhere"].enumerated() { reelCaption(s).save("\(work)/cap-\(i + 1).png") }
reelHook().save("\(work)/cap-hook.png")
reelEnd().save("\(work)/cap-end.png")
