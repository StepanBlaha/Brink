import Foundation
import Security

/// How the stored Notion credential was obtained.
public enum AuthKind: String, Codable, Sendable, Equatable {
    /// An internal integration token pasted by the user ("Advanced").
    case `internal`
    /// A public-integration OAuth access token (with an optional refresh token).
    case oauth
}

/// Non-secret facts about an OAuth connection, shown in Settings → Connection.
public struct OAuthWorkspace: Codable, Sendable, Equatable {
    public var workspaceId: String?
    public var workspaceName: String?
    /// URL string or a single emoji, as Notion returns it.
    public var workspaceIcon: String?
    public var botId: String?

    public init(workspaceId: String? = nil, workspaceName: String? = nil, workspaceIcon: String? = nil, botId: String? = nil) {
        self.workspaceId = workspaceId
        self.workspaceName = workspaceName
        self.workspaceIcon = workspaceIcon
        self.botId = botId
    }
}

/// Where `TokenStore` keeps its items. The Keychain in the app, memory in tests.
public protocol SecretBackend: Sendable {
    func set(_ data: Data, account: String) throws
    func get(account: String) -> Data?
    func remove(account: String)
}

/// Stores the Notion credential in the macOS Keychain.
///
/// The access token always lives under the original `notion-token` account, so everything that
/// only needs "the current bearer token" (`load()`) keeps working for both auth kinds.
public struct TokenStore: Sendable {
    static let accessAccount = "notion-token"
    static let refreshAccount = "notion-refresh-token"
    static let metaAccount = "notion-oauth-meta"

    private let backend: SecretBackend

    public init(backend: SecretBackend = KeychainBackend()) {
        self.backend = backend
    }

    // MARK: Access token (both kinds)

    /// Saves a pasted internal integration token, dropping any OAuth leftovers.
    public func save(_ token: String) throws {
        try backend.set(Data(token.utf8), account: Self.accessAccount)
        backend.remove(account: Self.refreshAccount)
        backend.remove(account: Self.metaAccount)
    }

    public func load() -> String? {
        backend.get(account: Self.accessAccount).flatMap { String(data: $0, encoding: .utf8) }
    }

    // MARK: OAuth

    /// Saves an OAuth connection: access token, refresh token (if any) and workspace info.
    public func saveOAuth(accessToken: String, refreshToken: String?, workspace: OAuthWorkspace) throws {
        try backend.set(Data(accessToken.utf8), account: Self.accessAccount)
        if let refreshToken, !refreshToken.isEmpty {
            try backend.set(Data(refreshToken.utf8), account: Self.refreshAccount)
        } else {
            backend.remove(account: Self.refreshAccount)
        }
        try backend.set(try JSONEncoder().encode(workspace), account: Self.metaAccount)
    }

    public func loadRefreshToken() -> String? {
        backend.get(account: Self.refreshAccount).flatMap { String(data: $0, encoding: .utf8) }
    }

    public func loadWorkspace() -> OAuthWorkspace? {
        backend.get(account: Self.metaAccount).flatMap { try? JSONDecoder().decode(OAuthWorkspace.self, from: $0) }
    }

    /// `nil` when nothing is stored.
    public var kind: AuthKind? {
        guard load() != nil else { return nil }
        return backend.get(account: Self.metaAccount) != nil ? .oauth : .internal
    }

    /// Clears every Brink credential item (access token, refresh token, workspace info).
    @discardableResult
    public func delete() -> Bool {
        backend.remove(account: Self.accessAccount)
        backend.remove(account: Self.refreshAccount)
        backend.remove(account: Self.metaAccount)
        return true
    }
}

/// Generic-password items under the app's Keychain service.
public struct KeychainBackend: SecretBackend {
    private let service: String

    public init(service: String = "cz.stepanblaha.notiondock") {
        self.service = service
    }

    private func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func set(_ data: Data, account: String) throws {
        var query = baseQuery(account)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NotionError.network("Keychain save failed (status \(status))")
        }
    }

    public func get(account: String) -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else { return nil }
        return item as? Data
    }

    public func remove(account: String) {
        SecItemDelete(baseQuery(account) as CFDictionary)
    }
}

/// Process-local backend for tests and previews.
public final class InMemorySecretBackend: SecretBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String: Data] = [:]

    public init() {}

    public func set(_ data: Data, account: String) throws {
        lock.lock(); defer { lock.unlock() }
        items[account] = data
    }

    public func get(account: String) -> Data? {
        lock.lock(); defer { lock.unlock() }
        return items[account]
    }

    public func remove(account: String) {
        lock.lock(); defer { lock.unlock() }
        items[account] = nil
    }
}
