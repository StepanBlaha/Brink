import Foundation
import CoreGraphics

/// Which screen edge the notch hangs from.
public enum NotchEdge: String, Sendable, CaseIterable {
    case left, right, top
}

/// Pure geometry for the single notch window. Coordinates are window-local with a top-left
/// origin. "depth" is the extent perpendicular to the screen edge, "length" the extent along
/// it, and "center" the position of the shape's midpoint along the edge (y for left/right, x
/// for top).
public enum NotchGeometry {
    /// The shape's body rect (no flares) inside the window.
    public static func bodyRect(edge: NotchEdge, windowSize: CGSize, depth: CGFloat, length: CGFloat, center: CGFloat) -> CGRect {
        switch edge {
        case .right: return CGRect(x: windowSize.width - depth, y: center - length / 2, width: depth, height: length)
        case .left: return CGRect(x: 0, y: center - length / 2, width: depth, height: length)
        case .top: return CGRect(x: center - length / 2, y: 0, width: length, height: depth)
        }
    }

    /// The shape's bounding rect including the flare bulge along the screen edge.
    public static func boundingRect(edge: NotchEdge, windowSize: CGSize, depth: CGFloat, length: CGFloat, flare: CGFloat, center: CGFloat) -> CGRect {
        let body = bodyRect(edge: edge, windowSize: windowSize, depth: depth, length: length, center: center)
        switch edge {
        case .right, .left: return body.insetBy(dx: 0, dy: -flare)
        case .top: return body.insetBy(dx: -flare, dy: 0)
        }
    }

    /// Center along the edge for a shape of `length`. With `leading`, `anchor` is where the
    /// shape's leading end sits (it grows away from a hardware notch); otherwise `anchor` is
    /// the midpoint.
    public static func center(anchor: CGFloat, leading: Bool, length: CGFloat) -> CGFloat {
        leading ? anchor + length / 2 : anchor
    }

    /// Screen frame (AppKit, bottom-left origin) of the notch window. Side edges use
    /// `visible` and are vertically centered; the top edge uses the full `frame` (above the
    /// menu bar) and is positioned so `topAnchorX` (screen x) lies inside the window.
    public static func windowFrame(edge: NotchEdge, frame: CGRect, visible: CGRect, size: CGSize, topAnchorX: CGFloat, topLeading: Bool, leadMargin: CGFloat = 30) -> CGRect {
        switch edge {
        case .left: return CGRect(x: visible.minX, y: visible.midY - size.height / 2, width: size.width, height: size.height)
        case .right: return CGRect(x: visible.maxX - size.width, y: visible.midY - size.height / 2, width: size.width, height: size.height)
        case .top:
            let want = topLeading ? topAnchorX - leadMargin : topAnchorX - size.width / 2
            let x = min(max(want, frame.minX), max(frame.minX, frame.maxX - size.width))
            return CGRect(x: x, y: frame.maxY - size.height, width: size.width, height: size.height)
        }
    }
}
