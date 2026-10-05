import Foundation
import Observation
import NotionKit

/// App-wide model: owns the Keychain-backed token, the Notion client, and the pin store.
@MainActor
@Observable
final class AppModel {
    enum ConnectionStatus: Equatable {
        case idle
        case testing
        case connected(count: Int)
        case error(String)
    }

    let tokenStore = TokenStore()
    let pinStore = PinStore()
    let cache = Cache()
    let writeQueue = WriteQueue()
    let client: NotionClient
    /// Apple Notes through Apple Events (a fake in demo mode). Never touched until the user
    /// connects Notes in Settings or pins a note.
    let notes: NotesProviding
    private(set) var notesAccess: NotesAccessStatus = .unknown
    private(set) var isRequestingNotesAccess = false

    private(set) var hasToken: Bool
    /// `.oauth` after "Connect to Notion", `.internal` for a pasted token, `nil` when disconnected.
    private(set) var authKind: AuthKind?
    /// Workspace name/icon from the OAuth token response (Settings → Connection).
    private(set) var workspace: OAuthWorkspace?
    private(set) var isSigningIn = false
    var connectionStatus: ConnectionStatus = .idle

    /// Non-nil only when `OAuthConfig` is filled in; the UI hides "Connect to Notion" otherwise.
    let signIn: NotionSignIn?
    private let broker: OAuthBroker?
    var oauthAvailable: Bool { signIn != nil }

    init() {
        if DemoMode.isActive {
            // Demo mode: an in-process fake Notion; the Keychain is never read or written.
            client = NotionClient(tokenProvider: { "demo-token" }, session: DemoNotionServer.session)
            notes = DemoNotesProvider()
            notesAccess = .allowed
            hasToken = true
            signIn = nil
            broker = nil
            DemoMode.seedPins(into: pinStore)
            return
        }
        notes = AppleNotesService(runner: OSAScriptRunner())
        let tokenStore = tokenStore
        if let configuration = OAuthConfig.configuration {
            let broker = OAuthBroker(configuration: configuration)
            let refresher = OAuthTokenRefresher(store: tokenStore, broker: broker)
            self.broker = broker
            signIn = NotionSignIn(configuration: configuration)
            client = NotionClient(tokenProvider: { tokenStore.load() },
                                  onUnauthorized: { await refresher.handleUnauthorized(rejectedToken: $0) })
        } else {
            broker = nil
            signIn = nil
            client = NotionClient(tokenProvider: { tokenStore.load() })
        }
        hasToken = tokenStore.load() != nil
        reloadAuthState()
    }

    // MARK: - Apple Notes

    /// Re-reads the Automation consent without prompting (Settings appears, app activates).
    func refreshNotesAccess() async {
        guard !DemoMode.isActive else { return }
        notesAccess = await NotesPermission.current()
    }

    /// Shows macOS's "Brink wants to control Notes" prompt (first time) and updates the status.
    func connectNotes() async {
        guard !DemoMode.isActive, !isRequestingNotesAccess else { return }
        isRequestingNotesAccess = true
        defer { isRequestingNotesAccess = false }
        notesAccess = await NotesPermission.request()
    }

    private func reloadAuthState() {
        authKind = tokenStore.kind
        workspace = authKind == .oauth ? tokenStore.loadWorkspace() : nil
    }

    // MARK: - Connect to Notion (OAuth)

    /// Opens Notion's consent screen (with its page picker), exchanges the code via the broker
    /// and stores the tokens. A user cancel is silent.
    func connectWithNotion() async {
        guard !DemoMode.isActive, let signIn, !isSigningIn else { return }
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let code = try await signIn.authorize()
            try await finishSignIn(code: code)
        } catch where NotionSignIn.isUserCancel(error) {
            connectionStatus = .idle
        } catch {
            connectionStatus = .error(error.localizedDescription)
        }
    }

    /// `brink://oauth/callback…` delivered to the app delegate instead of the auth session.
    func handleOAuthCallback(_ url: URL) {
        guard let signIn, signIn.pendingState != nil else { return }
        signIn.cancel()
        Task {
            do {
                try await finishSignIn(code: try signIn.consume(url))
            } catch {
                connectionStatus = .error(error.localizedDescription)
            }
        }
    }

    private func finishSignIn(code: String) async throws {
        guard let broker else { return }
        connectionStatus = .testing
        let tokens = try await broker.exchange(code: code)
        try tokenStore.saveOAuth(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
                                 workspace: tokens.workspace)
        hasToken = true
        reloadAuthState()
        await testConnection()
    }

    /// Clears every Keychain entry (access token, refresh token, workspace info).
    func disconnect() {
        removeToken()
    }

    func saveToken(_ token: String) {
        guard !DemoMode.isActive else { return }
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try tokenStore.save(trimmed)
            hasToken = true
            reloadAuthState()
            connectionStatus = .idle
        } catch {
            connectionStatus = .error(error.localizedDescription)
        }
    }

    func removeToken() {
        guard !DemoMode.isActive else { return }
        signIn?.cancel()
        tokenStore.delete()
        hasToken = false
        reloadAuthState()
        connectionStatus = .idle
    }

    func testConnection() async {
        connectionStatus = .testing
        do {
            let results = try await client.search(query: nil)
            connectionStatus = .connected(count: results.count)
        } catch {
            connectionStatus = .error(error.localizedDescription)
        }
    }
}
