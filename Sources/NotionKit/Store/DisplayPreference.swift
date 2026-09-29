import Foundation
import CoreGraphics

/// A screen as far as display selection cares.
public struct ScreenInfo: Equatable, Sendable {
    public var name: String
    public var frame: CGRect
    public init(name: String, frame: CGRect) { self.name = name; self.frame = frame }
}

/// Which display the notch lives on.
public enum DisplayPreference: Equatable, Sendable {
    case main
    case mouse
    case named(name: String, frame: CGRect)

    /// Stored form: `main`, `mouse`, or `screen:<name>\t<x>,<y>,<w>,<h>`.
    public var stored: String {
        switch self {
        case .main: return "main"
        case .mouse: return "mouse"
        case .named(let name, let f): return "screen:\(name)\t\(f.origin.x),\(f.origin.y),\(f.size.width),\(f.size.height)"
        }
    }

    public init(stored: String?) {
        guard let stored else { self = .main; return }
        if stored == "mouse" { self = .mouse; return }
        if stored.hasPrefix("screen:") {
            let body = stored.dropFirst("screen:".count)
            let parts = body.split(separator: "\t", maxSplits: 1, omittingEmptySubsequences: false)
            let name = String(parts.first ?? "")
            var frame = CGRect.zero
            if parts.count == 2 {
                let n = parts[1].split(separator: ",").compactMap { Double($0) }
                if n.count == 4 { frame = CGRect(x: n[0], y: n[1], width: n[2], height: n[3]) }
            }
            self = .named(name: name, frame: frame)
            return
        }
        self = .main
    }

    /// Index into `screens` the notch should use. `screens[0]` is the primary (menu bar)
    /// display. Named screens match by name (a matching frame breaks ties between identical
    /// models), then by frame alone, and fall back to the primary display.
    public func resolve(screens: [ScreenInfo], mouse: CGPoint) -> Int? {
        guard !screens.isEmpty else { return nil }
        switch self {
        case .main: return 0
        case .mouse: return screens.firstIndex { $0.frame.contains(mouse) } ?? 0
        case .named(let name, let frame):
            let byName = screens.indices.filter { screens[$0].name == name }
            if let exact = byName.first(where: { screens[$0].frame == frame }) { return exact }
            if let first = byName.first { return first }
            return screens.firstIndex { $0.frame == frame } ?? 0
        }
    }
}
