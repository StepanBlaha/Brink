import SwiftUI
import NotionKit

/// A pure-black shape hugging a screen edge: a body of `depth` × `length` with convex
/// rounded far corners, and concave "flared" corners where it meets the screen edge —
/// like the top corners of a MacBook's hardware notch. All geometry is built from cubic
/// tangent arcs.
///
/// Coordinates are window-local with a top-left origin (SwiftUI's standard convention):
/// `center` is the shape's midpoint along the screen edge — measured from the top of the
/// hosting view for left/right, from its left for the top edge. The top edge is the right
/// edge's path rotated a quarter turn, so the flares run along the top of the screen.
struct EdgeNotchShape: Shape {
    var depth: CGFloat
    var length: CGFloat
    var cornerRadius: CGFloat
    var flare: CGFloat
    var center: CGFloat
    let edge: DockEdge

    typealias Quad = AnimatablePair<CGFloat, AnimatablePair<CGFloat, AnimatablePair<CGFloat, CGFloat>>>

    var animatableData: AnimatablePair<CGFloat, Quad> {
        get {
            AnimatablePair(depth, AnimatablePair(length, AnimatablePair(cornerRadius, AnimatablePair(flare, center))))
        }
        set {
            depth = newValue.first
            length = newValue.second.first
            cornerRadius = newValue.second.second.first
            flare = newValue.second.second.second.first
            center = newValue.second.second.second.second
        }
    }

    func path(in rect: CGRect) -> Path {
        // Trace in a "right edge" frame; the top edge swaps axes (virtual width = rect height).
        let vrect = edge == .top ? CGRect(x: 0, y: 0, width: rect.height, height: rect.width) : rect
        let rect = vrect
        let half = max(length, 0) / 2
        let top = center - half
        let bottom = center + half
        let cr = max(0, min(cornerRadius, min(max(depth, 0), half)))
        let fl = max(0, min(flare, half))
        let d = max(depth, cr)

        let edgeX = rect.maxX
        let farX = max(rect.minX, edgeX - d)

        // Flares need horizontal room next to the far corner rounding.
        let flare = min(fl, max(0, d - cr))

        // Traced for the right edge (edge side = maxX), then mirrored for the left edge.
        // Tangent arcs keep each fillet's circle on the correct side: the flares are
        // concave (circle outside the body), the far corners convex.
        var p = Path()
        p.move(to: CGPoint(x: edgeX, y: top - flare))
        p.addArc(tangent1End: CGPoint(x: edgeX, y: top), tangent2End: CGPoint(x: farX, y: top), radius: flare)
        p.addArc(tangent1End: CGPoint(x: farX, y: top), tangent2End: CGPoint(x: farX, y: bottom), radius: cr)
        p.addArc(tangent1End: CGPoint(x: farX, y: bottom), tangent2End: CGPoint(x: edgeX, y: bottom), radius: cr)
        p.addArc(tangent1End: CGPoint(x: edgeX, y: bottom), tangent2End: CGPoint(x: edgeX, y: bottom + flare), radius: flare)
        p.addLine(to: CGPoint(x: edgeX, y: bottom + flare))
        p.closeSubpath()

        switch edge {
        case .right:
            return p
        case .left:
            // Mirror horizontally within `rect` so the flared/edge side faces the left screen edge.
            return p.applying(CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: rect.minX + rect.maxX, ty: 0))
        case .top:
            // (vx, vy) -> (sx, sy) = (vy, vw - vx): the edge (vx = vw) lands on y = 0.
            return p.applying(CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: rect.width))
        }
    }

    /// The shape's window-local bounding rect (top-left origin), including the flare bulge.
    /// Used for hit-testing / mouse pass-through rather than for drawing.
    static func boundingRect(windowSize: CGSize, metrics: Theme.Notch.Metrics, center: CGFloat, edge: DockEdge) -> CGRect {
        NotchGeometry.boundingRect(
            edge: edge.kind, windowSize: windowSize,
            depth: max(metrics.depth, metrics.corner), length: metrics.length,
            flare: metrics.flare, center: center
        )
    }
}
