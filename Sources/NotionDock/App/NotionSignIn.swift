import AppKit
import AuthenticationServices
import NotionKit

/// Runs the "Connect to Notion" browser round trip with `ASWebAuthenticationSession`
/// (custom `brink` callback scheme). If the callback instead reaches the app through
/// `application(_:open:)` (e.g. the session was dismissed but the browser still followed the
/// redirect), `AppDelegate` hands it to `AppModel.handleOAuthCallback`, which uses `pendingState`.
@MainActor
final class NotionSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    let oauth: NotionOAuth
    private(set) var pendingState: String?
    private var session: ASWebAuthenticationSession?

    init(configuration: NotionOAuth.Configuration) {
        oauth = NotionOAuth(configuration: configuration)
    }

    /// Opens Notion's consent screen and returns the authorization code.
    func authorize() async throws -> String {
        session?.cancel()
        let state = NotionOAuth.makeState()
        pendingState = state
        let url = oauth.authorizeURL(state: state)

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: oauth.configuration.callbackScheme) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: error ?? ASWebAuthenticationSessionError(.canceledLogin))
                }
            }
            session.presentationContextProvider = self
            // Share cookies with the default browser so an existing Notion login is reused.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: ASWebAuthenticationSessionError(.presentationContextInvalid))
            }
        }
        session = nil
        return try consume(callbackURL)
    }

    /// Validates a callback against the pending state (single use).
    func consume(_ url: URL) throws -> String {
        defer { pendingState = nil }
        return try oauth.code(fromCallback: url, expectedState: pendingState ?? "")
    }

    func cancel() {
        session?.cancel()
        session = nil
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            NSApp.keyWindow ?? NSApp.windows.first(where: \.isVisible) ?? NSWindow()
        }
    }

    static func isUserCancel(_ error: Error) -> Bool {
        (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
    }
}
