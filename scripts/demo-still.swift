// Turns a raw full-screen capture into an App Store Mac screenshot (2880x1800) with a caption.
// Usage: swift scripts/demo-still.swift <in.png> <out.png> "<caption>"
// The capture is scaled to fill the width and anchored at the top (the fake menu bar stays);
// a display taller than 16:10 loses a strip at the bottom, a wider one is letterboxed with the
// wallpaper's colors. The caption is white SF Pro on the dusk gradient, bottom center.
// (Swift, not ffmpeg drawtext: the Homebrew ffmpeg here is built without libfreetype.)
import AppKit

let args = CommandLine.arguments
guard args.count >= 4, let source = NSImage(contentsOfFile: args[1]),
      let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: demo-still.swift in.png out.png caption\n".data(using: .utf8)!)
    exit(1)
}
let width = 2880, height = 1800
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let canvas = NSRect(x: 0, y: 0, width: width, height: height)
NSGradient(colors: [NSColor(srgbRed: 0.36, green: 0.42, blue: 0.62, alpha: 1),
                    NSColor(srgbRed: 0.62, green: 0.52, blue: 0.66, alpha: 1),
                    NSColor(srgbRed: 0.93, green: 0.66, blue: 0.56, alpha: 1)])!.draw(in: canvas, angle: -70)

let srcW = CGFloat(cg.width), srcH = CGFloat(cg.height)
var scale = CGFloat(width) / srcW
if srcH * scale < CGFloat(height) { scale = CGFloat(height) / srcH }
let drawW = srcW * scale, drawH = srcH * scale
let drawRect = NSRect(x: (CGFloat(width) - drawW) / 2, y: CGFloat(height) - drawH, width: drawW, height: drawH)
NSGraphicsContext.current?.imageInterpolation = .high
NSGraphicsContext.current?.cgContext.draw(cg, in: drawRect)

let caption = args[3]
let font = NSFont.systemFont(ofSize: 76, weight: .semibold)
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
shadow.shadowBlurRadius = 24
shadow.shadowOffset = NSSize(width: 0, height: -4)
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .shadow: shadow,
                                            .paragraphStyle: paragraph, .kern: -0.6]
let size = (caption as NSString).size(withAttributes: attrs)
(caption as NSString).draw(in: NSRect(x: 0, y: 118, width: CGFloat(width), height: size.height + 10), withAttributes: attrs)
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: args[2]))
