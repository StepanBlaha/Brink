import Foundation
import Security

/// Notion public-integration OAuth: authorize URL, `state` (CSRF) handling and callback parsing.
///
/// Flow: the app opens `authorizeURL` → Notion's consent screen and page picker → Notion
/// redirects to `redirectURI` (the broker's https `/callback`) → the broker 302s to
/// `brink://oauth/callback?code=…&state=…` → the app validates `state` and exchanges `code`
/// through the broker (which holds the client secret).
public struct NotionOAuth: Sendable {
    public struct Configuration: Sendable, Equatable {
        public var clientID: String
        public var brokerURL: URL
        /// The redirect URI registered in Notion's developer portal (https, served by the broker).
        public var redirectURI: URL
        /// Where the broker sends the browser back to; the app's own URL scheme.
        public var appCallbackURL: URL

        public init(clientID: String, brokerURL: URL, redirectURI: URL? = nil,
                    appCallbackURL: URL = URL(string: "brink://oauth/callback")!) {
            self.clientID = clientID
            self.brokerURL = brokerURL
            self.redirectURI = redirectURI ?? brokerURL.appendingPathComponent("callback")
            self.appCallbackURL = appCallbackURL
        }

        public var callbackScheme: String { appCallbackURL.scheme ?? "brink" }
    }

    public enum CallbackError: Error, Equatable, LocalizedError {
        case notACallback
        case stateMismatch
        case denied(String)
        case missingCode

        public var errorDescription: String? {
            switch self {
            case .notACallback: return "That link isn’t a Brink sign-in callback."
            case .stateMismatch: return "The sign-in response didn’t match this request. Please try again."
            case .denied(let reason):
                return reason == "access_denied" ? "Access wasn’t granted in Notion." : "Notion sign-in failed (\(reason))."
            case .missingCode: return "Notion didn’t return an authorization code."
            }
        }
    }

    public static let authorizeEndpoint = URL(string: "https://api.notion.com/v1/oauth/authorize")!

    public let configuration: Configuration

    public init(configuration: Configuration) {
        self.configuration = configuration
    }

    /// 32 random bytes, base64url-encoded.
    public static func makeState() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<32).map { _ in UInt8.random(in: .min ... .max) }
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public func authorizeURL(state: String) -> URL {
        var components = URLComponents(url: Self.authorizeEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: configuration.clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "owner", value: "user"),
            URLQueryItem(name: "redirect_uri", value: configuration.redirectURI.absoluteString),
            URLQueryItem(name: "state", value: state),
        ]
        return components.url!
    }

    /// True for `brink://oauth/callback…` (ignores query and a trailing slash).
    public func isCallback(_ url: URL) -> Bool {
        let expected = configuration.appCallbackURL
        guard url.scheme?.lowercased() == expected.scheme?.lowercased(),
              url.host?.lowercased() == expected.host?.lowercased() else { return false }
        func trimmed(_ path: String) -> String { path.hasSuffix("/") ? String(path.dropLast()) : path }
        return trimmed(url.path) == trimmed(expected.path)
    }

    /// Validates a callback URL against the `state` this app generated and returns the code.
    public func code(fromCallback url: URL, expectedState: String) throws -> String {
        guard isCallback(url) else { throw CallbackError.notACallback }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }

        // Constant-time-ish compare; state must match before anything else is trusted.
        guard let state = value("state"), !expectedState.isEmpty,
              Self.constantTimeEquals(state, expectedState) else { throw CallbackError.stateMismatch }
        if let error = value("error"), !error.isEmpty { throw CallbackError.denied(error) }
        guard let code = value("code"), !code.isEmpty else { throw CallbackError.missingCode }
        return code
    }

    static func constantTimeEquals(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }
}
