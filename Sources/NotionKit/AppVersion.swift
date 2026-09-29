import Foundation

/// Parses the repo-root `VERSION` file ("0.9.0 (1)") that scripts/bundle.sh stamps into Info.plist.
public struct AppVersion: Equatable, Sendable {
    public let marketing: String
    public let build: String

    public init(marketing: String, build: String) {
        self.marketing = marketing
        self.build = build
    }

    /// Accepts "0.9.0 (1)" or a bare "0.9.0" (build defaults to "1"). Returns nil for anything else.
    public init?(parsing text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: " ", maxSplits: 1).map(String.init)
        guard let version = parts.first, !version.isEmpty,
              version.split(separator: ".", omittingEmptySubsequences: false).count.isBetween(2, 3),
              version.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }),
              !version.hasPrefix("."), !version.hasSuffix("."), !version.contains("..") else { return nil }
        var build = "1"
        if parts.count == 2 {
            let raw = parts[1].trimmingCharacters(in: .whitespaces)
            guard raw.hasPrefix("("), raw.hasSuffix(")") else { return nil }
            build = String(raw.dropFirst().dropLast())
            guard !build.isEmpty, build.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        }
        self.marketing = version
        self.build = build
    }

    public var display: String { "\(marketing) (\(build))" }

    /// The running app's version, read from Info.plist (fed by MARKETING_VERSION / VERSION).
    public static func current(bundle: Bundle = .main) -> AppVersion {
        let info = bundle.infoDictionary
        return AppVersion(marketing: info?["CFBundleShortVersionString"] as? String ?? "0.0.0",
                          build: info?["CFBundleVersion"] as? String ?? "0")
    }
}

private extension Int {
    func isBetween(_ lo: Int, _ hi: Int) -> Bool { self >= lo && self <= hi }
}
