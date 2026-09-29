import Foundation
import CoreGraphics

/// Bounds for the expanded panel, in screen terms (width x height).
public enum PanelSizeLimits {
    public static let minWidth: CGFloat = 300
    public static let maxWidth: CGFloat = 900
    public static let minHeight: CGFloat = 240

    /// Clamps to 300...900 wide and 240...`maxHeight` tall (`maxWidth` may shrink the width
    /// limit on small screens; minimums always win).
    public static func clamp(_ size: CGSize, maxWidth availableWidth: CGFloat = maxWidth, maxHeight: CGFloat) -> CGSize {
        let w = min(max(size.width, minWidth), max(minWidth, min(maxWidth, availableWidth)))
        let h = min(max(size.height, minHeight), max(minHeight, maxHeight))
        return CGSize(width: w, height: h)
    }
}

/// Per-pin expanded panel sizes persisted in a UserDefaults dictionary (`pinID -> [w, h]`).
public struct PanelSizeStore {
    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = "panelSizes") {
        self.defaults = defaults
        self.key = key
    }

    private var table: [String: [Double]] {
        defaults.dictionary(forKey: key) as? [String: [Double]] ?? [:]
    }

    /// The stored size for a pin, re-clamped to the current limits; nil means "use default".
    public func size(for pinID: String, maxWidth: CGFloat = PanelSizeLimits.maxWidth, maxHeight: CGFloat) -> CGSize? {
        guard let v = table[pinID], v.count == 2 else { return nil }
        return PanelSizeLimits.clamp(CGSize(width: v[0], height: v[1]), maxWidth: maxWidth, maxHeight: maxHeight)
    }

    @discardableResult
    public func set(_ size: CGSize, for pinID: String, maxWidth: CGFloat = PanelSizeLimits.maxWidth, maxHeight: CGFloat) -> CGSize {
        let clamped = PanelSizeLimits.clamp(size, maxWidth: maxWidth, maxHeight: maxHeight)
        var t = table
        t[pinID] = [Double(clamped.width), Double(clamped.height)]
        defaults.set(t, forKey: key)
        return clamped
    }

    public func reset(pinID: String) {
        var t = table
        t[pinID] = nil
        defaults.set(t, forKey: key)
    }

    public func hasSize(for pinID: String) -> Bool { table[pinID] != nil }
}
