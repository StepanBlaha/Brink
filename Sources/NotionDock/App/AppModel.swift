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

    private(set) var hasToken: Bool
    var connectionStatus: ConnectionStatus = .idle

    init() {
        let tokenStore = tokenStore
        client = NotionClient(tokenProvider: { tokenStore.load() })
        hasToken = tokenStore.load() != nil
    }

    func saveToken(_ token: String) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try tokenStore.save(trimmed)
            hasToken = true
            connectionStatus = .idle
        } catch {
            connectionStatus = .error(error.localizedDescription)
        }
    }

    func removeToken() {
        tokenStore.delete()
        hasToken = false
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
