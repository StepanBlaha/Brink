import Testing
import Foundation
@testable import NotionKit

private let config = NotionOAuth.Configuration(
    clientID: "client-123",
    brokerURL: URL(string: "https://brink-auth.example.workers.dev")!
)

@Suite("NotionOAuth")
struct NotionOAuthTests {
    @Test("authorize URL carries client_id, code, owner=user, redirect_uri and state")
    func authorizeURL() throws {
        let url = NotionOAuth(configuration: config).authorizeURL(state: "abc")
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.scheme == "https")
        #expect(components.host == "api.notion.com")
        #expect(components.path == "/v1/oauth/authorize")
        let items = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        #expect(items["client_id"] == "client-123")
        #expect(items["response_type"] == "code")
        #expect(items["owner"] == "user")
        #expect(items["redirect_uri"] == "https://brink-auth.example.workers.dev/callback")
        #expect(items["state"] == "abc")
    }

    @Test("state is random, URL-safe and long")
    func stateGeneration() {
        let a = NotionOAuth.makeState(), b = NotionOAuth.makeState()
        #expect(a != b)
        #expect(a.count >= 40)
        #expect(a.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    }

    @Test("valid callback returns the code")
    func parsesCallback() throws {
        let oauth = NotionOAuth(configuration: config)
        let url = URL(string: "brink://oauth/callback?code=the-code&state=s1")!
        #expect(oauth.isCallback(url))
        #expect(try oauth.code(fromCallback: url, expectedState: "s1") == "the-code")
    }

    @Test("state mismatch or missing state is rejected before the code is read")
    func rejectsBadState() {
        let oauth = NotionOAuth(configuration: config)
        #expect(throws: NotionOAuth.CallbackError.stateMismatch) {
            try oauth.code(fromCallback: URL(string: "brink://oauth/callback?code=c&state=evil")!, expectedState: "s1")
        }
        #expect(throws: NotionOAuth.CallbackError.stateMismatch) {
            try oauth.code(fromCallback: URL(string: "brink://oauth/callback?code=c")!, expectedState: "s1")
        }
        #expect(throws: NotionOAuth.CallbackError.stateMismatch) {
            try oauth.code(fromCallback: URL(string: "brink://oauth/callback?code=c&state=")!, expectedState: "")
        }
    }

    @Test("denied, missing code and foreign URLs")
    func otherCallbackErrors() {
        let oauth = NotionOAuth(configuration: config)
        #expect(throws: NotionOAuth.CallbackError.denied("access_denied")) {
            try oauth.code(fromCallback: URL(string: "brink://oauth/callback?error=access_denied&state=s1")!, expectedState: "s1")
        }
        #expect(throws: NotionOAuth.CallbackError.missingCode) {
            try oauth.code(fromCallback: URL(string: "brink://oauth/callback?state=s1")!, expectedState: "s1")
        }
        #expect(throws: NotionOAuth.CallbackError.notACallback) {
            try oauth.code(fromCallback: URL(string: "brink://pin/123?code=c&state=s1")!, expectedState: "s1")
        }
        #expect(!oauth.isCallback(URL(string: "https://oauth/callback")!))
        #expect(oauth.isCallback(URL(string: "brink://oauth/callback/?x=1")!))
    }
}

@Suite("TokenStore kinds")
struct TokenStoreKindTests {
    @Test("internal token, OAuth connection and delete")
    func kinds() throws {
        let store = TokenStore(backend: InMemorySecretBackend())
        #expect(store.kind == nil)

        try store.save("secret_internal")
        #expect(store.kind == .internal)
        #expect(store.load() == "secret_internal")
        #expect(store.loadRefreshToken() == nil)

        let ws = OAuthWorkspace(workspaceId: "w1", workspaceName: "Acme", workspaceIcon: "🚀", botId: "b1")
        try store.saveOAuth(accessToken: "ntn_access", refreshToken: "ntn_refresh", workspace: ws)
        #expect(store.kind == .oauth)
        #expect(store.load() == "ntn_access")
        #expect(store.loadRefreshToken() == "ntn_refresh")
        #expect(store.loadWorkspace() == ws)

        // Pasting a token afterwards drops the OAuth leftovers.
        try store.save("secret_again")
        #expect(store.kind == .internal)
        #expect(store.loadRefreshToken() == nil)
        #expect(store.loadWorkspace() == nil)

        try store.saveOAuth(accessToken: "a", refreshToken: "r", workspace: ws)
        store.delete()
        #expect(store.kind == nil)
        #expect(store.load() == nil && store.loadRefreshToken() == nil && store.loadWorkspace() == nil)
    }
}

@Suite("OAuth refresh on 401", .serialized)
struct OAuthRefreshTests {
    private static let tokenJSON = """
    {"access_token":"new-access","token_type":"bearer","refresh_token":"new-refresh","bot_id":"b1",
     "workspace_id":"w1","workspace_name":"Acme","workspace_icon":null,"owner":{"type":"user"}}
    """

    @Test("401 → broker /refresh → retry with the new token")
    func refreshesAndRetries() async throws {
        OAuthStubProtocol.reset()
        let seen = RequestLog()
        OAuthStubProtocol.queue { req in
            seen.append(req)
            return .init(status: 401, headers: [:], body: Data(#"{"code":"unauthorized","message":"expired"}"#.utf8))
        }
        OAuthStubProtocol.queue { req in
            seen.append(req)
            return .init(status: 200, headers: [:], body: Data(Self.tokenJSON.utf8))
        }
        OAuthStubProtocol.queue { req in
            seen.append(req)
            return .init(status: 200, headers: [:], body: Data(DataSourceFixtures.schemaResponse.utf8))
        }

        let store = TokenStore(backend: InMemorySecretBackend())
        try store.saveOAuth(accessToken: "old-access", refreshToken: "old-refresh",
                            workspace: OAuthWorkspace(workspaceName: "Acme"))
        let broker = OAuthBroker(configuration: config, session: OAuthStubProtocol.session)
        let refresher = OAuthTokenRefresher(store: store, broker: broker)
        let client = NotionClient(tokenProvider: { store.load() }, session: OAuthStubProtocol.session,
                                  onUnauthorized: { await refresher.handleUnauthorized(rejectedToken: $0) })

        let schema = try await client.retrieveDataSource("ds-1")
        #expect(schema.id == "ds-1")

        let requests = seen.all
        #expect(requests.count == 3)
        #expect(requests[0].value(forHTTPHeaderField: "Authorization") == "Bearer old-access")
        #expect(requests[1].url?.absoluteString == "https://brink-auth.example.workers.dev/refresh")
        #expect(requests[1].value(forHTTPHeaderField: "Authorization") == nil, "The app never sends a secret")
        #expect(requests[2].value(forHTTPHeaderField: "Authorization") == "Bearer new-access")
        #expect(store.load() == "new-access")
        #expect(store.loadRefreshToken() == "new-refresh")
        #expect(store.loadWorkspace()?.workspaceName == "Acme")
    }

    @Test("internal tokens are not refreshed; 401 surfaces as unauthorized")
    func internalTokenNoRefresh() async throws {
        OAuthStubProtocol.reset()
        OAuthStubProtocol.queue { _ in .init(status: 401, headers: [:], body: Data()) }
        let store = TokenStore(backend: InMemorySecretBackend())
        try store.save("secret_x")
        let refresher = OAuthTokenRefresher(store: store, broker: OAuthBroker(configuration: config, session: OAuthStubProtocol.session))
        let client = NotionClient(tokenProvider: { store.load() }, session: OAuthStubProtocol.session,
                                  onUnauthorized: { await refresher.handleUnauthorized(rejectedToken: $0) })
        await #expect(throws: NotionError.unauthorized) {
            _ = try await client.retrieveDataSource("ds-1")
        }
    }

    @Test("failed refresh surfaces as unauthorized without looping")
    func failedRefresh() async throws {
        OAuthStubProtocol.reset()
        OAuthStubProtocol.queue { _ in .init(status: 401, headers: [:], body: Data()) }
        OAuthStubProtocol.queue { _ in .init(status: 400, headers: [:], body: Data(#"{"error":"invalid_grant"}"#.utf8)) }
        let store = TokenStore(backend: InMemorySecretBackend())
        try store.saveOAuth(accessToken: "a", refreshToken: "r", workspace: OAuthWorkspace())
        let refresher = OAuthTokenRefresher(store: store, broker: OAuthBroker(configuration: config, session: OAuthStubProtocol.session))
        let client = NotionClient(tokenProvider: { store.load() }, session: OAuthStubProtocol.session,
                                  onUnauthorized: { await refresher.handleUnauthorized(rejectedToken: $0) })
        await #expect(throws: NotionError.unauthorized) {
            _ = try await client.retrieveDataSource("ds-1")
        }
        #expect(store.load() == "a")
    }
}

private final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var requests: [URLRequest] = []
    func append(_ r: URLRequest) { lock.lock(); requests.append(r); lock.unlock() }
    var all: [URLRequest] { lock.lock(); defer { lock.unlock() }; return requests }
}

/// Own stub (not `MockURLProtocol`) so these tests can't interleave with `NotionClientTests`,
/// which run concurrently in a different suite.
final class OAuthStubProtocol: URLProtocol, @unchecked Sendable {
    typealias Response = MockURLProtocol.Response
    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [(URLRequest) -> Response?] = []

    static func reset() { lock.lock(); handlers = []; lock.unlock() }
    static func queue(_ handler: @escaping (URLRequest) -> Response?) { lock.lock(); handlers.append(handler); lock.unlock() }

    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OAuthStubProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let handler = Self.handlers.isEmpty ? nil : Self.handlers.removeFirst()
        Self.lock.unlock()
        guard let handler, let response = handler(request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let http = HTTPURLResponse(url: request.url!, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: response.headers)!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
