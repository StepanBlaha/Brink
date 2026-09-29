import Foundation

/// External destinations used by the About window and the Help entries.
enum Links {
    // TODO: replace with the real site once brink.example is registered.
    static let website = URL(string: "https://brink.example")!
    // TODO: point at the real help page.
    static let help = URL(string: "https://brink.example/help")!
    // TODO: replace with the real support address.
    static let feedbackEmail = "hello@brink.example"
    static var feedback: URL {
        URL(string: "mailto:\(feedbackEmail)?subject=Brink%20feedback")!
    }
    static let notionIntegrations = URL(string: "https://www.notion.so/profile/integrations")!

    /// True while the website links are still placeholders, so legal pages open in-app instead.
    static var websiteIsPlaceholder: Bool { website.host?.hasSuffix(".example") ?? true }
}
