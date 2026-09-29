import Foundation

/// The resting pill's look.
public enum PillStyle: String, CaseIterable, Sendable {
    case hidden, dot, line, percent

    public var displayName: String {
        switch self {
        case .hidden: return "Hidden"
        case .dot: return "Dot"
        case .line: return "Line"
        case .percent: return "Percent"
        }
    }

    /// Resolves the stored style, migrating the old `restingPillHidden` boolean: a stored
    /// style wins; otherwise `legacyHidden == true` becomes `.hidden`, anything else `.line`.
    public static func resolve(stored: String?, legacyHidden: Bool?) -> PillStyle {
        if let stored, let style = PillStyle(rawValue: stored) { return style }
        return legacyHidden == true ? .hidden : .line
    }
}

/// Text for the "Percent" pill.
public enum PillLabel {
    /// "7/12" (fraction) or "58%".
    public static func text(done: Int, total: Int, asFraction: Bool) -> String {
        guard total > 0 else { return asFraction ? "0/0" : "0%" }
        if asFraction { return "\(done)/\(total)" }
        return "\(Int((Double(done) / Double(total) * 100).rounded()))%"
    }
}

extension PinSummary {
    /// Summed (done, total) across summaries; nil when there are no to-dos at all.
    public static func progressCounts(_ summaries: [PinSummary]) -> (done: Int, total: Int)? {
        let total = summaries.reduce(0) { $0 + $1.total }
        guard total > 0 else { return nil }
        return (summaries.reduce(0) { $0 + $1.doneCount }, total)
    }
}
