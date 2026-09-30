import Foundation

/// The broker's token response (a pass-through of Notion's `/v1/oauth/token` fields we use).
public struct OAuthTokenResponse: Decodable, Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String?
    public let botId: String?
    public let workspaceId: String?
    public let workspaceName: String?
    public let workspaceIcon: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token", refreshToken = "refresh_token", botId = "bot_id"
        case workspaceId = "workspace_id", workspaceName = "workspace_name", workspaceIcon = "workspace_icon"
    }

    public var workspace: OAuthWorkspace {
        OAuthWorkspace(workspaceId: workspaceId, workspaceName: workspaceName, workspaceIcon: workspaceIcon, botId: botId)
    }
}

/// Talks to the Brink token-exchange broker (`broker/`), which adds the client secret.
public struct OAuthBroker: Sendable {
    public let brokerURL: URL
    public let redirectURI: URL
    private let session: URLSession

    public init(brokerURL: URL, redirectURI: URL, session: URLSession = .shared) {
        self.brokerURL = brokerURL
        self.redirectURI = redirectURI
        self.session = session
    }

    public init(configuration: NotionOAuth.Configuration, session: URLSession = .shared) {
        self.init(brokerURL: configuration.brokerURL, redirectURI: configuration.redirectURI, session: session)
    }

    public func exchange(code: String) async throws -> OAuthTokenResponse {
        try await post("token", body: ["code": code, "redirect_uri": redirectURI.absoluteString])
    }

    public func refresh(refreshToken: String) async throws -> OAuthTokenResponse {
        try await post("refresh", body: ["refresh_token": refreshToken])
    }

    private func post(_ path: String, body: [String: String]) async throws -> OAuthTokenResponse {
        var request = URLRequest(url: brokerURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 30

        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw NotionError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw NotionError.network("No HTTP response received") }
        guard (200..<300).contains(http.statusCode) else {
            struct Failure: Decodable { let error: String?; let message: String? }
            let failure = try? JSONDecoder().decode(Failure.self, from: data)
            if http.statusCode == 401 || failure?.error == "invalid_grant" { throw NotionError.unauthorized }
            if http.statusCode == 429 { throw NotionError.rateLimited }
            throw NotionError.api(code: failure?.error ?? "\(http.statusCode)",
                                  message: failure?.message ?? "Sign-in service error (HTTP \(http.statusCode))")
        }
        do {
            return try JSONDecoder().decode(OAuthTokenResponse.self, from: data)
        } catch {
            throw NotionError.decoding(String(describing: error))
        }
    }
}

/// Refreshes an expired OAuth access token at most once at a time, and skips the refresh when
/// another request already replaced the rejected token. Plug `handleUnauthorized` into
/// `NotionClient(onUnauthorized:)`.
public actor OAuthTokenRefresher {
    private let store: TokenStore
    private let broker: OAuthBroker
    private var inFlight: Task<Bool, Never>?

    public init(store: TokenStore, broker: OAuthBroker) {
        self.store = store
        self.broker = broker
    }

    public func handleUnauthorized(rejectedToken: String) async -> Bool {
        guard store.kind == .oauth else { return false }
        if let current = store.load(), current != rejectedToken { return true }
        if let inFlight { return await inFlight.value }
        let store = store, broker = broker
        let task = Task<Bool, Never> {
            guard let refreshToken = store.loadRefreshToken() else { return false }
            do {
                let tokens = try await broker.refresh(refreshToken: refreshToken)
                var workspace = store.loadWorkspace() ?? OAuthWorkspace()
                let fresh = tokens.workspace
                workspace.workspaceName = fresh.workspaceName ?? workspace.workspaceName
                workspace.workspaceIcon = fresh.workspaceIcon ?? workspace.workspaceIcon
                workspace.workspaceId = fresh.workspaceId ?? workspace.workspaceId
                workspace.botId = fresh.botId ?? workspace.botId
                try store.saveOAuth(accessToken: tokens.accessToken,
                                    refreshToken: tokens.refreshToken ?? refreshToken,
                                    workspace: workspace)
                return true
            } catch {
                return false
            }
        }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }
}
