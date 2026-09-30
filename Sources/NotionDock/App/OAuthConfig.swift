import Foundation
import NotionKit

/// "Connect to Notion" (public-integration OAuth) settings.
///
/// Fill in both values after creating the public integration and deploying `broker/`
/// (see broker/README.md). While either is a placeholder, the app hides "Connect to Notion"
/// and offers only the internal-integration token paste.
enum OAuthConfig {
    /// Notion developer portal → your public integration → OAuth client ID.
    static let clientID = "SET_NOTION_CLIENT_ID"
    /// The deployed Cloudflare Worker from `broker/`, no trailing slash.
    static let brokerURLString = "https://brink-auth.<you>.workers.dev"

    /// Register exactly this in the developer portal's "Redirect URIs": the broker's
    /// `/callback`, which bounces the browser to `brink://oauth/callback`.
    static var redirectURI: URL? { brokerURL?.appendingPathComponent("callback") }
    static let appCallbackURL = URL(string: "brink://oauth/callback")!

    static var brokerURL: URL? {
        guard !brokerURLString.contains("<"), let url = URL(string: brokerURLString),
              url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    static var isConfigured: Bool {
        !clientID.isEmpty && !clientID.hasPrefix("SET_") && brokerURL != nil
    }

    /// `nil` until both placeholders are replaced.
    static var configuration: NotionOAuth.Configuration? {
        guard isConfigured, let brokerURL else { return nil }
        return NotionOAuth.Configuration(clientID: clientID, brokerURL: brokerURL,
                                         redirectURI: redirectURI, appCallbackURL: appCallbackURL)
    }
}
