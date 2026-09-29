import SwiftUI
import NotionKit

/// Everything geometric the notch needs to know, snapshotted by `DockController` into
/// `NotchState`. Shared by the SwiftUI root (drawing) and the controller (hot zones), so both
/// always agree on where each phase's shape is.
struct NotchLayout: Equatable {
    var edge: DockEdge = .right
    var windowSize: CGSize = .zero
    var pinCount = 0
    /// Expanded panel size in screen terms (width x height).
    var expandedSize: CGSize = .zero
    /// Window-local position along the edge: the shape midpoint (or the leading end when
    /// `anchorLeading`, i.e. sitting right of a hardware notch).
    var anchor: CGFloat = 0
    var anchorLeading = false
    /// Side edges only: where the expanded panel is centered (follows the clicked icon).
    var expandedCenter: CGFloat = 0
    /// Hardware-notch height added on top of strip/expanded when the shape is merged with it.
    var topInset: CGFloat = 0
    var mergedWidth: CGFloat?
    var pillStyle: PillStyle = .line

    func metrics(for phase: NotchPhase) -> Theme.Notch.Metrics {
        switch phase {
        case .resting: return restingMetrics(style: pillStyle)
        case .strip: return Theme.Notch.stripMetrics(pinCount: pinCount, topInset: topInset)
        case .expanded: return Theme.Notch.expandedMetrics(edge: edge, size: expandedSize, topInset: topInset)
        }
    }

    func restingMetrics(style: PillStyle) -> Theme.Notch.Metrics {
        Theme.Notch.restingMetrics(edge: edge, style: style, topInset: topInset, mergedWidth: mergedWidth)
    }

    /// The resting pill's hover target is the classic line size whatever the pill style is,
    /// so a Dot or Hidden pill is as easy to reach.
    var hotRestingMetrics: Theme.Notch.Metrics { restingMetrics(style: .line) }

    func center(for phase: NotchPhase, metrics m: Theme.Notch.Metrics? = nil) -> CGFloat {
        if phase == .expanded, edge != .top { return expandedCenter }
        let length = (m ?? metrics(for: phase)).length
        return NotchGeometry.center(anchor: anchor, leading: anchorLeading, length: length)
    }

    func bodyRect(for phase: NotchPhase) -> CGRect {
        let m = metrics(for: phase)
        return NotchGeometry.bodyRect(edge: edge.kind, windowSize: windowSize, depth: m.depth, length: m.length, center: center(for: phase, metrics: m))
    }

    func boundingRect(for phase: NotchPhase, metrics m: Theme.Notch.Metrics? = nil) -> CGRect {
        let m = m ?? metrics(for: phase)
        return EdgeNotchShape.boundingRect(windowSize: windowSize, metrics: m, center: center(for: phase, metrics: m), edge: edge)
    }
}

/// Maximum expanded size (screen terms) the current window can hold: 900 wide, and as tall
/// as the window allows, minus a margin.
extension NotchLayout {
    var maxPanelSize: CGSize {
        let sideways = edge != .top
        let depthRoom = (sideways ? windowSize.width : windowSize.height) - topInset
        let lengthRoom: CGFloat
        if sideways {
            lengthRoom = windowSize.height - 16
        } else if anchorLeading {
            lengthRoom = windowSize.width - anchor - 8
        } else {
            lengthRoom = 2 * min(anchor, windowSize.width - anchor) - 16
        }
        return sideways ? CGSize(width: depthRoom, height: lengthRoom) : CGSize(width: lengthRoom, height: depthRoom)
    }
}

extension NotchLayout {
    /// Window-space rect of the hover-peek card: beside the strip on side edges, below it
    /// (centered on the hovered icon) on the top edge.
    func peekRect(peekFrame: CGRect, itemCount: Int) -> CGRect {
        let scale = Settings.shared.size.metricsScale
        let stripDepth = metrics(for: .strip).depth
        let height = PeekTooltip.estimatedHeight(itemCount: itemCount)
        switch edge {
        case .top:
            let width = min(220 * scale, windowSize.width - 12)
            let x = min(max(peekFrame.midX - width / 2, 4), max(windowSize.width - width - 4, 4))
            return CGRect(x: x, y: stripDepth + 8, width: width, height: height)
        case .left, .right:
            let width = min(220 * scale, windowSize.width - stripDepth - 12)
            let x = edge == .right ? windowSize.width - stripDepth - 8 - width : stripDepth + 8
            let y = min(max(peekFrame.midY - height / 2, 4), max(windowSize.height - height - 4, 4))
            return CGRect(x: x, y: y, width: width, height: height)
        }
    }
}
