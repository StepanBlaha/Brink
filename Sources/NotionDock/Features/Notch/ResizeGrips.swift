import SwiftUI
import AppKit

enum ResizeHandle {
    /// The far edge (opposite the screen edge): changes depth only.
    case farEdge
    /// The far corners: `cornerA` is the first along the edge (top of a side edge, left of
    /// the top edge), `cornerB` the other. They change depth and length.
    case cornerA, cornerB
}

/// `began` carries the drag's translation so far (SwiftUI global space, y down): the gesture
/// only starts after `minimumDistance`, and the controller backs that out of its start point.
enum ResizeEvent { case began(translation: CGSize), changed, ended }

/// Invisible resize hit areas on the expanded panel's far edge (6pt) and far corners. The
/// drag itself is measured by `DockController` from the global mouse position (the window
/// can move under the cursor while resizing), so the gestures here only report phases.
struct ResizeGrips: View {
    let edge: DockEdge
    /// The expanded body rect, window-local.
    let rect: CGRect
    let onResize: (ResizeHandle, ResizeEvent) -> Void
    let onReset: () -> Void

    private let strip: CGFloat = 6
    private let corner: CGFloat = 18

    var body: some View {
        ZStack {
            grip(.farEdge, frame: edgeFrame, cursor: edge == .top ? .resizeUpDown : .resizeLeftRight)
            grip(.cornerA, frame: cornerFrame(second: false), cursor: Self.diagonal(nwse: nwse(second: false)))
            grip(.cornerB, frame: cornerFrame(second: true), cursor: Self.diagonal(nwse: nwse(second: true)))
        }
    }

    private var edgeFrame: CGRect {
        switch edge {
        case .right: return CGRect(x: rect.minX, y: rect.minY + corner, width: strip, height: rect.height - 2 * corner)
        case .left: return CGRect(x: rect.maxX - strip, y: rect.minY + corner, width: strip, height: rect.height - 2 * corner)
        case .top: return CGRect(x: rect.minX + corner, y: rect.maxY - strip, width: rect.width - 2 * corner, height: strip)
        }
    }

    private func cornerFrame(second: Bool) -> CGRect {
        switch edge {
        case .right: return CGRect(x: rect.minX, y: second ? rect.maxY - corner : rect.minY, width: corner, height: corner)
        case .left: return CGRect(x: rect.maxX - corner, y: second ? rect.maxY - corner : rect.minY, width: corner, height: corner)
        case .top: return CGRect(x: second ? rect.maxX - corner : rect.minX, y: rect.maxY - corner, width: corner, height: corner)
        }
    }

    /// Whether the corner's outward diagonal runs from top-left to bottom-right.
    private func nwse(second: Bool) -> Bool {
        switch edge {
        case .right: return !second       // top-left / bottom-left
        case .left: return second         // top-right / bottom-right
        case .top: return second          // bottom-left / bottom-right
        }
    }

    private static func diagonal(nwse: Bool) -> NSCursor {
        let name = nwse ? "_windowResizeNorthWestSouthEastCursor" : "_windowResizeNorthEastSouthWestCursor"
        let sel = NSSelectorFromString(name)
        if NSCursor.responds(to: sel), let cursor = NSCursor.perform(sel)?.takeUnretainedValue() as? NSCursor {
            return cursor
        }
        return .crosshair
    }

    private func grip(_ handle: ResizeHandle, frame: CGRect, cursor: NSCursor) -> some View {
        Grip(handle: handle, cursor: cursor, onResize: onResize, onReset: onReset)
            .frame(width: max(frame.width, 1), height: max(frame.height, 1))
            .position(x: frame.midX, y: frame.midY)
    }
}

private struct Grip: View {
    let handle: ResizeHandle
    let cursor: NSCursor
    let onResize: (ResizeHandle, ResizeEvent) -> Void
    let onReset: () -> Void

    @State private var inside = false
    @State private var dragging = false
    @State private var pushed = false

    /// Keeps the resize cursor pushed exactly while the pointer is over the grip or dragging.
    private func syncCursor() {
        let want = inside || dragging
        if want, !pushed { cursor.push(); pushed = true }
        else if !want, pushed { NSCursor.pop(); pushed = false }
    }

    var body: some View {
        Color.clear
            .contentShape(Rectangle())
            .onHover { inside = $0; syncCursor() }
            .onDisappear { inside = false; dragging = false; syncCursor() }
            .gesture(
                DragGesture(minimumDistance: 2, coordinateSpace: .global)
                    .onChanged { value in
                        if !dragging { dragging = true; syncCursor(); onResize(handle, .began(translation: value.translation)) }
                        onResize(handle, .changed)
                    }
                    .onEnded { _ in
                        dragging = false
                        syncCursor()
                        onResize(handle, .ended)
                    }
            )
            .onTapGesture(count: 2) { onReset() }
    }
}
